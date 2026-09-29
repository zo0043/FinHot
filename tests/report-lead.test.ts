// A daily's front-page picture comes from the item its lead is about: the editors' lead matched to an
// item by title, never simply the first highlight.
import "./setup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReportCitation } from "@aihot/contracts/site";
import { leadItemOf } from "@aihot/backend/publication/reports";

const cite = (itemId: string, title: string) => ({ itemId, title }) as ReportCitation;
const arena = cite("a", "贵州茅台三季报净利增两成，机构上调目标价");
const openai = cite("b", "沪指放量收复 3900 点，两市成交额回到 1.2 万亿元");

test("an editors' lead is matched to the item it is written about", () => {
  assert.equal(leadItemOf("沪指放量收复 3900 点，两市成交额回到 1.2 万亿元", [arena, openai], [arena, openai])?.itemId, "b");
});

test("a lead that matches no item clearly has no item", () => {
  assert.equal(leadItemOf("多家公司上调业绩指引，行业景气度回升", [arena], [arena, openai]), undefined);
});

test("without an editors' lead the first highlight leads", () => {
  assert.equal(leadItemOf(undefined, [arena], [openai, arena])?.itemId, "a");
});
