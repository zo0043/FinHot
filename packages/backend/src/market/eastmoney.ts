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

// ── 兑底源：push2his 历史 K 线子域 ──
// 2026-10-07 实测：push2 ulist 对宿主 502，但 kline 子域活着——只是同 IP 限流激进（连发会被断连），
// 必须限速，且只在回退日调用（平时每日走腾讯主源）。lmt=2 拿最后两根 bar 算收盘/昨收。
const KLINE_HIS_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get";

export interface KlineQuote {
  secid: string;
  price: number; // 最后一根 bar 收盘
  prevClose: number; // 倒数第二根 bar 收盘
  pct: number; // (last/prev−1)×100，%
  date: string; // 最后一根 bar 的日期 YYYY-MM-DD
}

/** push2his kline JSON → 最近两根 bar 的行情；klines 行形如 "2026-09-30,4357.62,162949626" */
export function parseKlineQuotes(payload: unknown, secid: string): KlineQuote | null {
  if (typeof payload !== "object" || payload === null) return null;
  const klines = (payload as { data?: { klines?: unknown } }).data?.klines;
  if (!Array.isArray(klines)) return null;
  const bars: { date: string; close: number }[] = [];
  for (const line of klines) {
    if (typeof line !== "string") continue;
    const [date, close] = line.split(",");
    const c = Number(close);
    if (!date || !Number.isFinite(c) || c <= 0) continue;
    bars.push({ date, close: c });
  }
  if (bars.length < 2) return null; // 没有昨收就不写（宁缺毋滥）
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  return {
    secid,
    price: last.close,
    prevClose: prev.close,
    pct: Math.round((last.close / prev.close - 1) * 10000) / 100,
    date: last.date,
  };
}

/** 逐个 secid 拉 push2his K 线（默认 3.5s 间隔防限流）；单个失败跳过，不中断整条兑底链 */
export async function fetchQuotesKline(
  secids: readonly string[],
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<KlineQuote[]> {
  const out: KlineQuote[] = [];
  for (let i = 0; i < secids.length; i++) {
    const secid = secids[i];
    try {
      const url = `${KLINE_HIS_URL}?secid=${encodeURIComponent(secid)}&klt=101&fqt=0&end=20500101&lmt=2&fields1=f3&fields2=f51,f53`;
      const res = await guardedFetch(url, {
        timeoutMs: opts.timeoutMs ?? 15_000,
        maxBytes: 2 * 1024 * 1024,
        route: "egress",
      });
      if (res.status === 200) {
        const q = parseKlineQuotes(JSON.parse(res.text()), secid);
        if (q) out.push(q);
      }
    } catch {
      // 单码失败容忍（该日 missing）
    }
    if (i < secids.length - 1) await new Promise((r) => setTimeout(r, opts.intervalMs ?? 3500));
  }
  return out;
}
