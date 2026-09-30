// market_daily 的写入与读取（database/migrations/0039_market_direction.sql）。
//   写入：market.daily cron（worker 每个交易日 15:35 北京时间）拉东财行情落库；非交易日的返回按 f86 判掉。
//   读取：日报盘面、Bark 卡片与 P4 回测都从这里取——「事件方向 + 当时市场反应」的因果链靠它闭合。
import { beijingDate } from "@aihot/contracts/time";
import { sql } from "../db.ts";
import { SECTORS } from "@aihot/industry/sectors";
import { fetchQuotes, toSecid } from "./eastmoney.ts";

export interface MarketRow {
  trade_date: string;
  index_key: string;
  close: number | null;
  prev_close: number | null;
  pct: number | null;
}

/** 行情 → market_daily 行。secid 反过来找回 index_key，认不出的 secid（比如预热期的 BK 代码）跳过。 */
export function rowsFromQuotes(quotes: { secid: string; price: number; prevClose: number | null; pct: number | null }[], tradeDate: string): MarketRow[] {
  const bySecid = new Map(SECTORS.map((s) => [toSecid(s.indexKey), s.indexKey]));
  const rows: MarketRow[] = [];
  for (const q of quotes) {
    const indexKey = bySecid.get(q.secid);
    if (!indexKey) continue;
    rows.push({ trade_date: tradeDate, index_key: indexKey, close: q.price, prev_close: q.prevClose, pct: q.pct });
  }
  return rows;
}

export interface SyncSummary {
  tradeDate: string;
  written: number;
  skipped: boolean;
  reason?: string;
}

/** 交易日本次同步。幂等（ON CONFLICT 更新），重复跑不会写重复行。 */
export async function syncMarketDaily(now = new Date()): Promise<SyncSummary> {
  const quotes = await fetchQuotes(SECTORS.map((s) => toSecid(s.indexKey)));
  if (!quotes.length) return { tradeDate: beijingDate(now), written: 0, skipped: true, reason: "接口没有返回任何行情" };
  // f86 是行情时间戳：非交易日返回的是上一个收盘，按它定 trade_date（worker 挂两天补拉时尤其需要）。
  const at = Math.max(...quotes.map((q) => q.at ?? 0));
  if (!at) return { tradeDate: beijingDate(now), written: 0, skipped: true, reason: "接口没给行情时间戳" };
  const tradeDate = beijingDate(at * 1000);
  const rows = rowsFromQuotes(quotes, tradeDate);
  if (!rows.length) return { tradeDate, written: 0, skipped: true, reason: "返回的 secid 不在板块词表里（BK 代码可能变了）" };
  for (const row of rows) {
    await sql`
      INSERT INTO market_daily (trade_date, index_key, close, prev_close, pct)
      VALUES (${row.trade_date}::date, ${row.index_key}, ${row.close}, ${row.prev_close}, ${row.pct})
      ON CONFLICT (trade_date, index_key) DO UPDATE SET
        close = EXCLUDED.close, prev_close = EXCLUDED.prev_close, pct = EXCLUDED.pct, fetched_at = now()`;
  }
  return { tradeDate, written: rows.length, skipped: false };
}

export interface BoardItem {
  indexKey: string;
  label: string;
  pct: number | null;
}

/** 某交易日的盘面（站点/日报/Bark 卡片用）。没有数据返回空数组，调用方按无盘面处理。 */
export async function boardSnapshot(tradeDate: string): Promise<BoardItem[]> {
  const rows = await sql<{ index_key: string; pct: number | null }[]>`
    SELECT index_key, pct FROM market_daily WHERE trade_date = ${tradeDate}::date`;
  const byKey = new Map(rows.map((r) => [r.index_key, r.pct]));
  return SECTORS.map((s) => ({ indexKey: s.indexKey, label: s.label, pct: byKey.get(s.indexKey) ?? null })).filter((item) => item.pct != null);
}

/** 盘面一行文本（Bark 卡片/日报用）：`沪深300 +0.62% · 半导体/算力 +2.10% · …`，最多 maxItems 个。 */
export function boardLine(items: readonly BoardItem[], maxItems = 4): string {
  return items
    .slice(0, maxItems)
    .map((i) => `${i.label} ${i.pct! >= 0 ? "+" : ""}${i.pct!.toFixed(2)}%`)
    .join(" · ");
}
