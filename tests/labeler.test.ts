// T+N 结果标注（prediction_ledger.outcome_*）：真实 DB 测试（finhot_ci，setup.ts 校验库名）。
// 夹具：随机 2027 年月（每次运行不同，避免与其他 lane 撞键）的 8 个交易日序列：
//   d0=MM-02，MM-03..MM-10 假期空档，T0=MM-11，T1=MM-12，T2=MM-13，T3=MM-14，T4=MM-15，T5=MM-16。
// 五个台账行覆盖：(a) 正常标注（T0 跳过假期空档） (b) 板块缺行 → 基准回退
//   (c) neutral → skipped (d) t0 后无交易日 → skipped + last_error (e) 幂等 (f) 部分就绪。
// 收盘手算：
//   BK1036(semicap)  d0=100 T0=100 T1=102 T2=104 T3=106 T4=108 T5=105
//   sh000300(bench)  d0=3000 T0=3000 T1=3015 T2=3030 T3=3045 T4=3060 T5=3090
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { labelOutcomes } from "@aihot/backend/market/labeler";
import "./setup.ts";

const run = Math.random().toString(16).slice(2, 8); // 每次运行唯一后缀
const Y = 2027 + Math.floor(Math.random() * 3);
const MM = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const D = (day: number) => `${Y}-${MM}-${String(day).padStart(2, "0")}`;

const D0 = D(2); // T0m1（基线收盘日）
const T0 = D(11); // 严格晚于 D0 的第一个交易日（跳过 MM-03..MM-10 空档）
const T1 = D(12), T2 = D(13), T3 = D(14), T4 = D(15), T5 = D(16);
const ALL_DATES = [D0, T0, T1, T2, T3, T4, T5];

const BK: Record<string, number> = { [D0]: 100, [T0]: 100, [T1]: 102, [T2]: 104, [T3]: 106, [T4]: 108, [T5]: 105 };
const SH: Record<string, number> = { [D0]: 3000, [T0]: 3000, [T1]: 3015, [T2]: 3030, [T3]: 3045, [T4]: 3060, [T5]: 3090 };

const ids = { sources: [] as string[], articles: [] as string[], analyses: [] as number[], ledger: [] as number[] };
let ID_A = 0, ID_B = 0, ID_C = 0, ID_D = 0, ID_F = 0;

before(async () => {
  const srcId = `lbl${run}src`;
  await sql`INSERT INTO sources (id, name, kind) VALUES (${srcId}, 'labeler-test', 'rss')`;
  ids.sources.push(srcId);

  const mkLedger = async (n: number, t0: Date, direction: string, scope: string[], snapshot: object) => {
    const articleId = `lbl${run}a${n}`;
    await sql`
      INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
      VALUES (${articleId}, ${srcId}, ${articleId}, ${`https://example.com/${articleId}`}, ${`labeler fixture ${n}`}, now(), now())`;
    ids.articles.push(articleId);
    const [a] = await sql`INSERT INTO analyses (article_id, input_revision, origin) VALUES (${articleId}, 1, 'model') RETURNING id`;
    ids.analyses.push(a.id);
    const [l] = await sql`
      INSERT INTO prediction_ledger
        (analyses_id, article_id, t0, prompt_version, direction, direction_status, scope, input_snapshot)
      VALUES (${a.id}, ${articleId}, ${t0}, 'v-labeler-test', ${direction}, 'ok', ${scope}, ${sql.json(snapshot as never)}::jsonb)
      RETURNING id`;
    ids.ledger.push(l.id);
    return l.id;
  };
  // 06:00Z = 14:00 北京时间，与日期字符串同一天
  const at = (day: number) => new Date(Date.UTC(Y, Number(MM) - 1, day, 6, 0, 0));

  ID_A = await mkLedger(1, at(2), "bullish", ["semicap"], { title_zh: "A" });
  ID_B = await mkLedger(2, at(2), "bearish", ["liquor", "semicap"], { title_zh: "B" });
  ID_C = await mkLedger(3, at(2), "neutral", ["semicap"], { title_zh: "C" });
  ID_D = await mkLedger(4, at(16), "bullish", ["semicap"], { title_zh: "D", prior_ctx: { n: 1 } });
  ID_F = await mkLedger(5, at(14), "bullish", ["semicap"], { title_zh: "F" });

  for (const [key, closes] of [["BK1036", BK], ["sh000300", SH]] as const) {
    for (const [d, c] of Object.entries(closes)) {
      await sql`
        INSERT INTO market_daily (trade_date, index_key, close)
        VALUES (${d}::date, ${key}, ${c})
        ON CONFLICT (trade_date, index_key) DO UPDATE SET close = EXCLUDED.close`;
    }
  }
});

after(async () => {
  await sql`DELETE FROM prediction_ledger WHERE id = ANY(${ids.ledger}::bigint[])`;
  await sql`DELETE FROM analyses WHERE id = ANY(${ids.analyses}::bigint[])`;
  await sql`DELETE FROM articles WHERE id = ANY(${ids.articles}::text[])`;
  await sql`DELETE FROM sources WHERE id = ANY(${ids.sources}::text[])`;
  await sql`DELETE FROM market_daily WHERE index_key IN ('BK1036', 'sh000300') AND trade_date = ANY(${ALL_DATES}::date[])`;
  await closeDb();
});

/** postgres.js 把 date 列解成 Date 对象：先归一成 YYYY-MM-DD 再断言（与 labeler 同一纪律）。 */
const dateStr = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

async function readLedger(id: number) {
  const [r] = await sql`
    SELECT t0_date, outcome_status, cum_pct_t1, cum_pct_t3, cum_pct_t5,
           hit_t1, hit_t3, hit_t5, baseline_ref, labeled_at, input_snapshot
    FROM prediction_ledger WHERE id = ${id}`;
  return r;
}

const near = (actual: number | null, expected: number, label: string) =>
  assert.ok(actual != null && Math.abs(actual - expected) < 1e-9, `${label}: expected ≈ ${expected}, got ${actual}`);

test("(a) t0 跳过假期空档：T0=首个其后交易日，t1/t3/t5 手算 + bullish 命中", async () => {
  const res = await labelOutcomes();
  assert.deepEqual(res, { labeled: 2, skipped: 2, pendingRemaining: 1 });
  const a = await readLedger(ID_A);
  assert.equal(dateStr(a.t0_date), T0);
  assert.equal(a.outcome_status, "labeled");
  near(a.cum_pct_t1, 2, "cum_pct_t1"); // 102/100-1
  near(a.cum_pct_t3, 6, "cum_pct_t3"); // 106/100-1
  near(a.cum_pct_t5, 5, "cum_pct_t5"); // 105/100-1
  assert.equal(a.hit_t1, true);
  assert.equal(a.hit_t3, true);
  assert.equal(a.hit_t5, true);
  assert.equal(a.baseline_ref, "sector:BK1036");
  assert.ok(a.labeled_at instanceof Date, "labeled_at 应已写");
});

test("(b) 板块无行 → benchIndex 回退，baseline_ref 按 scope 顺序拼接，bearish 全不命中", async () => {
  await labelOutcomes(); // 幂等：已标注行不受影响
  const b = await readLedger(ID_B);
  assert.equal(b.outcome_status, "labeled");
  // liquor→sh000300: t1 +0.5% t3 +1.5% t5 +3%；semicap 自有: t1 +2% t3 +6% t5 +5%；headline = 两板块均值
  near(b.cum_pct_t1, 1.25, "cum_pct_t1");
  near(b.cum_pct_t3, 3.75, "cum_pct_t3");
  near(b.cum_pct_t5, 4, "cum_pct_t5");
  assert.equal(b.hit_t1, false); // bearish 且均值为正 → 不命中
  assert.equal(b.hit_t3, false);
  assert.equal(b.hit_t5, false);
  assert.equal(b.baseline_ref, "bench:sh000300,sector:BK1036");
});

test("(c) direction=neutral → skipped：无 cum，但 t0_date 照记", async () => {
  const c = await readLedger(ID_C);
  assert.equal(c.outcome_status, "skipped");
  assert.equal(dateStr(c.t0_date), T0);
  assert.equal(c.cum_pct_t1, null);
  assert.equal(c.cum_pct_t3, null);
  assert.equal(c.cum_pct_t5, null);
  assert.equal(c.hit_t1, null);
  assert.equal(c.baseline_ref, null);
  assert.ok(c.labeled_at instanceof Date, "labeled_at 应已写");
});

test("(d) t0 后无交易日 → skipped，last_error 合并进 input_snapshot 且保留原键", async () => {
  const d = await readLedger(ID_D);
  assert.equal(d.outcome_status, "skipped");
  assert.equal(d.t0_date, null);
  assert.equal(d.cum_pct_t1, null);
  assert.equal(d.cum_pct_t5, null);
  const snap = d.input_snapshot as Record<string, unknown>;
  assert.equal(snap.title_zh, "D");
  assert.deepEqual(snap.prior_ctx, { n: 1 });
  assert.match(String(snap.last_error), /T0/);
});

test("(f) 部分就绪：只有 T+1 存在 → cum_pct_t1 写值，t3/t5 NULL，仍 pending 等下轮", async () => {
  const f = await readLedger(ID_F);
  assert.equal(f.outcome_status, "pending");
  assert.equal(dateStr(f.t0_date), T4); // T0 = 严格晚于 MM-14 的第一个交易日
  near(f.cum_pct_t1, -0.9434, "cum_pct_t1"); // 105/106-1
  assert.equal(f.hit_t1, false); // bullish 且均值为负 → 不命中
  assert.equal(f.cum_pct_t3, null);
  assert.equal(f.hit_t3, null);
  assert.equal(f.cum_pct_t5, null);
  assert.equal(f.hit_t5, null);
});

test("(e) 幂等：连续两跑不改任何行，pendingRemaining 恒为 1（F 等 T+5）", async () => {
  const snap = {
    a: await readLedger(ID_A),
    b: await readLedger(ID_B),
    c: await readLedger(ID_C),
    d: await readLedger(ID_D),
    f: await readLedger(ID_F),
  };
  assert.deepEqual(await labelOutcomes(), { labeled: 0, skipped: 0, pendingRemaining: 1 });
  assert.deepEqual(await labelOutcomes(), { labeled: 0, skipped: 0, pendingRemaining: 1 });
  assert.deepEqual(await readLedger(ID_A), snap.a, "A 被重写");
  assert.deepEqual(await readLedger(ID_B), snap.b, "B 被重写");
  assert.deepEqual(await readLedger(ID_C), snap.c, "C 被重写");
  assert.deepEqual(await readLedger(ID_D), snap.d, "D 被重写");
  assert.deepEqual(await readLedger(ID_F), snap.f, "F 被重写");
});
