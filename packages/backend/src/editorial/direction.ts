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

export interface DirectionResult {
  direction: DirectionLabel;
  scope: string[];
  note: string;
  model: string;
  receiptId: number;
  reused: boolean;
}

const DirectionSchema = z.object({
  direction: z.enum(["bullish", "bearish", "neutral", "none"]).catch("none"),
  scope: z.array(z.string().max(40)).max(3).catch([]),
  note: z.string().max(40).catch(""),
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
  return { direction: res.data.direction, scope: sanitizeScope(res.data.scope), note: res.data.note.trim(), model: res.model, receiptId: res.receiptId, reused: res.reused };
}
