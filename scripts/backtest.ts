/**
 * T1.2 — direction × 板块 × T+N 回测报告（roadmap P4 口径，方案 §5.1/§5.2）。
 *
 * 事件口径（与 market/labeler.ts 完全一致）：
 *   t0_date（台账）= T0 = 严格晚于 D(t0) 的第一个 market_daily 交易日；T0m1 = T0 前一交易日
 *   T+N = T0m1 之后第 N 个交易日（N∈{1,3,5}），即 T+1 = T0 本身
 *   cum(N) = close(T+N)/close(T0m1) - 1（% 单位，即 labeler 存储的 cum_pct_tN）
 *   序列选择：板块自有序列（indexKey）在所需日期（T0m1+各 horizon 日）齐全才用，否则回退该板块 benchIndex
 *   hit：去重单元的 cum 均值与方向同号（bullish↔正、bearish↔负）；均值恰 0 → 不命中
 *   A3 去重单元 = (t0_date × 板块 indexKey × direction)，同故事多文章取 cum 均值，防虚增样本
 * baseline（方案 §5.2）：X 遍历 ≤ asOf 的每个交易日（板块集合 = scope 板块，自有序列缺某日 → 用 benchIndex 行）：
 *   r(X) = close(X)/close(X-1) - 1（恰 0 跳过），c(X,N) = close(X+N)/close(X-1) - 1
 *   baseline(N) = P[sign(c(X,N)) == sign(r(X))]；pooled = scope 板块等权
 *   lift = hitRate - baseline；永远带 n 与 95% CI（±1.96·sqrt(p(1-p)/n)）；n<30 → insufficient
 *   OOT：默认保留最后 14 自然天（按 t0_date）单列，不进 in-sample 结论
 *
 * 结构：computeBacktest() 是纯函数（CLI 与测试共用，无 SQL/IO）；CLI 做 SQL + 写报告 + process.exit(0)。
 * 用法（repo root，Node 22）：
 *   DATABASE_URL=... node scripts/backtest.ts [--as-of YYYY-MM-DD] [--out-dir docs/backtest]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SECTORS, SECTOR_BY_KEY, type Sector } from "@aihot/industry/sectors";
import { closeDb, sql } from "@aihot/backend/db";

/** 某 indexKey 的序列（升序唯一交易日 + 收盘；缺收盘为 null）。 */
export interface BtSeries {
  days: string[];
  closes: Map<string, number | null>;
}

export interface BacktestRow {
  /** 台账 t0_date（= T0，YYYY-MM-DD） */
  t0Date: string;
  direction: string;
  scope: string[];
}

export interface BacktestInput {
  /** 窗口右端（YYYY-MM-DD） */
  asOf: string;
  /** OOT 保留天数（按 t0_date 的自然天），默认 14 */
  ootDays: number;
  /** market_daily 全部交易日（升序） */
  globalDays: string[];
  /** outcome_status='labeled' 且 t0_date ≤ asOf 的台账行 */
  rows: BacktestRow[];
  /** 每个 indexKey（板块自有 + benchIndex）的序列 */
  indexSeries: Map<string, BtSeries>;
}

/** A3 去重单元：cum = 各文章在该 horizon 的 cum 均值（% 单位，labeler 同口径）。 */
export interface BtUnit {
  key: string;
  date: string; // t0_date
  sector: string; // indexKey
  direction: "bullish" | "bearish";
  cum: Map<number, number>;
}

export interface CellStat {
  horizon: "t1" | "t3" | "t5";
  sector: string; // indexKey；'__pooled__' = scope 全板块等权
  n: number;
  hitRate: number | null;
  baseline: number | null;
  lift: number | null;
  ci: number; // ±95% CI 半宽（基于 hitRate 的 n）
  insufficient: boolean; // n < 30
  oot: boolean;
}

export interface BacktestResult {
  asOf: string;
  rows: number;
  units: BtUnit[];
  excludedNeutral: number;
  skippedNoMarket: number;
  cells: CellStat[];
  markdown: string;
}

const HORIZONS = [1, 3, 5] as const;

const D = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

/** scope 条目 → 板块（先按 key，再按 indexKey）；不认识的条目丢弃（labeler resolveSectors 同款）。 */
export function resolveSectors(scope: string[]): Sector[] {
  const out: Sector[] = [];
  for (const entry of scope) {
    const s = SECTOR_BY_KEY.get(entry) ?? SECTORS.find((x) => x.indexKey === entry);
    if (s && !out.some((x) => x.key === s.key)) out.push(s);
  }
  return out;
}

function present(m: Map<string, number | null> | undefined, d: string): boolean {
  const v = m?.get(d);
  return v !== null && v !== undefined;
}

/** days（升序）中等于 d 的下标；不存在返回 -1。 */
function indexOfDay(days: string[], d: string): number {
  let lo = 0,
    hi = days.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  return lo < days.length && days[lo] === d ? lo : -1;
}

function ciHalf(p: number, n: number): number {
  return n > 0 ? 1.96 * Math.sqrt((p * (1 - p)) / n) : 0;
}

/** 合并序列：逐日 close = 自有 ?? bench（方案 §5.2「板块行缺失的日期用该板块 benchIndex 行替代」）。 */
function mergedSeries(own: BtSeries | undefined, bench: BtSeries | undefined): BtSeries | null {
  if (!own && !bench) return null;
  const daySet = new Set<string>();
  for (const d of own?.days ?? []) daySet.add(d);
  for (const d of bench?.days ?? []) daySet.add(d);
  const days = [...daySet].sort();
  const closes = new Map<string, number | null>();
  for (const d of days) {
    const v = own?.closes.get(d) ?? bench?.closes.get(d);
    if (v !== null && v !== undefined) closes.set(d, v);
  }
  return days.length ? { days, closes } : null;
}

/**
 * 纯函数：去重单元（A3）+ 每 horizon×板块(+pooled)×in-sample/OOT cell 的
 * n / hitRate / baseline(§5.2) / lift / 95% CI + markdown 报告。无 SQL/IO，CLI 与测试共用。
 */
export function computeBacktest(input: BacktestInput): BacktestResult {
  const { asOf, ootDays, globalDays, rows, indexSeries } = input;

  // ---- 去重单元 (t0_date × 板块 indexKey × direction)；cum 按 horizon 收集各文章值，取均值
  const unitMap = new Map<string, { date: string; sector: string; direction: "bullish" | "bearish"; acc: Map<number, number[]> }>();
  let excludedNeutral = 0;
  let skippedNoMarket = 0;
  for (const r of rows) {
    if (r.direction !== "bullish" && r.direction !== "bearish") {
      excludedNeutral++;
      continue;
    }
    const i = indexOfDay(globalDays, r.t0Date);
    if (i <= 0) {
      // t0_date 不是交易日，或是最早交易日（T0m1 不可解）；labeler 正常产出下不会发生
      skippedNoMarket++;
      continue;
    }
    // T0m1 + 各 horizon 日：T+N = T0m1 之后第 N 个交易日 = globalDays[i + N - 1]
    const t0m1 = globalDays[i - 1];
    const horizonDays = HORIZONS.map((n) => (i + n - 1 < globalDays.length ? globalDays[i + n - 1] : null));
    for (const s of resolveSectors(r.scope)) {
      // 序列选择镜像 labeler：自有序列在所需日期齐全才用自有，否则回退 benchIndex
      const needed = [t0m1, ...horizonDays.filter((d): d is string => d !== null)];
      const own = indexSeries.get(s.indexKey);
      const useOwn = own !== undefined && needed.every((d) => present(own.closes, d));
      const series = useOwn ? own : indexSeries.get(s.benchIndex);
      const key = `${r.t0Date}|${s.indexKey}|${r.direction}`;
      const u = unitMap.get(key) ?? { date: r.t0Date, sector: s.indexKey, direction: r.direction, acc: new Map<number, number[]>() };
      for (let k = 0; k < HORIZONS.length; k++) {
        const n = HORIZONS[k];
        const day = horizonDays[k];
        if (!day) continue;
        const base = series?.closes.get(t0m1);
        const close = series?.closes.get(day);
        if (base === null || base === undefined || close === null || close === undefined || base === 0) continue;
        const arr = u.acc.get(n) ?? [];
        arr.push((close / base - 1) * 100);
        u.acc.set(n, arr);
      }
      unitMap.set(key, u);
    }
  }
  const units: BtUnit[] = [];
  for (const [key, u] of unitMap) {
    const cum = new Map<number, number>();
    for (const [n, arr] of u.acc) if (arr.length) cum.set(n, arr.reduce((a, b) => a + b, 0) / arr.length);
    if (cum.size) units.push({ key, date: u.date, sector: u.sector, direction: u.direction, cum });
  }
  units.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // ---- baseline（§5.2）：板块集合 = scope 板块（单板块 cell 只取该板块），X ≤ asOf（同窗口）
  const scopeSectorMap = new Map<string, Sector>();
  for (const r of rows) for (const s of resolveSectors(r.scope)) scopeSectorMap.set(s.key, s);
  const scopeSectors = [...scopeSectorMap.values()].sort((a, b) => (a.indexKey < b.indexKey ? -1 : 1));
  const sectorKeys = scopeSectors.map((s) => s.indexKey);

  const baselineFor = (sectors: Sector[], N: number): number | null => {
    let match = 0;
    let total = 0;
    for (const s of sectors) {
      const ser = mergedSeries(indexSeries.get(s.indexKey), indexSeries.get(s.benchIndex));
      if (!ser) continue;
      for (let j = 1; j + N < ser.days.length; j++) {
        if (ser.days[j] > asOf) break; // 升序：X 只取 ≤ asOf
        const c0 = ser.closes.get(ser.days[j - 1]);
        const c1 = ser.closes.get(ser.days[j]);
        const cN = ser.closes.get(ser.days[j + N]);
        if (c0 === null || c0 === undefined || c1 === null || c1 === undefined || cN === null || cN === undefined || c0 === 0) continue;
        const r = c1 / c0 - 1;
        if (r === 0) continue;
        total++;
        if (Math.sign(cN / c0 - 1) === Math.sign(r)) match++;
      }
    }
    return total > 0 ? match / total : null;
  };

  // ---- cells：每 horizon × (scope 板块 + pooled) × (in-sample / OOT)
  const ootCut = new Date(Date.parse(asOf) - ootDays * 86400000).toISOString().slice(0, 10);
  const isOot = (d: string) => d > ootCut;

  const cells: CellStat[] = [];
  for (const oot of [false, true] as const) {
    for (const n of HORIZONS) {
      for (const sector of [...sectorKeys, "__pooled__"]) {
        cells.push({ horizon: `t${n}` as "t1" | "t3" | "t5", sector, n: 0, hitRate: null, baseline: null, lift: null, ci: 0, insufficient: true, oot });
      }
    }
  }
  for (const cell of cells) {
    const N = Number(cell.horizon.slice(1));
    const picked = units.filter(
      (u) => (cell.sector === "__pooled__" || u.sector === cell.sector) && isOot(u.date) === cell.oot && u.cum.has(N),
    );
    const vals = picked.map((u) => ({ mean: u.cum.get(N)!, dir: u.direction })).filter((v) => Number.isFinite(v.mean));
    const n = vals.length;
    const hits = vals.filter((v) => (v.mean > 0 && v.dir === "bullish") || (v.mean < 0 && v.dir === "bearish")).length;
    const hitRate = n > 0 ? hits / n : null;
    const baseSectors = cell.sector === "__pooled__" ? scopeSectors : scopeSectors.filter((s) => s.indexKey === cell.sector);
    const b = baselineFor(baseSectors, N);
    cell.n = n;
    cell.hitRate = hitRate;
    cell.baseline = b;
    cell.lift = hitRate !== null && b !== null ? hitRate - b : null;
    cell.ci = ciHalf(hitRate ?? 0, n);
    cell.insufficient = n < 30;
  }

  // ---- markdown
  const pct = (x: number | null): string => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);
  const pp = (x: number | null): string => (x === null ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}pp`);
  const table = (oot: boolean): string[] => {
    const L: string[] = [
      `## ${oot ? `OOT（最后 ${ootDays} 自然天，仅验证）` : "In-sample"}`,
      "",
      "| horizon | sector | n | hit% | baseline% | lift | CI± | 备注 |",
      "|---|---|---|---|---|---|---|---|",
    ];
    const sorted = cells
      .filter((c) => c.oot === oot)
      .sort((a, b) => (a.horizon < b.horizon ? -1 : a.horizon > b.horizon ? 1 : a.sector < b.sector ? -1 : a.sector > b.sector ? 1 : 0));
    for (const c of sorted) {
      const note = c.n === 0 ? "no data" : c.insufficient ? "**insufficient (n<30)**" : "";
      L.push(`| ${c.horizon} | ${c.sector} | ${c.n} | ${pct(c.hitRate)} | ${pct(c.baseline)} | ${pp(c.lift)} | ±${(c.ci * 100).toFixed(1)}pp | ${note} |`);
    }
    return L;
  };

  let markdown: string;
  if (rows.length === 0) {
    markdown = `# direction 回测报告 ${asOf}\n\n样本不足：无已标注（outcome_status='labeled'）且 t0_date ≤ ${asOf} 的台账行。不构成结论。\n`;
  } else {
    const inSampleWithData = cells.filter((c) => !c.oot && c.n > 0);
    const lines: string[] = [
      `# direction 回测报告 ${asOf}`,
      "",
      "## 概览",
      `- 台账 labeled 行: ${rows.length}（neutral/none 排除: ${excludedNeutral}，无行情跳过: ${skippedNoMarket}）`,
      `- 去重单元 (t0_date×sector×direction): ${units.length}`,
      `- 板块: ${sectorKeys.join(", ") || "—"}`,
      `- OOT 分界: t0_date > ${ootCut}（最后 ${ootDays} 自然天）`,
      "",
      ...table(false),
      "",
      ...table(true),
      "",
      "## 结论",
      "",
    ];
    if (!units.length || cells.every((c) => c.n === 0)) {
      lines.push("**样本不足，不构成结论。** 等待 T+N 标注积累（首个可标注日之后逐日增加）。");
    } else if (inSampleWithData.every((c) => c.insufficient)) {
      lines.push("**当前 in-sample 有样本的 cell 全部 n<30，数字仅供流程验证。** keep/adjust/demote 决策待样本积累后由 T1.4 给出。");
    } else {
      lines.push("（T1.4 决策记录占位：基于上表 lift 与 CI 给出 keep/adjust/demote。）");
    }
    lines.push("");
    lines.push("> 诚实声明：baseline 为同窗口（X ≤ asOf）、同板块集合的板块惯性概率（方案 §5.2，板块行缺失日期用 benchIndex 行替代），pooled 为 scope 板块等权；lift 未做多重比较校正；n<30 的 cell 为 insufficient，不参与结论。");
    markdown = lines.join("\n");
  }

  return { asOf, rows: rows.length, units, excludedNeutral, skippedNoMarket, cells, markdown };
}

// ---- CLI：SQL + 写报告 + process.exit(0)
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const asOfIdx = args.indexOf("--as-of");
  const outDirIdx = args.indexOf("--out-dir");
  const argAsOf = asOfIdx >= 0 ? args[asOfIdx + 1] : undefined;
  if (argAsOf !== undefined && Number.isNaN(Date.parse(argAsOf))) throw new Error(`bad --as-of: ${argAsOf}`);
  const outDir = outDirIdx >= 0 ? args[outDirIdx + 1] : "docs/backtest";

  const maxRow = (await sql<{ m: string | Date | null }[]>`
    SELECT max(t0_date) AS m FROM prediction_ledger WHERE outcome_status = 'labeled'
  `)[0];
  const asOf = argAsOf ?? (maxRow?.m ? D(maxRow.m) : new Date().toISOString().slice(0, 10));

  const [dayRows, labeled] = await Promise.all([
    sql<{ d: string | Date }[]>`SELECT DISTINCT trade_date AS d FROM market_daily ORDER BY 1 ASC`,
    sql<{ t0: string | Date; direction: string; scope: unknown }[]>`
      SELECT t0_date AS t0, direction, scope FROM prediction_ledger
      WHERE outcome_status = 'labeled' AND t0_date <= ${asOf}::date`,
  ]);
  const globalDays = dayRows.map((r) => D(r.d)).filter((d) => d !== "");
  const scopeOf = (r: { scope: unknown }): string[] => (Array.isArray(r.scope) ? (r.scope as string[]) : []);
  const keys = [...new Set(labeled.flatMap((r) => resolveSectors(scopeOf(r)).flatMap((s) => [s.indexKey, s.benchIndex])))];
  const indexSeries = new Map<string, BtSeries>();
  for (const k of keys) {
    const q = await sql<{ d: string | Date; c: number | null }[]>`
      SELECT trade_date AS d, close AS c FROM market_daily WHERE index_key = ${k} ORDER BY trade_date ASC`;
    const days: string[] = [];
    const closes = new Map<string, number | null>();
    for (const r of q) {
      const d = D(r.d);
      if (!d) continue;
      days.push(d);
      closes.set(d, r.c === null ? null : Number(r.c));
    }
    indexSeries.set(k, { days, closes });
  }
  const rows: BacktestRow[] = labeled.map((r) => ({ t0Date: D(r.t0), direction: r.direction, scope: scopeOf(r) }));

  const res = computeBacktest({ asOf, ootDays: 14, globalDays, rows, indexSeries });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${asOf}.md`), res.markdown);
  console.log(res.markdown);
  await closeDb();
  process.exit(0);
}

const isMain = (() => {
  const p = process.argv[1] ?? "";
  return p.endsWith("backtest.ts") || p.endsWith("backtest.js");
})();
if (isMain) {
  main().catch((err) => {
    console.error(err);
    void closeDb().catch(() => {});
    process.exit(1);
  });
}
