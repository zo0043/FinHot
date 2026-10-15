// W3 政策化（0042）：policy_stage 生命周期字段。
// 覆盖：zod 解析容错（非法值 → null 不抛）、judgeDirection 对 policy_regulation 的解析与
// 非政策事件恒 null（本地 HTTP stub 替身模型，回执走真库）、迁移后 analyses/publications 的
// policy_stage 列与 CHECK 约束。参照 tests/direction.test.ts 的风格与 fixture。
import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { DirectionSchema, judgeDirection } from "@aihot/backend/editorial/direction";

const VALID = '{"direction":"bullish","scope":["semicap"],"note":"政策扶持","primary_horizon":"t3","confidence":70,"policy_stage":"details"}';
const provider = await stub(() => ({ id: "stub", choices: [{ message: { content: VALID } }], usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 } }));
// direction 能力走 default 模型（DIRECTION_MODEL 未设时），把它的凭据指到本地 stub。
process.env.DIRECTION_MODEL = "default";
process.env.LLM_BASE_URL = `${provider.url}/v1`;
process.env.LLM_API_KEY = "test-key";
process.env.LLM_MODEL = "stub-model";

const ask = (input: Parameters<typeof judgeDirection>[0]) =>
  judgeDirection(input, { promptVersion: "t-policy-stage", subject: `policy-stage:${tag()}` });

after(async () => {
  await provider.close();
  await closeDb();
});

test("DirectionSchema：policy_regulation 输出合法 policy_stage 原样通过", () => {
  for (const stage of ["draft", "release", "interpretation", "details", "pilot", "execution"] as const) {
    const r = DirectionSchema.parse({ direction: "bullish", scope: ["semicap"], note: "政策扶持", primary_horizon: "t3", confidence: 70, policy_stage: stage });
    assert.equal(r.policy_stage, stage, stage);
  }
});

test("DirectionSchema：缺失/显式 null/非法的 policy_stage → null 容错（不抛不 reject）", () => {
  assert.equal(DirectionSchema.parse({ direction: "bullish", scope: [], note: "" }).policy_stage, null);
  assert.equal(DirectionSchema.parse({ direction: "bullish", scope: [], note: "", policy_stage: null }).policy_stage, null);
  // 模型爱自由发挥（中文值、大小写、词表外）：一律归 null，不影响 direction/scope 的正常解析。
  for (const bad of ["已落地", "DETAILS", "t1", ""]) {
    const r = DirectionSchema.parse({ direction: "bearish", scope: ["semicap"], note: "减持公告", primary_horizon: "t3", confidence: 50, policy_stage: bad });
    assert.deepEqual([r.policy_stage, r.direction, r.scope], [null, "bearish", ["semicap"]], JSON.stringify(bad));
  }
});

test("judgeDirection：policy_regulation 输入，模型输出 policy_stage=details → 解析结果带值", async () => {
  const r = await ask({ title: "国务院印发配套细则", summary: "国务院印发关于某某的若干措施，明确执行时间表。", itemType: "policy_regulation" });
  assert.ok(r);
  assert.equal(r.direction, "bullish");
  assert.equal(r.policy_stage, "details");
});

test("judgeDirection：非 policy_regulation 输入（company_filing）→ policy_stage 恒 null（即使模型给了值）", async () => {
  const r = await ask({ title: "公司公告", summary: "某公司披露定期报告。", itemType: "company_filing" });
  assert.ok(r);
  assert.equal(r.policy_stage, null);
});

test("0042：analyses/publications 含 policy_stage 列，CHECK 约束拒绝非法值", async () => {
  for (const table of ["analyses", "publications"]) {
    const [col] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = 'policy_stage'`;
    assert.equal(col!.n, 1, `${table}.policy_stage 列`);
  }
  const sourceId = `policy-stage-check-src-${tag()}`;
  const articleId = `policy-stage-check-${tag()}`;
  // 非法值在事务里被 CHECK 拒绝，整笔回滚（不留测试行）。
  await assert.rejects(
    sql.begin(async (tx) => {
      await tx`INSERT INTO sources (id, name, kind) VALUES (${sourceId}, 'policy-stage check', 'rss')`;
      await tx`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
               VALUES (${articleId}, ${sourceId}, ${articleId}, 'http://example.com/policy-stage-check', 't', now(), now())`;
      await tx`INSERT INTO analyses (article_id, input_revision, origin, policy_stage) VALUES (${articleId}, 1, 'model', '已落地')`;
      await tx`INSERT INTO publications (article_id, title, url, source_id, discovered_at, timeline_at, policy_stage)
               VALUES (${articleId}, 't', 'http://example.com/policy-stage-check', ${sourceId}, now(), now(), '已落地')`;
    }),
    /policy_stage/,
  );
});
