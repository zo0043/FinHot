// market_daily 的写入与读取（database/migrations/0039_market_direction.sql）。
//   写入：market.daily cron（worker 每个交易日 15:35 北京时间）三级回退落库：
//     腾讯财经（主源，market/tencent.ts）→ 东财 push2his K 线（限速）→ 东财 push2 ulist（老源）。
//     休市/非交易日：各源都返回上一收盘，库内已有该交易日则 skip（不当错）。
//   读取：日报盘面、Bark 卡片与 P4 回测都从这里取——「事件方向 + 当时市场反应」的因果链靠它闭合。
import { beijingDate } from "@aihot/contracts/time";
import { SECTORS } from "@aihot/industry/sectors";
import { sql } from "../db.ts";
import { fetchQuotes, fetchQuotesKline, toSecid } from "./eastmoney.ts";
import { fromTencent } from "./tencent.ts";

export interface MarketRow {
  trade_date: string;
  index_key: string;
  close: number | null;
  prev_close: number | null;
  pct: number | null;
}

/** 行情 → market_daily 行。secid 反过来找回 index_key，认不出的 secid（比如预热期的 BK 代码）跳过。 */
export function rowsFromQuotes(
  quotes: { secid: string; price: number; prevClose: number | null; pct: number | null }[],
  tradeDate: string,
): MarketRow[] {
  const bySecid = new Map(SECTORS.map((s) => [toSecid(s.indexKey), s.indexKey]));
  const rows: MarketRow[] = [];
  for (const q of quotes) {
    const indexKey = bySecid.get(q.secid);
    if (!indexKey) continue;
    rows.push({ trade_date: tradeDate, index_key: indexKey, close: q.price, prev_close: q.prevClose, pct: q.pct });
  }
  return rows;
}

// ───────────────────────── 同步（三级回退） ─────────────────────────

export interface MarketSourceResult {
  tradeDate: string;
  rows: MarketRow[];
  missing: string[]; // 没拿到数据的序列（板块 key 或指数代码），记进 job detail
}

/** 兜底源 1：东财 push2his K 线（限速，见 eastmoney.ts） */
export async function fromKline(opts: { intervalMs?: number } = {}): Promise<MarketSourceResult> {
  const items = await fetchQuotesKline(SECTORS.map((s) => toSecid(s.indexKey)), opts);
  if (!items.length) throw new Error("东财 K 线源没有返回任何行情");
  const tradeDate = items.reduce((m, it) => (it.date > m ? it.date : m), "");
  if (!tradeDate) throw new Error("东财 K 线源没给行情日期");
  const rows = rowsFromQuotes(
    items.map((q) => ({ secid: q.secid, price: q.price, prevClose: q.prevClose, pct: q.pct })),
    tradeDate,
  );
  if (!rows.length) throw new Error("K 线 secid 不在板块词表里（BK 代码可能变了）");
  return { tradeDate, rows, missing: [] };
}

/** 兜底源 2：东财 push2 实时快照（老源；2026-10 起对宿主 502，保留作最后一条链） */
export async function fromUlist(): Promise<MarketSourceResult> {
  const quotes = await fetchQuotes(SECTORS.map((s) => toSecid(s.indexKey)));
  if (!quotes.length) throw new Error("接口没有返回任何行情");
  // f86 是行情时间戳：非交易日返回的是上一个收盘，按它定 trade_date（worker 挂两天补拉时尤其需要）。
  const at = Math.max(...quotes.map((q) => q.at ?? 0));
  if (!at) throw new Error("接口没给行情时间戳");
  const tradeDate = beijingDate(at * 1000);
  const rows = rowsFromQuotes(quotes, tradeDate);
  if (!rows.length) throw new Error("返回的 secid 不在板块词表里（BK 代码可能变了）");
  return { tradeDate, rows, missing: [] };
}

export interface SyncSummary {
  tradeDate: string;
  written: number;
  skipped: boolean;
  reason?: string;
  source?: string; // tencent | eastmoney-kline | eastmoney-ulist
}

export interface MarketSyncDeps {
  tencent?: () => Promise<MarketSourceResult>;
  kline?: () => Promise<MarketSourceResult>;
  ulist?: () => Promise<MarketSourceResult>;
  lastWritten?: () => Promise<string | null>;
}

/** 交易日本次同步。幂等（ON CONFLICT 更新），重复跑不会写重复行。 */
export async function syncMarketDaily(now = new Date(), deps: MarketSyncDeps = {}): Promise<SyncSummary> {
  const sources: Array<[string, () => Promise<MarketSourceResult>]> = [
    ["tencent", () => (deps.tencent ?? fromTencent)()],
    ["eastmoney-kline", () => (deps.kline ?? fromKline)()],
    ["eastmoney-ulist", () => (deps.ulist ?? fromUlist)()],
  ];
  const lastWritten =
    deps.lastWritten ??
    (async () => {
      const [r] = await sql`select max(trade_date) as d from market_daily`;
      return (r?.d as string | null) ?? null;
    });

  const errors: string[] = [];
  for (const [name, fn] of sources) {
    try {
      const res = await fn();
      const last = await lastWritten();
      if (last && res.tradeDate <= last) {
        return {
          tradeDate: res.tradeDate,
          written: 0,
          skipped: true,
          source: name,
          reason: `无新交易日（已有数据至 ${last}）`,
        };
      }
      const written = await writeMarketRows(res.rows, now);
      return {
        tradeDate: res.tradeDate,
        written,
        skipped: false,
        source: name,
        reason: res.missing.length ? `部分板块缺失: ${res.missing.join(",")}` : undefined,
      };
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`行情源全部失败 → ${errors.join(" | ")}`);
}

/** 共享 upsert：每日 sync 与回补脚本（scripts/backfill-market.ts）复用。幂等。 */
export async function writeMarketRows(rows: MarketRow[], now = new Date()): Promise<number> {
  if (!rows.length) return 0;
  // fetched_at 是 timestamptz，直接传 Date 实例。不能传 beijingStamp 的 "YYYY-MM-DD HH:mm" 字符串：
  // postgres.js 的 prepared statement 首次执行后按服务端列 OID（timestamptz）对同签名查询重绑参数，
  // 走 date 序列化器 new Date("2026-10-07 15:35") → V8 不认空格分隔格式 → Invalid time value
  //（2026-10-07 实测：单条 insert 成功、同语句第 2 行起必崩）。
  const fetchedAt = new Date(now.getTime());
  for (const r of rows) {
    await sql`
      INSERT INTO market_daily (trade_date, index_key, close, prev_close, pct, fetched_at)
      VALUES (${r.trade_date}::date, ${r.index_key}, ${r.close}, ${r.prev_close}, ${r.pct}, ${fetchedAt}::timestamptz)
      ON CONFLICT (trade_date, index_key) DO UPDATE SET
        close = EXCLUDED.close, prev_close = EXCLUDED.prev_close, pct = EXCLUDED.pct, fetched_at = EXCLUDED.fetched_at`;
  }
  return rows.length;
}

// ───────────────────────── 读取 ─────────────────────────

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
  return SECTORS.map((s) => ({ indexKey: s.indexKey, label: s.label, pct: byKey.get(s.indexKey) ?? null })).filter(
    (item) => item.pct != null,
  );
}

/** 盘面一行文本（Bark 卡片/日报用）：`沪深300 +0.62% · 半导体/算力 +2.10% · …`，最多 maxItems 个。 */
export function boardLine(items: readonly BoardItem[], maxItems = 4): string {
  return items
    .slice(0, maxItems)
    .map((i) => `${i.label} ${i.pct! >= 0 ? "+" : ""}${i.pct!.toFixed(2)}%`)
    .join(" · ");
}
