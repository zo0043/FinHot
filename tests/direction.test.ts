// 方向步的纯逻辑：受控词表过滤与截断，v2（0041）的 horizon/confidence 容错 schema；
// W3（0042）的 T4.3 单次重试（本地 HTTP stub 替身模型，回执走真库）与 directions.md 输出契约。
import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { closeDb } from "@aihot/backend/db";
import { DirectionSchema, judgeDirection, sanitizeScope } from "@aihot/backend/editorial/direction";
import { SECTOR_KEYS } from "@aihot/industry/sectors";

test("sanitizeScope 只保留受控词表里的板块 key", () => {
  assert.deepEqual(sanitizeScope(["semicap", "白酒与食品饮料", "科创芯片"]), ["semicap"]); // 后两个是标签/别名不是 key
  assert.deepEqual(sanitizeScope(["a-share", "semicap"]), ["a-share", "semicap"]);
});

test("sanitizeScope 去重、截到最多 3 个、保持顺序", () => {
  assert.deepEqual(sanitizeScope(["semicap", "semicap", "a-share", "ai-app", "liquor"]), ["semicap", "a-share", "ai-app"]);
});

test("sanitizeScope 没有合法 key 时返回空数组", () => {
  assert.deepEqual(sanitizeScope(["nasdaq", "crypto", ""]), []);
});

test("sectorMeta 与词表的 key 一致（词表自身不变式）", () => {
  assert.ok(SECTOR_KEYS.every((k) => /^[a-z][a-z0-9-]*$/.test(k)));
  assert.ok(SECTOR_KEYS.includes("semicap") && SECTOR_KEYS.includes("a-share") && SECTOR_KEYS.includes("macro"));
});

// v2（0041）：primary_horizon ∈ t1/t3/t5 + confidence 0-100 整数；缺失/非法 → null 容错，不抛不 reject
//（验收是 ≥95% 新预测有值，不是 100%——坏输出不能把整条预测拖成 failed）。
test("DirectionSchema：合法的 horizon/confidence 原样通过", () => {
  for (const horizon of ["t1", "t3", "t5"] as const) {
    const r = DirectionSchema.parse({ direction: "bullish", scope: ["semicap"], note: "业绩超预期", primary_horizon: horizon, confidence: 72, horizon_reason: "业绩次日定价" });
    assert.deepEqual([r.direction, r.scope, r.primary_horizon, r.confidence], ["bullish", ["semicap"], horizon, 72]);
  }
  // 边界值 0/100 合法；confidence 是数字字符串也接受（coerce，与 ScoreSchema 同一纪律）。
  assert.equal(DirectionSchema.parse({ direction: "bearish", scope: [], note: "", primary_horizon: "t5", confidence: 0 }).confidence, 0);
  assert.equal(DirectionSchema.parse({ direction: "bearish", scope: [], note: "", primary_horizon: "t5", confidence: 100 }).confidence, 100);
  assert.equal(DirectionSchema.parse({ direction: "bullish", scope: [], note: "", primary_horizon: "t3", confidence: "68" }).confidence, 68);
});

test("DirectionSchema：缺失的 horizon/confidence → null，不抛", () => {
  const r = DirectionSchema.parse({ direction: "none", scope: [], note: "" });
  assert.deepEqual([r.primary_horizon, r.confidence, r.direction], [null, null, "none"]);
});

test("DirectionSchema：非法的 horizon/confidence → null 容错（不 reject）", () => {
  // horizon 受控词表外：
  for (const bad of ["t2", "T1", "t+5", "day5", "t1 "]) {
    assert.equal(DirectionSchema.parse({ direction: "bullish", scope: [], note: "", primary_horizon: bad, confidence: 50 }).primary_horizon, null, `horizon ${JSON.stringify(bad)}`);
  }
  // confidence 越界/非整数/非数字：
  for (const bad of [-1, 101, 68.5, "abc", null, undefined]) {
    assert.equal(DirectionSchema.parse({ direction: "bullish", scope: [], note: "", primary_horizon: "t3", confidence: bad }).confidence, null, `confidence ${JSON.stringify(bad)}`);
  }
  // 坏 horizon 不影响 direction/scope 的正常解析：
  const r = DirectionSchema.parse({ direction: "bearish", scope: ["semicap"], note: "减持公告", primary_horizon: "t99", confidence: 999 });
  assert.deepEqual([r.direction, r.scope, r.primary_horizon, r.confidence], ["bearish", ["semicap"], null, null]);
});

// W3（0042）：directions.md 输出契约样例必须含 policy_stage 字段（提示词与解析同进退）。
test("directions.md 输出契约样例含 policy_stage 字段", () => {
  const text = readFileSync(new URL("../industry/prompts/directions.md", import.meta.url), "utf8");
  assert.match(text, /"policy_stage":/);
});

// T4.3 单次重试：direction 解析失败（非法 JSON / 契约不可用）→ 换 attemptTag 后缀 -r2 重调一次
//（回执为新调用）；仍失败则结果保持 null 并记日志，不抛、不拖垮主流程。
const VALID_DIRECTION = '{"direction":"bullish","scope":["semicap"],"note":"政策扶持","primary_horizon":"t3","confidence":70,"policy_stage":"details"}';
let answer: (hit: number) => string = () => VALID_DIRECTION;
const provider = await stub((hit) => ({ id: `stub-${hit}`, choices: [{ message: { content: answer(hit) } }], usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 } }));
process.env.DIRECTION_MODEL = "default";
process.env.LLM_BASE_URL = `${provider.url}/v1`;
process.env.LLM_API_KEY = "test-key";
process.env.LLM_MODEL = "stub-model";

after(async () => {
  await provider.close();
  await closeDb();
});

test("direction 单次重试：首次解析失败、第二次成功 → 返回有效结果（T4.3）", async () => {
  // 标题带随机 tag：回执 logical key 不含 subject，固定输入会让历史回执跨运行复用，破坏「首次失败」场景。
  const subject = `retry-ok-${tag()}`;
  const before = provider.hits();
  answer = (hit) => (hit === before + 1 ? "sorry, not json" : VALID_DIRECTION);
  const r = await judgeDirection({ title: `国务院印发配套细则 ${tag()}`, summary: "国务院印发若干措施，明确执行时间表。", itemType: "policy_regulation" }, { promptVersion: "t-retry", subject });
  assert.equal(provider.hits() - before, 2, "恰好两次模型调用（重试一次）");
  assert.ok(r);
  assert.equal(r.direction, "bullish");
  assert.equal(r.policy_stage, "details");
});

test("direction 单次重试：两次都失败 → 结果保持 null 不抛，且没有第三次调用（T4.3）", async () => {
  const subject = `retry-fail-${tag()}`;
  const before = provider.hits();
  answer = () => "sorry, not json";
  const r = await judgeDirection({ title: `公告 ${tag()}`, summary: "某公司披露定期报告。", itemType: "policy_regulation" }, { promptVersion: "t-retry", subject });
  assert.equal(r, null, "两次失败后结果保持 null");
  assert.equal(provider.hits() - before, 2, "只重试一次，没有第三次调用");
});
