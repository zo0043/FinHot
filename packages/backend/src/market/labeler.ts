// prediction_ledger 的 T+N 结果标注（outcome_status / t0_date / cum_pct_tN / hit_tN / baseline_ref）。
// 防泄漏契约（回测基率的唯一口径）：
//   D(t0) = t0 时刻的北京日历日；T0 = 严格晚于 D(t0) 的第一个 market_daily 交易日（有行的日期即交易日）；
//   T0m1 = T0 前一个交易日；T+N = T0m1 之后第 N 个交易日（N∈{1,3,5}），即 T+1 = T0 本身（事件收益含 T0 当日反应；
//   事件研究惯例：公告日次一交易日开始度量；例 t0=09-30 → T0=10-09，T+1=10-09 收盘，T+5=10-15 收盘，方案 §5.1）。
//   cum(N) = close(T+N)/close(T0m1) - 1（与 market_daily.pct 同 % 单位）。
//   板块自有序列在所需日期缺行 → 回退该板块 benchIndex（industry/sectors.ts），baseline_ref 记录实际所用序列。
//   headline 取 scope 各板块 cum(N) 的等权均值。
// 幂等：只取 outcome_status='pending'、按 id 更新（且仅当仍 pending）；部分就绪（T+5 尚未到来）的
// 行留 NULL 并保持 pending，下轮重访。重复跑不产生重复写。
import { beijingDate } from "@aihot/contracts/time";
import { SECTORS, SECTOR_BY_KEY, type Sector } from "@aihot/industry/sectors";
import { sql } from "../db.ts";

export interface LabelOutcomesResult {
  labeled: number;
  skipped: number;
  pendingRemaining: number;
}

const HORIZONS = [1, 3, 5] as const;

interface PendingRow {
  id: number;
  t0: Date;
  direction: string;
  direction_status: string;
  scope: string[];
  input_snapshot: Record<string, unknown>;
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

/**
 * postgres.js 把 date 列解成 Date 对象："2026-09-30" <= Date 会走 Number 强转 → NaN → WHERE 静默失效
 * （market 模块已踩过，见 daily.ts）。比较前一律归一成 YYYY-MM-DD 字符串。
 */
function toDateStr(v: string | Date | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);
}

/** scope 条目 → 板块（先按 key，再按 indexKey）；不认识的条目丢弃。 */
function resolveSectors(scope: string[]): Sector[] {
  const out: Sector[] = [];
  for (const entry of scope) {
    const s = SECTOR_BY_KEY.get(entry) ?? SECTORS.find((x) => x.indexKey === entry);
    if (s && !out.some((x) => x.key === s.key)) out.push(s);
  }
  return out;
}

/** days（升序唯一）中严格大于 d 的第一个日期的下标；找不到返回 days.length。 */
function firstAfter(days: string[], d: string): number {
  let lo = 0, hi = days.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid] <= d) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export async function labelOutcomes(): Promise<LabelOutcomesResult> {
  const [dayRows, rows] = await Promise.all([
    sql<{ d: string | Date }[]>`SELECT DISTINCT trade_date AS d FROM market_daily ORDER BY 1 ASC`,
    sql<PendingRow[]>`
      SELECT id, t0, direction, direction_status, scope, input_snapshot
      FROM prediction_ledger WHERE outcome_status = 'pending' ORDER BY id ASC`,
  ]);
  const days = dayRows.map((r) => toDateStr(r.d)).filter((d): d is string => d !== null);

  // 只需取相关序列的收盘：各板块自有 key + 其 benchIndex（回退序列）
  const keys = [...new Set(rows.flatMap((r) => resolveSectors(r.scope).flatMap((s) => [s.indexKey, s.benchIndex])))];
  const closes = new Map<string, Map<string, number | null>>();
  if (keys.length) {
    const q = await sql<{ k: string; d: string | Date; c: number | null }[]>`
      SELECT index_key AS k, trade_date AS d, close AS c FROM market_daily WHERE index_key = ANY(${keys})`;
    for (const r of q) {
      const d = toDateStr(r.d);
      if (d === null) continue;
      let m = closes.get(r.k);
      if (!m) {
        m = new Map();
        closes.set(r.k, m);
      }
      m.set(d, r.c);
    }
  }

  let labeled = 0, skipped = 0;
  for (const row of rows) {
    const d = beijingDate(row.t0);
    const t0Idx = firstAfter(days, d);
    const t0 = t0Idx < days.length ? days[t0Idx] : null;
    const t0m1 = t0 && t0Idx > 0 ? days[t0Idx - 1] : null;
    const sectors = resolveSectors(row.scope);

    // neutral/none、direction 未 ok、空 scope：skipped，不算 cum（t0 可解析时照记 t0_date）
    if (!sectors.length || (row.direction !== "bullish" && row.direction !== "bearish") || row.direction_status !== "ok") {
      await apply(row, { status: "skipped", t0, snapshot: row.input_snapshot });
      skipped += 1;
      continue;
    }
    // T0/T0m1 解析不了：skipped，原因并入 input_snapshot.last_error（保留原键）
    if (!t0 || !t0m1) {
      const lastError = !t0
        ? `T0 unresolvable: no market_daily trading day after ${d}`
        : `T0m1 missing: ${t0} is the earliest market_daily trading day`;
      await apply(row, { status: "skipped", t0, snapshot: { ...row.input_snapshot, last_error: lastError } });
      skipped += 1;
      continue;
    }

    // T+N = T0m1 之后第 N 个交易日，即 T+1 = T0 本身（可能尚未到来）
    const horizonDay = new Map<number, string | null>();
    for (const n of HORIZONS) horizonDay.set(n, t0Idx + n - 1 < days.length ? days[t0Idx + n - 1] : null);
    const horizonDates = HORIZONS.map((n) => horizonDay.get(n)!).filter((v): v is string => v !== null);

    // 每板块定序列：自有序列在所需日期齐全则用自有，否则回退 benchIndex（baseline_ref 记录）
    const needed = [t0m1, ...horizonDates];
    const complete = (m: Map<string, number | null> | null) =>
      m !== null && needed.every((x) => {
        const v = m.get(x);
        return v !== null && v !== undefined;
      });
    const perSector = sectors.map((s) => {
      const own = closes.get(s.indexKey) ?? null;
      const useOwn = complete(own);
      return {
        series: useOwn ? own : (closes.get(s.benchIndex) ?? null),
        ref: useOwn ? `sector:${s.indexKey}` : `bench:${s.benchIndex}`,
      };
    });

    // 各 horizon 独立计算：headline = 可解析板块 cum(N) 的等权均值
    const cums = new Map<number, number>();
    const hits = new Map<number, boolean>();
    for (const n of HORIZONS) {
      const day = horizonDay.get(n)!;
      if (!day) continue;
      const vals: number[] = [];
      for (const ps of perSector) {
        const base = ps.series?.get(t0m1);
        const close = ps.series?.get(day);
        if (base == null || close == null || base === 0) continue;
        vals.push((close / base - 1) * 100);
      }
      if (!vals.length) continue;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      cums.set(n, round4(mean));
      // 均值恰为 0 → 不算命中
      hits.set(n, mean === 0 ? false : (row.direction === "bullish") === (mean > 0));
    }

    // T+5 可算 → labeled；交易日已到但收盘缺失（回退后仍不可用）→ skipped；否则 pending 等下轮
    const status: "labeled" | "skipped" | "pending" = cums.has(5)
      ? "labeled"
      : cums.size === 0 && horizonDates.length > 0
        ? "skipped"
        : "pending";
    const lastError =
      status === "skipped" ? `no usable close after fallback (horizon days present: ${horizonDates.join(", ")})` : undefined;
    await apply(row, {
      status,
      t0,
      cums,
      hits,
      ref: [...new Set(perSector.map((p) => p.ref))].join(","),
      snapshot: lastError ? { ...row.input_snapshot, last_error: lastError } : row.input_snapshot,
    });
    if (status === "labeled") labeled += 1;
    else if (status === "skipped") skipped += 1;
  }

  const [{ n: pendingRemaining }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM prediction_ledger WHERE outcome_status = 'pending'`;
  return { labeled, skipped, pendingRemaining };
}

interface ApplyOpts {
  status: "labeled" | "skipped" | "pending";
  t0: string | null;
  cums?: Map<number, number>;
  hits?: Map<number, boolean>;
  ref?: string;
  snapshot: Record<string, unknown>;
}

/** 按 id 更新（仅当仍 pending）→ 幂等。labeled_at 只在落定（labeled/skipped）时写；pending 保持 NULL。 */
async function apply(row: PendingRow, o: ApplyOpts): Promise<void> {
  const labeledAt = o.status === "pending" ? null : new Date();
  await sql`
    UPDATE prediction_ledger SET
      t0_date = ${o.t0 ?? null}::date,
      cum_pct_t1 = ${o.cums?.get(1) ?? null},
      hit_t1 = ${o.hits?.get(1) ?? null},
      cum_pct_t3 = ${o.cums?.get(3) ?? null},
      hit_t3 = ${o.hits?.get(3) ?? null},
      cum_pct_t5 = ${o.cums?.get(5) ?? null},
      hit_t5 = ${o.hits?.get(5) ?? null},
      baseline_ref = ${o.ref ?? null},
      outcome_status = ${o.status},
      labeled_at = ${labeledAt}::timestamptz,
      input_snapshot = ${sql.json(o.snapshot as never)}::jsonb
    WHERE id = ${row.id} AND outcome_status = 'pending'`;
}
