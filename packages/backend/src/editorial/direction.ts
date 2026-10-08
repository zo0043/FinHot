// 事件方向步：只对已入选事件跑一次模型，输出「事件内在方向 + 受影响板块（受控词表）」。
// 判断的是事件性质（利好谁/利空谁），不是指数预测——回测（scripts/backtest.ts）用它 × market_daily
// 算命中率。方向失败不拖垮主流程：告警进日志，文章照常入库（没有方向数据的文章透出时不显示方向）。
import { z } from "zod";
import { SECTOR_ALIAS_GUIDE, SECTOR_BY_KEY } from "@aihot/industry/sectors";
import { sql } from "../db.ts";
import { chatJson } from "../providers/llm.ts";
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
  // 只用于输出质量（为什么选这个窗口），不落库。
  horizon_reason: z.string().max(100).catch(""),
});

export interface DirectionInput {
  title: string;
  summary: string;
  category?: string | null;
  tags?: readonly string[];
  sourceName?: string;
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

/** 只读 SQL 预填 scope（P5 历史相似检索也会用）：按板块 key 找日频数据。 */
export async function directionForArticle(articleId: string): Promise<{ direction: DirectionLabel | null; scope: string[] } | null> {
  const [row] = await sql<{ direction: DirectionLabel | null; scope: string[] | null }[]>`SELECT direction, scope FROM analyses WHERE article_id = ${articleId} ORDER BY id DESC LIMIT 1`;
  return row ? { direction: row.direction, scope: row.scope ?? [] } : null;
}

export async function judgeDirection(input: DirectionInput, opts: { attemptTag?: string; timeoutMs?: number; promptVersion: string; subject?: string }): Promise<DirectionResult> {
  const model = await modelFor("direction");
  const version = opts.promptVersion;
  const system = promptText("directions", { sectorGuide: SECTOR_ALIAS_GUIDE });
  const res = await chatJson({
    model,
    purpose: "direction_article",
    subject: opts.subject ?? "direction:adhoc",
    promptVersion: version,
    system,
    user: JSON.stringify({ title: input.title, summary: input.summary.slice(0, 400), category: input.category ?? null, tags: input.tags ?? [], source: input.sourceName ?? null }),
    schema: DirectionSchema,
    temperature: 0,
    maxTokens: 300,
    timeoutMs: opts.timeoutMs ?? 30_000,
    attemptTag: opts.attemptTag,
  });
  return { direction: res.data.direction, scope: sanitizeScope(res.data.scope), note: res.data.note.trim(), horizon: res.data.primary_horizon, confidence: res.data.confidence, model: res.model, receiptId: res.receiptId, reused: res.reused };
}
