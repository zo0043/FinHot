// The category fallback chain (industry/taxonomy.ts deriveCategory): the structure step lets the model
// fail on category (about 84% of samples historically ended up null), so the fallback order is
// structure → itemType → the first category tag → null. Deterministic, no model call.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CATEGORY_BY_ITEM_TYPE, CATEGORY_BY_TAG, CATEGORIES, deriveCategory } from "@aihot/industry/taxonomy";

test("structure 步给了 category 就直接用", () => {
  assert.equal(deriveCategory("market", "market_shift", ["其他"]), "market");
  // 模型给的 key 优先于后面所有兜底
  assert.equal(deriveCategory("research", "company_filing", ["公司公告"]), "research");
});

test("itemType → 分类标签 → 类别 key", () => {
  for (const [itemType, categoryKey] of [
    ["company_filing", "a-share"],
    ["capital_deal", "a-share"],
    ["policy_regulation", "macro"],
    ["market_shift", "market"],
    ["data_release", "research"],
    ["opinion_view", "people"],
    ["research_explainer", "research"],
  ] as const) {
    const tag = CATEGORY_BY_ITEM_TYPE[itemType]!;
    assert.equal(deriveCategory(null, itemType, []), categoryKey, `${itemType} 应落到 ${categoryKey}`);
    assert.equal(CATEGORY_BY_TAG[tag as keyof typeof CATEGORY_BY_TAG], categoryKey);
  }
});

test("itemType 落空时用第一个分类标签", () => {
  assert.equal(deriveCategory(null, undefined, ["半导体", "行情/异动", "数据发布"]), "market");
  assert.equal(deriveCategory(null, undefined, ["宁德时代", "其他"]), "industry"); // 兜底类别
  assert.equal(deriveCategory(null, undefined, ["宁德时代", "贵州茅台"]), null); // 标签里没有分类标签
});

test("每个分类标签都映射到存在的类别 key", () => {
  const keys = new Set(CATEGORIES.map((c) => c.key));
  for (const key of Object.values(CATEGORY_BY_TAG)) assert.ok(keys.has(key), `${key} 不在 CATEGORIES 里`);
});
