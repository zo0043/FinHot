// market_daily 主数据源：腾讯财经公开行情接口（2026-10-07 实测，宿主网络全通，无鉴权）：
//   板块榜单  https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank?board_type=hy&sort_type=price&direct=down&offset=0&count=40
//     board_type=hy 是申万一级 31 个行业板块，gn 是 200+ 概念板块；一次请求拿全量。
//     每行：code(pt018xxxxx/pt02xxxxxx)、name、zxj(最新价=收盘)、zd(涨跌点数)、zdf(涨跌幅%)，
//     另有 zdf_d5/d20/d60(多周期累计%)、zljlr(主力净流入)、zgb(涨跌家数)（一并解析，落 market_daily 富字段）。
//   指数日 K  https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=sh000300,day,,,3,
//     data[code].day = [date, open, close, high, low, volume, ...]，最后一根 bar = 最近交易日。
// 交易日以指数 K 线最后一根 bar 的日期为准（非交易日榜单仍回上一收盘，指数 K 线仍回最后交易日）。
// 东财（market/eastmoney.ts）降为兜底源。腾讯是非官方接口：解析全部走纯函数 + 单测锁字段形态，
// 板块改名/下线会落到 missing 被跳过报警，绝不写成错数据。
import { SECTORS } from "@aihot/industry/sectors";
import { guardedFetch } from "../lib/http-fetch.ts";
import type { MarketRow } from "./daily.ts";

export interface TencentBoard {
  code: string; // pt01801120
  name: string; // 食品饮料
  boardType: "hy" | "gn";
  close: number | null; // zxj（最新价；收盘后即当日收盘价）
  prevClose: number | null; // zxj - zd
  pct: number | null; // zdf，单位 %
  // 资金流/多周期（rank 行原始字符串，缺失/非法则不挂 key —— 0 是有效值，不猜）
  zljlr?: number; // 主力净流入（元），负=净流出
  zdf_d5?: number; // 5 日累计涨跌幅 %
  zdf_d20?: number; // 20 日累计涨跌幅 %
  zdf_d60?: number; // 60 日累计涨跌幅 %
  zgb_raw?: string; // 涨跌家数 "102/122"，原文透传
}

export interface TencentKBar {
  date: string; // YYYY-MM-DD
  open: number;
  close: number;
  high: number;
  low: number;
}

export interface TencentMarketData {
  tradeDate: string; // 指数 K 线最后一根 bar 的日期
  boards: TencentBoard[];
  indices: { sh000300: TencentKBar[]; sh000001: TencentKBar[] };
}

// ───────────────────────── 纯解析（单测锁定，无网络） ─────────────────────────

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 腾讯榜单 JSON → 板块行情（zxj=收盘、zd=涨跌点、zdf=涨跌幅%；全部是字符串数字） */
export function parseRankBoards(payload: unknown, boardType: "hy" | "gn"): TencentBoard[] {
  if (typeof payload !== "object" || payload === null) return [];
  const rows = (payload as { data?: { rank_list?: unknown } }).data?.rank_list;
  if (!Array.isArray(rows)) return [];
  const out: TencentBoard[] = [];
  for (const r of rows) {
    if (typeof r !== "object" || r === null) continue;
    const x = r as Record<string, unknown>;
    const code = typeof x.code === "string" ? x.code : null;
    const name = typeof x.name === "string" ? x.name : null;
    if (!code || !name) continue;
    const zxj = toNum(x.zxj);
    const zd = toNum(x.zd);
    const b: TencentBoard = {
      code,
      name,
      boardType,
      close: zxj,
      prevClose: zxj != null && zd != null ? round2(zxj - zd) : null,
      pct: toNum(x.zdf),
    };
    // 资金流/多周期：源缺字段/空串/非数字 → 不挂 key（下游按 undefined→NULL 处理，不写 0）
    const zljlr = toNum(x.zljlr);
    if (zljlr != null) b.zljlr = zljlr;
    const zdf_d5 = toNum(x.zdf_d5);
    if (zdf_d5 != null) b.zdf_d5 = zdf_d5;
    const zdf_d20 = toNum(x.zdf_d20);
    if (zdf_d20 != null) b.zdf_d20 = zdf_d20;
    const zdf_d60 = toNum(x.zdf_d60);
    if (zdf_d60 != null) b.zdf_d60 = zdf_d60;
    // 涨跌家数是 "102/122" 这类原文，不转数字
    if (typeof x.zgb === "string" && x.zgb !== "") b.zgb_raw = x.zgb;
    out.push(b);
  }
  return out;
}

/** 腾讯指数日 K JSON → bar 列表（按日期升序）；day 行 = [date, open, close, high, low, volume, ...] */
export function parseIndexKline(payload: unknown, code: string): TencentKBar[] {
  if (typeof payload !== "object" || payload === null) return [];
  const data = (payload as Record<string, unknown>).data as Record<string, unknown> | undefined;
  const entry = data?.[code] as Record<string, unknown> | undefined;
  const days = entry?.day ?? entry?.qfqday;
  if (!Array.isArray(days)) return [];
  const out: TencentKBar[] = [];
  for (const b of days) {
    if (!Array.isArray(b) || b.length < 5) continue;
    const date = typeof b[0] === "string" ? b[0] : null;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const open = toNum(b[1]);
    const close = toNum(b[2]);
    const high = toNum(b[3]);
    const low = toNum(b[4]);
    if (open == null || close == null || high == null || low == null) continue;
    out.push({ date, open, close, high, low });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** 18 个行业板块 → 腾讯板块（15 个申万一级 + 3 个比申万一级更细的概念板；按名匹配取码，名字变了会落到 missing） */
export const SECTOR_TENCENT: Record<string, { board: "hy" | "gn"; name: string }> = {
  semicap: { board: "gn", name: "芯片概念" }, // 比"电子"一级板更贴"半导体/算力"
  "ai-app": { board: "gn", name: "人工智能" }, // 比"计算机"一级板更贴"AI 应用"
  "new-energy": { board: "hy", name: "电力设备" },
  liquor: { board: "hy", name: "食品饮料" },
  pharma: { board: "hy", name: "医药生物" },
  military: { board: "hy", name: "国防军工" },
  bank: { board: "hy", name: "银行" },
  broker: { board: "hy", name: "非银金融" },
  "real-estate": { board: "hy", name: "房地产" },
  auto: { board: "hy", name: "汽车" },
  industrial: { board: "hy", name: "机械设备" },
  cyclical: { board: "hy", name: "有色金属" },
  precious: { board: "gn", name: "黄金概念" }, // 申万一级"有色金属"不含纯贵金属信号
  energy: { board: "hy", name: "石油石化" },
  transport: { board: "hy", name: "交通运输" },
  telecom: { board: "hy", name: "通信" },
  media: { board: "hy", name: "传媒" },
  agriculture: { board: "hy", name: "农林牧渔" },
};

/** 按 (boardType, name) 精确匹配板块；缺值或找不到 → missing（宁可跳过也不写错） */
export function resolveSectorBoards(
  boards: readonly TencentBoard[],
): { bySector: Map<string, TencentBoard>; missing: string[] } {
  const bySector = new Map<string, TencentBoard>();
  const missing: string[] = [];
  for (const [sector, want] of Object.entries(SECTOR_TENCENT)) {
    const found = boards.find((b) => b.boardType === want.board && b.name === want.name);
    if (found && found.close != null && found.prevClose != null && found.pct != null) {
      bySector.set(sector, found);
    } else {
      missing.push(sector);
    }
  }
  return { bySector, missing };
}

/** 指数 bar → 当日行（取最后两根 bar 算收盘/昨收/涨跌幅） */
export function indexRow(code: "sh000300" | "sh000001", bars: readonly TencentKBar[]): MarketRow | null {
  if (bars.length < 2) return null;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  if (!(last.close > 0) || !(prev.close > 0)) return null;
  return {
    index_key: code,
    trade_date: last.date,
    close: round2(last.close),
    prev_close: round2(prev.close),
    pct: round2((last.close / prev.close - 1) * 100),
  };
}

/** 板块行 + 2 个指数行 → MarketRow（18 板块 + 2 指数 = 20 行）；找不到的进 missing。
 *  注意 index_key 存的是 **indexKey**（BK 代码 / sh 代码），与 rowsFromQuotes/boardSnapshot 的既有口径一致；
 *  腾讯拿不到的板块记 missing（板块 key），供 job detail 排查。 */
export function rowsFromTencent(data: TencentMarketData): { rows: MarketRow[]; missing: string[] } {
  const rows: MarketRow[] = [];
  const { bySector, missing } = resolveSectorBoards(data.boards);
  for (const sector of SECTORS) {
    if (/^(sh|sz)\d{6}$/.test(sector.indexKey)) continue; // 大盘指数走下面
    const b = bySector.get(sector.key);
    if (!b) continue;
    rows.push({
      index_key: sector.indexKey,
      trade_date: data.tradeDate,
      close: b.close as number,
      prev_close: b.prevClose as number,
      pct: b.pct as number,
      zljlr: b.zljlr,
      zdf_d5: b.zdf_d5,
      zdf_d20: b.zdf_d20,
      zdf_d60: b.zdf_d60,
      zgb_raw: b.zgb_raw,
    });
  }
  for (const code of ["sh000300", "sh000001"] as const) {
    const r = indexRow(code, data.indices[code]);
    if (r) rows.push(r);
    else missing.push(code);
  }
  return { rows, missing };
}

// ───────────────────────── 健全性（坏数据宁缺毋滥） ─────────────────────────

/** 板块指数极端日涨跌幅也不会超过 30%（主板 10% / 创科 20%，成分加权后更窄） */
const PCT_MAX = 30;
const PCT_DRIFT_TOL = 0.05; // zdf 与 (close/prev−1) 的舍入容差（百分点）

export function sane(row: MarketRow): boolean {
  if (row.close == null || row.prev_close == null || row.pct == null) return false;
  if (!(row.close > 0) || !(row.prev_close > 0)) return false;
  if (!Number.isFinite(row.pct) || Math.abs(row.pct) > PCT_MAX) return false;
  const implied = (row.close / row.prev_close - 1) * 100;
  return Math.abs(row.pct - implied) <= PCT_DRIFT_TOL;
}

// ───────────────────────── 抓取 ─────────────────────────

const RANK_BASE = "https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank";
const KLINE_BASE = "https://web.ifzq.gtimg.cn/appstock/app/kline/kline";

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const res = await guardedFetch(url, { timeoutMs, route: "egress" });
  return JSON.parse(await res.text()) as unknown;
}

/** 4 个请求拿全市场数据：2 次板块榜（hy/gn）+ 2 次指数日 K */
export async function fetchTencentMarket(opts: { timeoutMs?: number } = {}): Promise<TencentMarketData> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const [hy, gn, k300, k001] = await Promise.all([
    getJson(`${RANK_BASE}?board_type=hy&sort_type=price&direct=down&offset=0&count=40`, timeoutMs),
    getJson(`${RANK_BASE}?board_type=gn&sort_type=price&direct=down&offset=0&count=200`, timeoutMs),
    getJson(`${KLINE_BASE}?param=sh000300,day,,,3,`, timeoutMs),
    getJson(`${KLINE_BASE}?param=sh000001,day,,,3,`, timeoutMs),
  ]);
  const boards = [...parseRankBoards(hy, "hy"), ...parseRankBoards(gn, "gn")];
  const bars300 = parseIndexKline(k300, "sh000300");
  const bars001 = parseIndexKline(k001, "sh000001");
  const tradeDate = [...bars300, ...bars001].map((b) => b.date).sort().at(-1);
  if (!tradeDate) throw new Error("腾讯指数 K 线无数据（无法确定交易日）");
  return { tradeDate, boards, indices: { sh000300: bars300, sh000001: bars001 } };
}

/** 主源入口：抓取 + 组行 + 健全性过滤；有效行太少（<12）视为源故障抛错，交给回退链 */
export async function fromTencent(opts: { timeoutMs?: number } = {}): Promise<{
  tradeDate: string;
  rows: MarketRow[];
  missing: string[];
}> {
  const data = await fetchTencentMarket(opts);
  const { rows: raw, missing } = rowsFromTencent(data);
  const rows = raw.filter(sane);
  const dropped = raw.filter((r) => !sane(r)).map((r) => r.index_key);
  if (rows.length < 12) {
    throw new Error(`腾讯行情数据不完整（仅 ${rows.length} 行有效，丢弃=${dropped.join(",") || "无"}）`);
  }
  return { tradeDate: data.tradeDate, rows, missing };
}
