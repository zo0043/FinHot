// 事件方向步：只对已入选事件跑一次模型，输出「事件内在方向 + 受影响板块（受控词表）」。
// 判断的是事件性质（利好谁/利空谁），不是指数预测——回测（scripts/backtest.ts）用它 × market_daily
// 算命中率。方向失败不拖垮主流程：告警进日志，文章照常入库（没有方向数据的文章透出时不显示方向）。
import { z } from "zod";
import type { PolicyStage } from "@aihot/contracts/site";
import { SECTOR_ALIAS_GUIDE, SECTOR_BY_KEY } from "@aihot/industry/sectors";
import { sql } from "../db.ts";
import { chatJson, ModelOutputError } from "../providers/llm.ts";
import { promptText } from "./prompts.ts";
import { modelFor } from "./models.ts";

export type DirectionLabel = "bullish" | "bearish" | "neutral" | "none";
export type DirectionHorizon = "t1" | "t3" | "t5";

export interface DirectionResult {
  direction: DirectionLabel;
  scope: string[];
  note: string;
  /** v2（0041）：主判定窗口，相对事件公布后首个交易日 T0 的 T+1/T+3/T+5；缺失/非法 → null。 */
  horizon: DirectionHorizon | null;
  /** v2（0041）：0-100 整数置信度；缺失/非法 → null。验收是 ≥95% 新预测有值，不是 100%，所以容错不拒绝。 */
  confidence: number | null;
  /** W3（0042）：政策生命周期阶段；仅 policy_regulation 事件有值，非政策事件强制 null；缺失/非法 → null（拿不准不猜）。 */
  policy_stage: PolicyStage | null;
  model: string;
  receiptId: number;
  reused: boolean;
}

export const DirectionSchema = z.object({
  direction: z.enum(["bullish", "bearish", "neutral", "none"]).catch("none"),
  scope: z.array(z.string().max(40)).max(3).catch([]),
  note: z.string().max(40).catch(""),
  // v2：horizon/confidence 宽松校验——缺失/非法 → null 容错（不 reject：验收 ≥95% 而非 100%，
  // 坏输出不能把整条预测拖成 failed）。
  // .nullish().catch(null).default(null)：与下面 confidence 同一写法（zod 4.6.5 里裸 .catch(null) 对非空输出类型
  // 过不了类型检查）；语义不变：缺失/显式 null/非法 → null，合法 t1/t3/t5 原样通过。
  primary_horizon: z.enum(["t1", "t3", "t5"]).nullish().catch(null).default(null),
  // 模型偶尔把整数写成字符串（"68"）或空值；coerce 收下合法数字串，null/空串/非法一律归 null（Number(null)=0 会误判成 0 分，先归一成 null）。
  // .default(null)：key 整体缺失时 zod 4 跳过属性 schema 直接留 undefined，default 把「缺失」也归一成 null（契约：缺失/非法 → null）。
  confidence: z.preprocess(
    (v) => (v == null || v === "" ? null : v),
    z.coerce.number().int().min(0).max(100).nullish().catch(null).default(null),
  ),
  // W3（0042）：policy_stage 受控词表；缺失/显式 null/非法（中文值、大小写、词表外）→ null，不 reject（拿不准不猜，不拖整条预测）。
  policy_stage: z.enum(["draft", "release", "interpretation", "details", "pilot", "execution"]).nullish().catch(null).default(null),
  // 只用于输出质量（为什么选这个窗口），不落库。
  horizon_reason: z.string().max(100).catch(""),
});

export interface DirectionInput {
  title: string;
  summary: string;
  category?: string | null;
  tags?: readonly string[];
  sourceName?: string;
  /** 结构步判定的事件类型：policy_stage 仅 policy_regulation 事件透出，其余恒 null。 */
  itemType?: string | null;
}

/** 只保留受控词表里的 key（模型爱自由发挥，这一层挡回去），最多 3 个、保序去重。 */
export function sanitizeScope(raw: readonly string[]): string[] {
  return [...new Set(raw.filter((k) => SECTOR_BY_KEY.has(k)))].slice(0, 3);
}

export const DIRECTION_LABELS: Record<DirectionLabel, string> = { bullish: "偏多", bearish: "偏空", neutral: "中性", none: "未判断" };

// 用户面方向文案（飞书卡片 / bark / web 方向展示共用）：只有 bullish/bearish/neutral 三个值有文案。
export const DIRECTION_USER_LABELS: Record<"bullish" | "bearish" | "neutral", string> = { bullish: "利好", bearish: "利空", neutral: "中性" };

/**
 * 用户面方向透出闸门（硬约束 A7：只有 selected 条目才带方向；台账里的反事实预测永不出现在用户面）。
 * 未判断（none/null）或未知值一律归 null（不展示方向行）。
 */
export function publicDirection(direction: string | null | undefined): "bullish" | "bearish" | "neutral" | null {
  return direction === "bullish" || direction === "bearish" || direction === "neutral" ? direction : null;
}

/** 用户面方向行：「利好 · 板块：半导体/算力、AI 应用/软件」；scope 是受控词表 key，映射成板块名，未知 key 原样保留；不展示时返回 null。 */
export function directionDisplay(direction: string | null | undefined, scope: readonly string[] = []): string | null {
  const dir = publicDirection(direction);
  if (!dir) return null;
  const names = scope.map((k) => SECTOR_BY_KEY.get(k)?.label ?? k).filter((n) => n !== "");
  return names.length > 0 ? `${DIRECTION_USER_LABELS[dir]} · 板块：${names.join("、")}` : DIRECTION_USER_LABELS[dir];
}

/** 用户面政策阶段闸门（与 publicDirection 同纪律）：只透受控词表内的值，其余（含旧数据）归 null（不展示阶段徽章）。 */
export function publicPolicyStage(stage: string | null | undefined): PolicyStage | null {
  return stage === "draft" || stage === "release" || stage === "interpretation" || stage === "details" || stage === "pilot" || stage === "execution" ? stage : null;
}

/** 只读 SQL 预填 scope（P5 历史相似检索也会用）：按板块 key 找日频数据。 */
export async function directionForArticle(articleId: string): Promise<{ direction: DirectionLabel | null; scope: string[] } | null> {
  const [row] = await sql<{ direction: DirectionLabel | null; scope: string[] | null }[]>`SELECT direction, scope FROM analyses WHERE article_id = ${articleId} ORDER BY id DESC LIMIT 1`;
  return row ? { direction: row.direction, scope: row.scope ?? [] } : null;
}

export async function judgeDirection(input: DirectionInput, opts: { attemptTag?: string; timeoutMs?: number; promptVersion: string; subject?: string }): Promise<DirectionResult | null> {
  const model = await modelFor("direction");
  const version = opts.promptVersion;
  const system = promptText("directions", { sectorGuide: SECTOR_ALIAS_GUIDE });
  const user = JSON.stringify({ title: input.title, summary: input.summary.slice(0, 400), category: input.category ?? null, tags: input.tags ?? [], source: input.sourceName ?? null });
  const subject = opts.subject ?? "direction:adhoc";
  const call = (attemptTag: string | undefined) => chatJson({
    model,
    purpose: "direction_article",
    subject,
    promptVersion: version,
    system,
    user,
    schema: DirectionSchema,
    temperature: 0,
    // 1024：deepseek-v4.1-flash 等带 reasoning 的模型会先消耗推理 token，300 会被吃满导致 content 为空（2026-10-16 实测）
    maxTokens: 1024,
    timeoutMs: opts.timeoutMs ?? 60_000,
    attemptTag,
  });
  let res: Awaited<ReturnType<typeof call>>;
  try {
    res = await call(opts.attemptTag);
  } catch (error) {
    // T4.3（W3）单次重试：解析失败（非法 JSON / 契约不可用，ModelOutputError；回执已被标记 failed）
    // → 换 attemptTag 后缀 -r2 重调一次（新 logical key，回执为新调用）；其他错误（预算/DB/网关）不在此重试。
    if (!(error instanceof ModelOutputError)) throw error;
    console.log(JSON.stringify({ level: "warn", msg: "direction 首次输出不可用，单次重试（attemptTag -r2）", subject, error: String(error).slice(0, 300) }));
    try {
      res = await call(opts.attemptTag ? `${opts.attemptTag}-r2` : "r2");
    } catch (retryError) {
      if (retryError instanceof ModelOutputError) {
        // 仍失败：结果保持 null 并记日志（失败不拖垮主流程，文章照常入库）。
        console.log(JSON.stringify({ level: "warn", msg: "direction 重试后输出仍不可用，结果保持 null", subject, error: String(retryError).slice(0, 300) }));
        return null;
      }
      throw retryError;
    }
  }
  // 非 policy_regulation 事件强制 null（阶段只对政策/监管动作有意义，即使模型给了值）。
  const policy_stage = input.itemType === "policy_regulation" ? res.data.policy_stage : null;
  return { direction: res.data.direction, scope: sanitizeScope(res.data.scope), note: res.data.note.trim(), horizon: res.data.primary_horizon, confidence: res.data.confidence, policy_stage, model: res.model, receiptId: res.receiptId, reused: res.reused };
}
