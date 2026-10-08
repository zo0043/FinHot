// 方向步的纯逻辑：受控词表过滤与截断，v2（0041）的 horizon/confidence 容错 schema。
// 模型调用本身在 analyze 流程里跑，单测只测这一层。
import assert from "node:assert/strict";
import { test } from "node:test";
import { DirectionSchema, sanitizeScope } from "@aihot/backend/editorial/direction";
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
