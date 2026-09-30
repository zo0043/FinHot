// 东财行情解析与 secid 映射的纯逻辑。网络部分在服务器上验证（本机不通外网、无 DB）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuotes, toSecid } from "@aihot/backend/market/eastmoney";
import { rowsFromQuotes } from "@aihot/backend/market/daily";
import { SECTORS } from "@aihot/industry/sectors";

test("toSecid：指数与板块的 secid 映射", () => {
  assert.equal(toSecid("sh000300"), "1.000300");
  assert.equal(toSecid("sz399001"), "0.399001");
  assert.equal(toSecid("BK1036"), "90.BK1036");
  assert.throws(() => toSecid("kaboom"));
});

test("parseQuotes：按 f59 缩放、f170 按 100 缩放、f86 取时间戳", () => {
  const rows = parseQuotes({ data: { diff: [{ f13: "000300", f14: 1, f59: 2, f43: 300123, f60: 298800, f170: 443, f86: 1759228800 }] } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.secid, "1.000300"); // 市场号自 f14 拼回
  assert.equal(rows[0]!.price, 3001.23);
  assert.equal(rows[0]!.prevClose, 2988);
  assert.equal(rows[0]!.pct, 4.43);
  assert.equal(rows[0]!.at, 1759228800);
});

test("parseQuotes：缺字段与坏数据跳过，不抛错", () => {
  assert.deepEqual(parseQuotes({ data: { diff: [{ f13: "000001", f14: 1, f60: 3000 }] } }), []); // f43 缺失
  assert.deepEqual(parseQuotes(null), []);
  assert.deepEqual(parseQuotes({ nope: 1 }), []);
});

test("rowsFromQuotes：secid 找回 index_key，不认得的跳过", () => {
  const rows = rowsFromQuotes(
    [
      { secid: "1.000300", price: 3001.23, prevClose: 2988, pct: 0.44 },
      { secid: "90.BK9999", price: 100, prevClose: 99, pct: 1 }, // 词表里没有的板块
    ],
    "2026-09-30",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.index_key, "sh000300");
  assert.equal(rows[0]!.trade_date, "2026-09-30");
});

test("sectors.ts 的 indexKey 都能转成 secid（词表不变式）", () => {
  for (const s of SECTORS) assert.doesNotThrow(() => toSecid(s.indexKey), `${s.key} 的 indexKey 无法转 secid`);
});
