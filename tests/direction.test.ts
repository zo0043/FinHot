// 方向步的纯逻辑：受控词表过滤与截断。模型调用本身在 analyze 流程里跑，单测只测这一层。
import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeScope } from "@aihot/backend/editorial/direction";
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
