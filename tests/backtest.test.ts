// T1.2 — 回测回归器测试（computeBacktest 纯函数 + 真实 DB fixture + CLI 报告）。
// 口径（方案 §5.1/§5.2，与 market/labeler.ts 一致）：
//   T0 = 严格晚于 D(t0) 的第一个交易日；T0m1 = T0 前一交易日；T+N = T0m1 后第 N 个交易日（T+1 = T0 本身）；
//   cum(N) = close(T+N)/close(T0m1) - 1（%）；去重单元 = t0_date × 板块 indexKey × direction（A3，同故事多文章取均值）；
//   hit：单元 cum 均值与方向同号（bullish↔正、bearish↔负；均值恰 0 → 不命中）；
//   baseline（§5.2）：同窗口（X ≤ asOf）板块惯性概率 P[sign(close(X+N)/close(X-1)-1) == sign(close(X)/close(X-1)-1)]，
//   X 收益恰 0 跳过；n<30 → insufficient；OOT = t0_date > asOf - ootDays 自然天（单列，不进 in-sample 结论）。
// A7：回测基于台账（入选+反事实都计数）；反事实条目的用户面暴露不在本文件（见 publication/bark 测试）。
// 纯函数 fixture：收盘价手工构造，期望值在注释里。DB fixture 复用 labeler.test.ts 模式
//   （随机 2027+ 年月避免跨 lane 撞键；labeler 先标注，再断言 backtest 与 labeler 存储的 cum_pct_tN 一致）。
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, sql } from "@aihot/backend/db";
import { labelOutcomes } from "@aihot/backend/market/labeler";
import {
  computeBacktest,
  resolveSectors,
  type BacktestInput,
  type BacktestResult,
  type BtSeries,
} from "../scripts/backtest.ts";
import "./setup.ts";

// ---- 纯函数 fixture ----
const D09 = (n: number) => `2026-09-${String(n).padStart(2, "0")}`;
const DAYS = Array.from({ length: 10 }, (_, i) => D09(i + 1));
const MAIN_CLOSES = [100, 110, 105, 110, 115, 120, 114, 118, 122, 130];

const mkSeries = (days: string[], closes: (number | null)[]): BtSeries => {
  const m = new Map<string, number | null>();
  days.forEach((d, i) => m.set(d, closes[i] ?? null));
  return { days: [...days], closes: m };
};

const mainInput = (
  rows: { t0Date: string; direction: string; scope: string[] }[],
  asOf = "2026-09-30",
  ootDays = 14,
  extraSeries: Record<string, BtSeries> = {},
): BacktestInput => ({
  asOf,
  ootDays,
  globalDays: DAYS,
  rows,
  indexSeries: new Map<string, BtSeries>([
    ["BK1036", mkSeries(DAYS, MAIN_CLOSES)],
    ["sh000300", mkSeries(DAYS, MAIN_CLOSES)],
    ...Object.entries(extraSeries),
  ]),
});

const cell = (res: BacktestResult, horizon: string, sector: string, oot: boolean) =>
  res.cells.find((c) => c.horizon === horizon && c.sector === sector && c.oot === oot)!;

const near = (actual: number | null | undefined, expected: number, label: string, tol = 1e-6) =>
  assert.ok(
    actual != null && Math.abs(actual - expected) < tol,
    `${label}: expected ≈ ${expected}, got ${actual}`,
  );

function tradingDays(start: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

test("纯函数：三 horizon cum 手算 + 去重单元 + cell（n/hitRate/baseline/lift/CI/insufficient）", () => {
  const res = computeBacktest(mainInput([{ t0Date: D09(4), direction: "bullish", scope: ["semicap"] }]));
  assert.equal(res.rows, 1);
  assert.equal(res.excludedNeutral, 0);
  assert.equal(res.skippedNoMarket, 0);
  assert.equal(res.units.length, 1);
  const u = res.units[0];
  assert.equal(u.key, "2026-09-04|BK1036|bullish");
  assert.equal(u.sector, "BK1036");
  // T0=09-04(i=3)，T0m1=09-03(close=105)；T+1=09-04(110)，T+3=09-06(120)，T+5=09-08(118)
  near(u.cum.get(1)!, (110 / 105 - 1) * 100, "t1 cum");
  near(u.cum.get(3)!, (120 / 105 - 1) * 100, "t3 cum");
  near(u.cum.get(5)!, (118 / 105 - 1) * 100, "t5 cum");
  const t1 = cell(res, "t1", "BK1036", false);
  assert.equal(t1.n, 1);
  near(t1.hitRate!, 1, "t1 hitRate");
  near(t1.baseline!, 0.75, "t1 baseline"); // 手算 6/8（sign 参照 cN/c0-1）
  near(t1.lift!, 0.25, "t1 lift");
  near(t1.ci, 0, "t1 ci"); // p=1 → CI 半宽 0
  assert.equal(t1.insufficient, true); // n<30
  assert.equal(cell(res, "t1", "BK1036", true).n, 0); // OOT 无样本
  near(cell(res, "t3", "BK1036", false).baseline!, 4 / 6, "t3 baseline"); // 手算 4/6
  near(cell(res, "t5", "BK1036", false).baseline!, 3 / 4, "t5 baseline"); // 手算 3/4
  const pooled = cell(res, "t1", "__pooled__", false);
  assert.equal(pooled.n, 1);
  near(pooled.baseline!, 0.75, "pooled baseline");
  assert.match(res.markdown, /direction 回测报告 2026-09-30/);
  assert.match(res.markdown, /insufficient \(n<30\)/);
});

test("纯函数：bearish 且均值为负 → 三 horizon 全命中，baseline=1.0（单调下行惯性）", () => {
  const down = [100, 95, 90, 88, 86, 84, 82, 80, 78, 76];
  const res = computeBacktest(
    mainInput([{ t0Date: D09(4), direction: "bearish", scope: ["semicap"] }], "2026-09-30", 14, {
      BK1036: mkSeries(DAYS, down),
      sh000300: mkSeries(DAYS, down),
    }),
  );
  near(res.units[0].cum.get(1)!, (88 / 90 - 1) * 100, "t1 cum");
  near(res.units[0].cum.get(3)!, (84 / 90 - 1) * 100, "t3 cum");
  near(res.units[0].cum.get(5)!, (80 / 90 - 1) * 100, "t5 cum");
  for (const h of ["t1", "t3", "t5"] as const) {
    const c = cell(res, h, "BK1036", false);
    assert.equal(c.n, 1);
    near(c.hitRate!, 1, `${h} hitRate`);
    near(c.baseline!, 1, `${h} baseline`);
    near(c.lift!, 0, `${h} lift`);
  }
});

test("纯函数：cum 均值恰 0 不算命中；baseline 跳过 X 收益恰 0 的日", () => {
  const closes = [100, 100, 110, 105, 115, 110, 120, 115, 125, 130];
  const res = computeBacktest(
    mainInput([{ t0Date: D09(2), direction: "bullish", scope: ["semicap"] }], "2026-09-30", 14, {
      BK1036: mkSeries(DAYS, closes),
      sh000300: mkSeries(DAYS, closes),
    }),
  );
  near(res.units[0].cum.get(1)!, 0, "t1 cum"); // close(09-02)==close(09-01)
  const t1 = cell(res, "t1", "BK1036", false);
  assert.equal(t1.n, 1);
  near(t1.hitRate!, 0, "t1 hitRate（均值恰 0 不命中）");
  near(t1.baseline!, 4 / 7, "t1 baseline（j=1 r=0 跳过，7 个有效日 4 个同向）");
  near(cell(res, "t3", "BK1036", false).hitRate!, 1, "t3 hit");
  near(cell(res, "t3", "BK1036", false).baseline!, 0.6, "t3 baseline（3/5）");
  near(cell(res, "t5", "BK1036", false).baseline!, 2 / 3, "t5 baseline（2/3）");
});

test("纯函数：neutral/none/未知 direction → excludedNeutral，不产生单元", () => {
  const rows = [
    { t0Date: D09(4), direction: "bullish", scope: ["semicap"] },
    { t0Date: D09(4), direction: "neutral", scope: ["semicap"] },
    { t0Date: D09(4), direction: "none", scope: ["semicap"] },
    { t0Date: D09(4), direction: "sideways", scope: ["semicap"] },
  ];
  const res = computeBacktest(mainInput(rows));
  assert.equal(res.rows, 4);
  assert.equal(res.excludedNeutral, 3);
  assert.equal(res.units.length, 1);
});

test("纯函数：非交易日 t0 与最早交易日（T0m1 不可解）→ skippedNoMarket", () => {
  const rows = [
    { t0Date: "2026-09-15", direction: "bullish", scope: ["semicap"] }, // 不是交易日
    { t0Date: D09(1), direction: "bullish", scope: ["semicap"] }, // 最早交易日，i=0
    { t0Date: D09(4), direction: "bullish", scope: ["semicap"] },
  ];
  const res = computeBacktest(mainInput(rows));
  assert.equal(res.skippedNoMarket, 2);
  assert.equal(res.units.length, 1);
});

test("纯函数：baseline 窗口按 asOf 截断（X 只取 ≤ asOf）", () => {
  // asOf=09-04：t1 baseline 只有 j=1..3 → 2/3（全窗口 09-30 下是 6/8=0.75）
  const res = computeBacktest(mainInput([{ t0Date: D09(4), direction: "bullish", scope: ["semicap"] }], "2026-09-04", 14));
  near(cell(res, "t1", "BK1036", false).baseline!, 2 / 3, "in-sample t1 baseline");
  near(cell(res, "t1", "BK1036", true).baseline!, 2 / 3, "OOT t1 baseline");
  assert.equal(cell(res, "t1", "BK1036", false).n, 0);
  assert.equal(cell(res, "t1", "BK1036", true).n, 1); // ootCut=08-21，09-04 落 OOT
});

test("纯函数：OOT 分界（t0_date > asOf-ootDays）；尾部 horizon 未到达不写 cum", () => {
  const rows = [
    { t0Date: D09(4), direction: "bullish", scope: ["semicap"] }, // in-sample（≤09-05）
    { t0Date: D09(8), direction: "bullish", scope: ["semicap"] }, // OOT
  ];
  const res = computeBacktest(mainInput(rows, "2026-09-10", 5));
  assert.equal(res.units.length, 2);
  const u2 = res.units.find((u) => u.date === D09(8))!;
  // T0=09-08(i=7)，T0m1=09-07(114)；T+1=09-08(118)，T+3=09-10(130)；T+5 超出序列 → 无
  near(u2.cum.get(1)!, (118 / 114 - 1) * 100, "t1 cum");
  near(u2.cum.get(3)!, (130 / 114 - 1) * 100, "t3 cum");
  assert.equal(u2.cum.has(5), false, "T+5 未到达 → 无 cum");
  assert.equal(cell(res, "t1", "BK1036", false).n, 1);
  assert.equal(cell(res, "t1", "BK1036", true).n, 1);
  assert.equal(cell(res, "t5", "BK1036", false).n, 1);
  assert.equal(cell(res, "t5", "BK1036", true).n, 0);
});

test("纯函数：n=30 → 非 insufficient；markdown 进 T1.4 占位（非全部 insufficient 分支）", () => {
  const days = tradingDays("2026-08-01", 35);
  const closes = days.map((_, i) => 100 + i); // 单调上行：bullish 全命中、baseline 恒 1.0
  const rows = days.slice(1, 31).map((d) => ({ t0Date: d, direction: "bullish", scope: ["semicap"] }));
  const res = computeBacktest({
    asOf: "2026-12-31",
    ootDays: 14,
    globalDays: days,
    rows,
    indexSeries: new Map<string, BtSeries>([["BK1036", mkSeries(days, closes)]]),
  });
  for (const h of ["t1", "t3", "t5"] as const) {
    const c = cell(res, h, "BK1036", false);
    assert.equal(c.n, 30, `${h} n`);
    near(c.hitRate!, 1, `${h} hitRate`);
    near(c.baseline!, 1, `${h} baseline`);
    near(c.lift!, 0, `${h} lift`);
    assert.equal(c.insufficient, false, `${h} insufficient`);
    near(c.ci, 0, `${h} ci`);
  }
  assert.match(res.markdown, /T1\.4 决策记录占位/);
});

test("纯函数：板块切分 vs pooled（scope 板块等权）", () => {
  const closes = [100, 105, 110, 115, 120, 125, 130, 135, 140, 145];
  const res = computeBacktest(
    mainInput(
      [
        { t0Date: D09(4), direction: "bullish", scope: ["semicap"] },
        { t0Date: D09(5), direction: "bullish", scope: ["liquor"] },
      ],
      "2026-09-30",
      14,
      { BK1036: mkSeries(DAYS, closes), BK0438: mkSeries(DAYS, closes) },
    ),
  );
  assert.equal(res.units.length, 2);
  const s1 = cell(res, "t1", "BK1036", false);
  const s2 = cell(res, "t1", "BK0438", false);
  const p = cell(res, "t1", "__pooled__", false);
  assert.equal(s1.n, 1);
  assert.equal(s2.n, 1);
  assert.equal(p.n, 2);
  near(s1.hitRate!, 1, "semicap hit");
  near(s2.hitRate!, 1, "liquor hit");
  near(p.hitRate!, 1, "pooled hit");
  near(s1.baseline!, 1, "semicap baseline");
  near(p.baseline!, 1, "pooled baseline");
  near(res.units.find((u) => u.date === D09(4))!.cum.get(1)!, (115 / 110 - 1) * 100, "unit t1 cum");
});

test("纯函数：序列选择 — 自有齐全才用自有，且自有优先于 bench", () => {
  const own = mkSeries(DAYS, [100, 102, 104, 106, 108, 110, 112, 114, 116, 118]);
  const bench = mkSeries(DAYS, [100, 110, 120, 130, 140, 150, 160, 170, 180, 190]);
  const res = computeBacktest(
    mainInput([{ t0Date: D09(3), direction: "bullish", scope: ["semicap"] }], "2026-09-30", 14, {
      BK1036: own,
      sh000300: bench,
    }),
  );
  // 自有齐全 → 用自有：T0m1=09-02(102)，T+1=09-03(104)；bench 口径会是 120/110-1
  near(res.units[0].cum.get(1)!, (104 / 102 - 1) * 100, "t1（自有优先）");
});

test("纯函数：序列选择 — 自有缺所需日 → 回退 benchIndex", () => {
  const own = mkSeries(DAYS, [100, 102, 104, 106, null, 110, 112, 114, 116, 118]); // 09-05 缺收盘
  const bench = mkSeries(DAYS, [100, 110, 120, 130, 140, 150, 160, 170, 180, 190]);
  const res = computeBacktest(
    mainInput([{ t0Date: D09(3), direction: "bullish", scope: ["semicap"] }], "2026-09-30", 14, {
      BK1036: own,
      sh000300: bench,
    }),
  );
  // 所需日含 T+3=09-05（自有 null）→ 回退 bench：T0m1=09-02(110)，T+1=09-03(120)，T+3=09-05(140)
  near(res.units[0].cum.get(1)!, (120 / 110 - 1) * 100, "t1（bench 回退）");
  near(res.units[0].cum.get(3)!, (140 / 110 - 1) * 100, "t3（bench 回退）");
});

test("纯函数：scope 解析 — key/indexKey 均可，未知丢弃并去重；全未知 scope 不产生单元", () => {
  assert.equal(resolveSectors(["semicap"]).length, 1);
  assert.equal(resolveSectors(["semicap"])[0].key, "semicap");
  assert.equal(resolveSectors(["BK0438"])[0].key, "liquor"); // indexKey 形态
  assert.deepEqual(resolveSectors(["bogus"]), []);
  assert.equal(resolveSectors(["semicap", "BK1036"]).length, 1); // 去重
  const res = computeBacktest(mainInput([{ t0Date: D09(4), direction: "bullish", scope: ["bogus"] }]));
  assert.equal(res.units.length, 0);
  assert.equal(res.excludedNeutral, 0);
  assert.equal(res.skippedNoMarket, 0);
});

test("纯函数：空台账行 → markdown 样本不足声明", () => {
  const res = computeBacktest(mainInput([]));
  assert.match(res.markdown, /样本不足/);
});

// ---- 真实 DB fixture（labeler.test.ts 同款：随机 2027+ 年月）----
// 夹具 7 个交易日：D0=MM-02（T0m1），MM-03..10 假期空档，T0=MM-11= D1，D2..D6=MM-12..16。
// 两行台账（同 t0 同板块不同方向）：bullish + bearish [semicap]，labeler 标注后
//   t1/t3/t5 = 100/100-1=0 / 104/100-1=4 / 108/100-1=8（%）。
const run = Math.random().toString(16).slice(2, 8);
const Y = 2027 + Math.floor(Math.random() * 3);
const MM = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const D = (day: number) => `${Y}-${MM}-${String(day).padStart(2, "0")}`;
const D0 = D(2);
const D1 = D(11);
const D2 = D(12),
  D3 = D(13),
  D4 = D(14),
  D5 = D(15),
  D6 = D(16);
const ALL_DATES = [D0, D1, D2, D3, D4, D5, D6];
const BK: Record<string, number> = { [D0]: 100, [D1]: 100, [D2]: 102, [D3]: 104, [D4]: 106, [D5]: 108, [D6]: 105 };
const SH: Record<string, number> = {
  [D0]: 3000,
  [D1]: 3000,
  [D2]: 3015,
  [D3]: 3030,
  [D4]: 3045,
  [D5]: 3060,
  [D6]: 3090,
};

const ids = {
  sources: [] as string[],
  articles: [] as string[],
  analyses: [] as number[],
  ledger: [] as number[],
};
let ID_BULL = 0;
let ID_BEAR = 0;
let outDir = "";

before(async () => {
  const srcId = `bt${run}src`;
  await sql`INSERT INTO sources (id, name, kind) VALUES (${srcId}, 'backtest-test', 'rss')`;
  ids.sources.push(srcId);
  const mkLedger = async (n: number, direction: string) => {
    const articleId = `bt${run}a${n}`;
    await sql`
      INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
      VALUES (${articleId}, ${srcId}, ${articleId}, ${`https://example.com/${articleId}`}, ${`backtest fixture ${n}`}, now(), now())`;
    ids.articles.push(articleId);
    const [a] = await sql`INSERT INTO analyses (article_id, input_revision, origin) VALUES (${articleId}, 1, 'model') RETURNING id`;
    ids.analyses.push(a.id);
    const [l] = await sql`
      INSERT INTO prediction_ledger
        (analyses_id, article_id, t0, prompt_version, direction, direction_status, scope, input_snapshot)
      VALUES (${a.id}, ${articleId}, ${new Date(Date.UTC(Y, Number(MM) - 1, 2, 6, 0, 0))}, 'v-backtest-test', ${direction}, 'ok', ${["semicap"]}, ${sql.json({ title_zh: String(n) })}::jsonb)
      RETURNING id`;
    ids.ledger.push(l.id);
    return l.id;
  };
  ID_BULL = await mkLedger(1, "bullish");
  ID_BEAR = await mkLedger(2, "bearish");
  for (const [key, closes] of [["BK1036", BK], ["sh000300", SH]] as const) {
    for (const [d, c] of Object.entries(closes)) {
      await sql`
        INSERT INTO market_daily (trade_date, index_key, close)
        VALUES (${d}::date, ${key}, ${c})
        ON CONFLICT (trade_date, index_key) DO UPDATE SET close = EXCLUDED.close`;
    }
  }
  await labelOutcomes(); // 标注：t1/t3/t5 = 0 / 4 / 8（%）
  outDir = mkdtempSync(join(tmpdir(), "bt-"));
});

after(async () => {
  await sql`DELETE FROM prediction_ledger WHERE id = ANY(${ids.ledger}::bigint[])`;
  await sql`DELETE FROM analyses WHERE id = ANY(${ids.analyses}::bigint[])`;
  await sql`DELETE FROM articles WHERE id = ANY(${ids.articles}::text[])`;
  await sql`DELETE FROM sources WHERE id = ANY(${ids.sources}::text[])`;
  await sql`DELETE FROM market_daily WHERE index_key IN ('BK1036', 'sh000300') AND trade_date = ANY(${ALL_DATES}::date[])`;
  if (outDir) rmSync(outDir, { recursive: true, force: true });
  await closeDb();
});

/** postgres.js 把 date 列解成 Date 对象：先归一成 YYYY-MM-DD 再断言（与 labeler 同一纪律）。 */
const dateStr = (v: unknown) =>
  v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

test("DB：computeBacktest 单元 cum 与 labeler 存储的 cum_pct_tN 一致 + cell 手算", async () => {
  const [bull] = await sql<{ id: number; t0_date: unknown; outcome_status: string; cum_pct_t1: number; cum_pct_t3: number; cum_pct_t5: number }[]>`
    SELECT id, t0_date, outcome_status, cum_pct_t1, cum_pct_t3, cum_pct_t5
    FROM prediction_ledger WHERE id IN (${ID_BULL}, ${ID_BEAR}) ORDER BY id`;
  assert.equal(bull.outcome_status, "labeled");
  assert.equal(dateStr(bull.t0_date), D1); // T0 = 严格晚于 D0 的第一个交易日

  const mk = (rec: Record<string, number>): BtSeries => ({
    days: ALL_DATES,
    closes: new Map<string, number | null>(ALL_DATES.map((d) => [d, rec[d] ?? null])),
  });
  const res = computeBacktest({
    asOf: D6,
    ootDays: 0, // ootCut=asOf → 本夹具行全落 in-sample（OOT 分界已在纯函数层覆盖）
    globalDays: ALL_DATES,
    rows: [
      { t0Date: D1, direction: "bullish", scope: ["semicap"] },
      { t0Date: D1, direction: "bearish", scope: ["semicap"] },
    ],
    indexSeries: new Map<string, BtSeries>([["BK1036", mk(BK)], ["sh000300", mk(SH)]]),
  });
  assert.equal(res.units.length, 2); // 不同 direction → 两个去重单元
  for (const u of res.units) {
    near(u.cum.get(1)!, bull.cum_pct_t1, `${u.direction} t1 vs labeler`, 1e-3);
    near(u.cum.get(3)!, bull.cum_pct_t3, `${u.direction} t3 vs labeler`, 1e-3);
    near(u.cum.get(5)!, bull.cum_pct_t5, `${u.direction} t5 vs labeler`, 1e-3);
  }
  const t1 = cell(res, "t1", "BK1036", false);
  assert.equal(t1.n, 2);
  near(t1.hitRate!, 0, "t1 hitRate（均值恰 0：bullish 不命中、bearish 也不命中）");
  near(t1.baseline!, 3 / 4, "t1 baseline（j=1 r=0 跳过，4 有效 3 同向）");
  near(t1.lift!, -3 / 4, "t1 lift");
  near(cell(res, "t3", "BK1036", false).hitRate!, 0.5, "t3 hitRate（仅 bullish 命中）");
  near(cell(res, "t3", "BK1036", false).baseline!, 1, "t3 baseline（2/2）");
  assert.equal(cell(res, "t5", "BK1036", false).baseline, null, "t5 baseline：唯一有效 X 收益恰 0 → null");
  assert.equal(cell(res, "t5", "BK1036", false).lift, null);
  assert.equal(t1.insufficient, true);
  assert.match(res.markdown, /insufficient \(n<30\)/);
});

test("DB：CLI 端到端 — SQL + 写 markdown 报告（exit 0、as-of 生效、内容含本夹具板块）", async () => {
  await new Promise<void>((resolve, reject) => {
    execFile(
      process.execPath,
      ["scripts/backtest.ts", "--as-of", D6, "--out-dir", outDir],
      { cwd: process.cwd(), env: process.env, timeout: 90_000 },
      (err, _stdout, stderr) => (err ? reject(new Error(`backtest CLI 失败: ${stderr || err.message}`)) : resolve()),
    );
  });
  const md = readFileSync(join(outDir, `${D6}.md`), "utf8");
  assert.match(md, new RegExp(`direction 回测报告 ${D6}`));
  assert.match(md, /BK1036/);
  assert.match(md, /insufficient \(n<30\)/); // 本夹具样本 n=2
});
