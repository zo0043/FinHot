// The Bark push URL builder (notify/bark.ts): title and body go in the path (percent-encoded, truncated),
// sound/group/url/level in the query only when set. No network — the fetch itself runs against the real
// Bark service and is not covered here.
import assert from "node:assert/strict";
import { test } from "node:test";
import { barkUrl, truncate } from "@aihot/backend/notify/bark";
import { directionDisplay } from "@aihot/backend/editorial/direction";

test("truncate 压平换行、去首尾空白，按字符数截断（中文一个算一个）", () => {
  assert.equal(truncate("  标题\n换行  ", 40), "标题 换行");
  assert.equal(truncate("一二三四五", 5), "一二三四五");
  assert.equal(truncate("一二三四五六", 5), "一二三四…"); // 上限 5 = 4 个字 + 省略号
});

test("barkUrl 把键、标题、正文都编进路径", () => {
  assert.equal(barkUrl("k", "标题", "正文"), `https://api.day.app/k/${encodeURIComponent("标题")}/${encodeURIComponent("正文")}`);
  assert.equal(barkUrl("k空", "标题?x", "正文#1"), `https://api.day.app/k%E7%A9%BA/${encodeURIComponent("标题?x")}/${encodeURIComponent("正文#1")}`);
});

test("barkUrl query 只放存在的参数，level=0 也要传", () => {
  assert.equal(barkUrl("k", "t", "b"), "https://api.day.app/k/t/b");
  const full = barkUrl("k", "t", "b", { group: "FinHot告警", sound: "alarm", url: "https://finhot.example/i/x", level: 100 });
  assert.ok(full.startsWith("https://api.day.app/k/t/b?"));
  assert.ok(full.includes("group=FinHot%E5%91%8A%E8%AD%A6"));
  assert.ok(full.includes("sound=alarm"));
  assert.ok(full.includes("level=100"));
  assert.ok(full.includes("url=https%3A%2F%2Ffinhot.example%2Fi%2Fx"));
  assert.ok(barkUrl("k", "t", "b", { level: 0 }).includes("level=0"));
});

test("barkUrl 正文超长按上限截断", () => {
  const url = barkUrl("k", "t", "一".repeat(500), { bodyMax: 300 });
  assert.ok(decodeURIComponent(url.split("/").pop() ?? "").endsWith("…"));
  assert.equal(decodeURIComponent(url.split("/").pop() ?? "").length, 300);
});

// 入选推送的方向行共用 editorial/direction.ts 的 directionDisplay（feishu 卡片与 bark 同一条文案）。
test("directionDisplay 中文映射：bullish/bearish/neutral → 利好/利空/中性", () => {
  assert.equal(directionDisplay("bullish"), "利好");
  assert.equal(directionDisplay("bearish"), "利空");
  assert.equal(directionDisplay("neutral"), "中性");
});

test("directionDisplay 板块 key 映射为板块名并 join", () => {
  assert.equal(directionDisplay("bullish", ["semicap", "ai-app"]), "利好 · 板块：半导体/算力、AI 应用/软件");
  assert.equal(directionDisplay("bearish", ["liquor"]), "利空 · 板块：白酒/食品饮料");
  assert.equal(directionDisplay("neutral", ["semicap", "liquor", "bank"]), "中性 · 板块：半导体/算力、白酒/食品饮料、银行/保险");
});

test("directionDisplay none/null/未知值 → null（方向行不展示）", () => {
  assert.equal(directionDisplay("none", ["semicap"]), null);
  assert.equal(directionDisplay(null, ["semicap"]), null);
  assert.equal(directionDisplay(undefined), null);
  assert.equal(directionDisplay("sideways", ["semicap"]), null);
});

test("directionDisplay 未知板块 key 原样保留、空 key 忽略", () => {
  assert.equal(directionDisplay("neutral", ["not-a-sector-key"]), "中性 · 板块：not-a-sector-key");
  assert.equal(directionDisplay("neutral", ["", ""]), "中性");
});
