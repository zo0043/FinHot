// 日频市场数据来自东方财富公开行情接口（push2）。约定：
//   - secid = 市场号.代码：sh=1.，sz=0.，板块指数=90.BKxxxx（见 industry/sectors.ts 的 indexKey）
//   - 返回的价格字段按 f59（小数位）缩放：真实值 = 字段值 / 10^f59；f170 是涨跌幅，按 100 缩放
//   - f86 是行情时间戳（秒），用它区分「今天收盘」与「非交易日返回的上一个收盘」
// 数据只存库供回测、日报盘面、Bark 卡片用，不对外公开（接口非官方，见 docs/roadmap.md 风险表）。
import { guardedFetch } from "../lib/http-fetch.ts";

export interface QuoteRow {
  secid: string;
  price: number;
  prevClose: number | null;
  pct: number | null; // 当日涨跌幅 %
  at: number | null; // f86 秒级时间戳
}

/** 板块 key → eastmoney secid。sh/sz 前缀换成市场号，BK 前缀换成 90. */
export function toSecid(indexKey: string): string {
  if (/^sh\d{6}$/.test(indexKey)) return `1.${indexKey.slice(2)}`;
  if (/^sz\d{6}$/.test(indexKey)) return `0.${indexKey.slice(2)}`;
  if (/^BK\d+$/.test(indexKey)) return `90.${indexKey}`;
  throw new Error(`无法识别的指数代码：${indexKey}`);
}

/** 涨跌停家数/两融余额等条数类数据：东财的接口结构不同且不稳定，先用 extra 留位，接好再说。 */
export const PENDING_SERIES = ["zt_count", "dt_count", "margin_bal"] as const;

/**
 * 解析 push2 ulist 返回。纯函数：入参是 unknown，宽度不信任，字段缺失返回 null 而不是抛错
 * —— 某一行解析失败不该让整个接口失败。
 */
export function parseQuotes(json: unknown): QuoteRow[] {
  const diff = (json as { data?: { diff?: unknown[] } } | null)?.data?.diff;
  if (!Array.isArray(diff)) return [];
  const rows: QuoteRow[] = [];
  for (const raw of diff) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const secid = typeof r.f13 === "string" || typeof r.f13 === "number" ? r.f13 : r.f14; // f13=代码，f14=市场号
    if (!secid) continue;
    const digits = typeof r.f59 === "number" && r.f59 >= 0 && r.f59 <= 6 ? r.f59 : 2;
    const scale = 10 ** digits;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v / scale : null);
    const price = num(r.f43);
    if (price == null) continue;
    const pctRaw = typeof r.f170 === "number" && Number.isFinite(r.f170) ? r.f170 / 100 : null;
    const market = r.f14 != null ? `${r.f14}.` : "";
    rows.push({
      secid: `${market}${secid}`,
      price,
      prevClose: num(r.f60),
      pct: pctRaw != null ? Math.round(pctRaw * 100) / 100 : null,
      at: typeof r.f86 === "number" && Number.isFinite(r.f86) ? r.f86 : null,
    });
  }
  return rows;
}

const FIELDS = "f13,f14,f43,f60,f169,f170,f59,f86";

/** 拉一组 secid 的行情。secid 个数上限由东财控制（几十个内安全），板块词表一次拉完没问题。 */
export async function fetchQuotes(secids: readonly string[], timeoutMs = 15_000): Promise<QuoteRow[]> {
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?secid=${secids.join(",")}&fields=${FIELDS}`;
  const res = await guardedFetch(url, { timeoutMs, maxBytes: 2 * 1024 * 1024, route: "egress" });
  if (res.status !== 200) throw new Error(`东财行情接口返回 ${res.status}`);
  return parseQuotes(JSON.parse(res.text()));
}
