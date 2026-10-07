import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";

import { SECTORS } from "@aihot/industry/sectors";
import {
  indexRow,
  parseIndexKline,
  parseRankBoards,
  resolveSectorBoards,
  rowsFromTencent,
  sane,
  SECTOR_TENCENT,
  type TencentBoard,
  type TencentMarketData,
} from "@aihot/backend/market/tencent";
import { parseKlineQuotes } from "@aihot/backend/market/eastmoney";
import {
  rowsFromQuotes,
  syncMarketDaily,
  writeMarketRows,
  type MarketRow,
  type MarketSourceResult,
} from "@aihot/backend/market/daily";

// ───────── fixture（2026-10-07 实测样本，交易日 2026-09-30） ─────────

const board = (code: string, name: string, zxj: number, zd: number, zdf: number, extra: Record<string, string> = {}) =>
  ({ code, name, stock_type: "BK", zxj: String(zxj), zd: String(zd), zdf: String(zdf), ...extra });

// 腾讯 hy 榜的 15 个申万一级（SECTOR_TENCENT 用到的）
const HY_ROWS = [
  board("pt01801120", "食品饮料", 13618.21, 225.63, 1.68),
  board("pt01801150", "医药生物", 8000, 40, 0.5),
  board("pt01801740", "国防军工", 1500, -15, -0.99),
  board("pt01801780", "银行", 1300, 5, 0.39),
  board("pt01801790", "非银金融", 2000, -20, -0.99),
  board("pt01801180", "房地产", 900, -9, -0.99),
  board("pt01801880", "汽车", 700, 7, 1.01),
  board("pt01801890", "机械设备", 1200, 6, 0.5),
  board("pt01801050", "有色金属", 5000, -50, -0.99),
  board("pt01801960", "石油石化", 600, 6, 1.01),
  board("pt01801170", "交通运输", 1100, -5.5, -0.5),
  board("pt01801770", "通信", 3000, 15, 0.5),
  board("pt01801760", "传媒", 800, -8, -0.99),
  board("pt01801730", "电力设备", 4000, 20, 0.5),
  board("pt01801010", "农林牧渔", 950, 4.75, 0.5),
];
// 腾讯 gn 榜的 3 个概念板（SECTOR_TENCENT 用到的）
const GN_ROWS = [
  board("pt02003891", "芯片概念", 3200, 64, 2.05),
  board("pt02003800", "人工智能", 2500, -25, -0.99),
  board("pt02003547", "黄金概念", 4800, 24, 0.5),
];

const KLINE_300 = {
  data: {
    sh000300: {
      day: [
        ["2026-09-28", "4215.46", "4318.03", "4242.57", "4200.91", "278637884", ""],
        ["2026-09-29", "4318.35", "4345.21", "4352.61", "4291.83", "308465970", ""],
        ["2026-09-30", "4356.80", "4357.62", "4368.61", "4341.88", "162949626", ""],
      ],
    },
  },
};

const KLINE_001 = {
  data: {
    sh000001: {
      day: [
        ["2026-09-29", "3980.0", "4000.0", "4010.0", "3970.0", "1", ""],
        ["2026-09-30", "4005.0", "3842.19", "4006.0", "3830.0", "1", ""],
      ],
    },
  },
};

function marketFixture(overrides: { dropHy?: string; dropGn?: string } = {}): TencentMarketData {
  const hy = parseRankBoards({ data: { rank_list: HY_ROWS } }, "hy");
  const gn = parseRankBoards({ data: { rank_list: GN_ROWS } }, "gn");
  const boards: TencentBoard[] = [
    ...hy.filter((b) => b.name !== overrides.dropHy),
    ...gn.filter((b) => b.name !== overrides.dropGn),
  ];
  return {
    tradeDate: "2026-09-30",
    boards,
    indices: {
      sh000300: parseIndexKline(KLINE_300, "sh000300"),
      sh000001: parseIndexKline(KLINE_001, "sh000001"),
    },
  };
}

// ───────── parseRankBoards ─────────

test("parseRankBoards: zxj/zd/zdf 字符串转数字，prevClose = zxj - zd", () => {
  const boards = parseRankBoards({ data: { rank_list: [HY_ROWS[0]] } }, "hy");
  assert.equal(boards.length, 1);
  assert.deepEqual(boards[0], {
    code: "pt01801120",
    name: "食品饮料",
    boardType: "hy",
    close: 13618.21,
    prevClose: 13392.58,
    pct: 1.68,
  });
});

test("parseRankBoards: 缺 zxj/zd 时 close/prevClose 为 null（不猜）", () => {
  const boards = parseRankBoards(
    { data: { rank_list: [{ code: "pt01801999", name: "不存在的板", zdf: "1.0" }] } },
    "hy",
  );
  assert.deepEqual(boards[0].close, null);
  assert.deepEqual(boards[0].prevClose, null);
  assert.equal(boards[0].pct, 1.0);
});

test("parseRankBoards: 非法输入 → 空数组", () => {
  assert.deepEqual(parseRankBoards(null, "hy"), []);
  assert.deepEqual(parseRankBoards({ data: {} }, "gn"), []);
  assert.deepEqual(parseRankBoards({ data: { rank_list: "oops" } }, "hy"), []);
});

// ───────── parseRankBoards：资金流/多周期字段（2026-10 实测 rank 行均带这些字符串字段） ─────────

test("parseRankBoards: zljlr/zdf_d5/zdf_d20/zdf_d60 字符串数字 → 数字", () => {
  const boards = parseRankBoards(
    {
      data: {
        rank_list: [
          board("pt01801120", "食品饮料", 13618.21, 225.63, 1.68, {
            zljlr: "142807.54",
            zdf_d5: "-0.19",
            zdf_d20: "-2.58",
            zdf_d60: "3.89",
          }),
        ],
      },
    },
    "hy",
  );
  assert.equal(boards.length, 1);
  assert.equal(boards[0].zljlr, 142807.54);
  assert.equal(boards[0].zdf_d5, -0.19);
  assert.equal(boards[0].zdf_d20, -2.58);
  assert.equal(boards[0].zdf_d60, 3.89);
  // 既有字段不受影响
  assert.equal(boards[0].close, 13618.21);
  assert.equal(boards[0].pct, 1.68);
});

test("parseRankBoards: zljlr 负值（主力净流出）保留负号", () => {
  const boards = parseRankBoards(
    { data: { rank_list: [board("pt01801110", "家用电器", 8337.71, -47.79, -0.57, { zljlr: "-4852.31" })] } },
    "hy",
  );
  assert.equal(boards[0].zljlr, -4852.31);
});

test("parseRankBoards: 新字段缺失/空串/'abc' → undefined（不猜 0，不挂 key）", () => {
  const boards = parseRankBoards(
    {
      data: {
        rank_list: [
          board("pt01801999", "无新字段", 100, 1, 1),
          board("pt01801998", "坏新字段", 100, 1, 1, { zljlr: "", zdf_d5: "abc", zdf_d20: "0.5" }),
        ],
      },
    },
    "hy",
  );
  assert.equal(boards.length, 2);
  assert.equal(boards[0].zljlr, undefined);
  assert.equal(boards[0].zdf_d5, undefined);
  assert.ok(!("zljlr" in boards[0]!), "缺失字段不挂 key");
  assert.equal(boards[1].zljlr, undefined);
  assert.equal(boards[1].zdf_d5, undefined);
  assert.ok(!("zdf_d5" in boards[1]!), "非法字符串不挂 key");
  assert.equal(boards[1].zdf_d20, 0.5); // 同行的合法字段照常解析
});

test("parseRankBoards: zgb 涨跌家数原样透传字符串（不转数字）", () => {
  const boards = parseRankBoards(
    { data: { rank_list: [board("pt01801120", "食品饮料", 13618.21, 225.63, 1.68, { zgb: "102/122" })] } },
    "hy",
  );
  assert.equal(boards[0].zgb_raw, "102/122");
  const bare = parseRankBoards({ data: { rank_list: [board("pt01801999", "无 zgb", 100, 1, 1)] } }, "hy");
  assert.equal(bare[0].zgb_raw, undefined);
});

// ───────── SECTOR_TENCENT 映射不变式 ─────────

test("SECTOR_TENCENT 恰好覆盖 18 个行业板块（与 SECTORS 非指数板块一一对应）", () => {
  const expected = SECTORS.filter((s) => !/^(sh|sz)\d{6}$/.test(s.indexKey)).map((s) => s.key).sort();
  assert.deepEqual(Object.keys(SECTOR_TENCENT).sort(), expected);
});

test("resolveSectorBoards: 全量匹配时 missing 为空且 18 板块齐全", () => {
  const { bySector, missing } = resolveSectorBoards(marketFixture().boards);
  assert.deepEqual(missing, []);
  assert.equal(bySector.size, 18);
});

test("resolveSectorBoards: 板块改名/下线 → 落到 missing（宁缺毋滥）", () => {
  const { bySector, missing } = resolveSectorBoards(marketFixture({ dropHy: "有色金属" }).boards);
  assert.deepEqual(missing, ["cyclical"]);
  assert.equal(bySector.size, 17);
});

// ───────── parseIndexKline / indexRow ─────────

test("parseIndexKline: 解析 day 行 [date,open,close,high,low,...] 并按日期升序", () => {
  const bars = parseIndexKline(KLINE_300, "sh000300");
  assert.equal(bars.length, 3);
  assert.deepEqual(bars[2], { date: "2026-09-30", open: 4356.8, close: 4357.62, high: 4368.61, low: 4341.88 });
});

test("parseIndexKline: 代码不匹配或行残缺 → 跳过", () => {
  assert.deepEqual(parseIndexKline(KLINE_300, "sh000001"), []);
  assert.deepEqual(parseIndexKline({ data: { sh000300: { day: [["2026-09-30", "1"]] } } }, "sh000300"), []);
  assert.deepEqual(parseIndexKline(null, "sh000300"), []);
});

test("indexRow: 取最后两根 bar 算收盘/昨收/涨跌幅", () => {
  const row = indexRow("sh000300", parseIndexKline(KLINE_300, "sh000300"));
  assert.ok(row);
  assert.equal(row.index_key, "sh000300");
  assert.equal(row.trade_date, "2026-09-30");
  assert.equal(row.close, 4357.62);
  assert.equal(row.prev_close, 4345.21);
  assert.equal(row.pct, 0.29);
});

test("indexRow: bar 不足两根 → null（没有昨收就不写）", () => {
  const bars = parseIndexKline(KLINE_300, "sh000300").slice(0, 1);
  assert.equal(indexRow("sh000300", bars), null);
});

// ───────── rowsFromTencent ─────────

test("rowsFromTencent: 全量 → 20 行（18 板块 + 2 指数），index_key 与词表 indexKey 一致", () => {
  const { rows, missing } = rowsFromTencent(marketFixture());
  assert.deepEqual(missing, []);
  assert.equal(rows.length, 20);
  const keys = rows.map((r) => r.index_key).sort();
  const expected = SECTORS.map((s) => s.indexKey).sort();
  assert.deepEqual(keys, expected);
  assert.ok(rows.every((r) => r.trade_date === "2026-09-30"));
  const semi = rows.find((r) => r.index_key === "BK1036")!;
  assert.equal(semi.close, 3200);
  assert.equal(semi.pct, 2.05);
});

test("rowsFromTencent: 缺一个板块 → 19 行 + missing 记该板块", () => {
  const { rows, missing } = rowsFromTencent(marketFixture({ dropGn: "芯片概念" }));
  assert.deepEqual(missing, ["semicap"]);
  assert.equal(rows.length, 19);
});

function enrichedMarketData(): TencentMarketData {
  // 给全部 hy 行带上资金流/多周期字段（gn 行不带，验证缺失时为 undefined）
  const enrichedHy = HY_ROWS.map((r) => ({
    ...r,
    zljlr: "142807.54",
    zdf_d5: "-0.19",
    zdf_d20: "-2.58",
    zdf_d60: "3.89",
    zgb: "102/122",
  }));
  return {
    tradeDate: "2026-09-30",
    boards: [
      ...parseRankBoards({ data: { rank_list: enrichedHy } }, "hy"),
      ...parseRankBoards({ data: { rank_list: GN_ROWS } }, "gn"),
    ],
    indices: {
      sh000300: parseIndexKline(KLINE_300, "sh000300"),
      sh000001: parseIndexKline(KLINE_001, "sh000001"),
    },
  };
}

test("rowsFromTencent: 板块行的 zljlr/zdf_d*/zgb 透传到 MarketRow；源未提供 → undefined", () => {
  const { rows, missing } = rowsFromTencent(enrichedMarketData());
  assert.deepEqual(missing, []);
  const liquor = rows.find((r) => r.index_key === "BK0438"); // hy 行：有资金流字段
  assert.ok(liquor);
  assert.equal(liquor.zljlr, 142807.54);
  assert.equal(liquor.zdf_d5, -0.19);
  assert.equal(liquor.zdf_d20, -2.58);
  assert.equal(liquor.zdf_d60, 3.89);
  assert.equal(liquor.zgb_raw, "102/122");
  const semi = rows.find((r) => r.index_key === "BK1036"); // gn 行：源未提供
  assert.ok(semi);
  assert.equal(semi.zljlr, undefined);
  assert.equal(semi.zdf_d5, undefined);
  assert.equal(semi.zdf_d20, undefined);
  assert.equal(semi.zdf_d60, undefined);
  assert.equal(semi.zgb_raw, undefined);
});

// ───────── sane ─────────

test("sane: 正常行通过；pct 与 close/prev 漂移过大 / 超涨跌停 / 非正价格 → 拒绝", () => {
  assert.ok(sane({ index_key: "x", trade_date: "2026-09-30", close: 100, prev_close: 99, pct: 1.01 }));
  assert.ok(!sane({ index_key: "x", trade_date: "2026-09-30", close: 100, prev_close: 100, pct: 5 }));
  assert.ok(!sane({ index_key: "x", trade_date: "2026-09-30", close: 130, prev_close: 100, pct: 30.1 }));
  assert.ok(!sane({ index_key: "x", trade_date: "2026-09-30", close: 0, prev_close: 100, pct: 0 }));
});

// ───────── push2his kline 兜底解析 ─────────

test("parseKlineQuotes: klines 行 [date,close] 两根 bar → 收盘/昨收/涨跌幅", () => {
  const q = parseKlineQuotes({ data: { klines: ["2026-09-29,100,10", "2026-09-30,105,12"] } }, "90.BK1036");
  assert.deepEqual(q, { secid: "90.BK1036", price: 105, prevClose: 100, pct: 5, date: "2026-09-30" });
});

test("parseKlineQuotes: 只有一根 bar / 坏行 → null（没有昨收不写）", () => {
  assert.equal(parseKlineQuotes({ data: { klines: ["2026-09-30,105,12"] } }, "90.BK1036"), null);
  assert.equal(parseKlineQuotes({ data: { klines: "x" } }, "90.BK1036"), null);
  assert.equal(parseKlineQuotes(null, "90.BK1036"), null);
});

test("rowsFromQuotes 吃 kline 映射后的行（date 不进行，at 可空）", () => {
  const q = parseKlineQuotes({ data: { klines: ["2026-09-29,100,10", "2026-09-30,105,12"] } }, "90.BK1036")!;
  const rows = rowsFromQuotes([{ secid: q.secid, price: q.price, prevClose: q.prevClose, pct: q.pct }], "2026-09-30");
  assert.deepEqual(rows, [{ index_key: "BK1036", trade_date: "2026-09-30", close: 105, prev_close: 100, pct: 5 }]);
});

// ───────── syncMarketDaily 回退链（DI mock，不碰网络） ─────────

const okResult = (): MarketSourceResult => ({
  tradeDate: "2026-09-30",
  rows: rowsFromTencent(marketFixture()).rows,
  missing: [],
});
const boom = (msg: string) => async () => {
  throw new Error(msg);
};
const noLast = async () => null;

test("syncMarketDaily: 腾讯成功 → source=tencent", async () => {
  const summary = await syncMarketDaily(new Date("2026-10-07T07:35:00Z"), {
    tencent: async () => okResult(),
    lastWritten: noLast,
  });
  assert.equal(summary.source, "tencent");
  assert.equal(summary.written, 20);
  assert.equal(summary.skipped, false);
});

test("syncMarketDaily: 腾讯挂 → 东财 K 线兜底", async () => {
  const summary = await syncMarketDaily(new Date(), {
    tencent: boom("tencent 断连"),
    kline: async () => okResult(),
    lastWritten: noLast,
  });
  assert.equal(summary.source, "eastmoney-kline");
  assert.equal(summary.written, 20);
});

test("syncMarketDaily: 前两级都挂 → push2 ulist 最后兜底", async () => {
  const summary = await syncMarketDaily(new Date(), {
    tencent: boom("t1"),
    kline: boom("t2"),
    ulist: async () => okResult(),
    lastWritten: noLast,
  });
  assert.equal(summary.source, "eastmoney-ulist");
});

test("syncMarketDaily: 三级全挂 → 抛错且带各级原因", async () => {
  await assert.rejects(
    () =>
      syncMarketDaily(new Date(), {
        tencent: boom("a"),
        kline: boom("b"),
        ulist: boom("c"),
        lastWritten: noLast,
      }),
    /行情源全部失败.*a.*b.*c/,
  );
});

test("syncMarketDaily: 库内已有该交易日（节假日重复跑）→ skip 不重写", async () => {
  const summary = await syncMarketDaily(new Date(), {
    tencent: async () => okResult(),
    lastWritten: async () => "2026-09-30",
  });
  assert.equal(summary.skipped, true);
  assert.equal(summary.written, 0);
  assert.match(summary.reason ?? "", /无新交易日/);
});

// 回归：postgres.js 把 date 列解成 Date 对象，字符串 <= Date → NaN → skip 永不触发（2026-10-07 实测：
// 同一天被反复重写 20 行）。不注入 lastWritten → 走真实 DB 查询路径。
test("syncMarketDaily: 默认 lastWritten（真实 DB 查询，date→Date 对象）→ 同一天 skip", async () => {
  await sql`insert into market_daily (trade_date, index_key, close, prev_close, pct) values ('2026-09-30', 'sh000300', 1, 1, 0) on conflict (trade_date, index_key) do nothing`;
  const summary = await syncMarketDaily(new Date(), { tencent: async () => okResult() });
  assert.equal(summary.skipped, true, `expected skip, got ${JSON.stringify(summary)}`);
  assert.equal(summary.written, 0);
});

test("syncMarketDaily: 新交易日 → 正常写（测试库）", async () => {
  const res: MarketSourceResult = {
    tradeDate: "2020-01-02",
    rows: [{ index_key: "sh000300", trade_date: "2020-01-02", close: 1, prev_close: 1, pct: 0 }],
    missing: [],
  };
  const summary = await syncMarketDaily(new Date(), { tencent: async () => res, lastWritten: noLast });
  assert.equal(summary.written, 1);
  assert.equal(summary.skipped, false);
});

// ───────── writeMarketRows：资金流/多周期列 + extra.zgb（测试库） ─────────

type EnrichedRow = { zljlr: number | null; zdf_d5: number | null; zdf_d20: number | null; zdf_d60: number | null; extra: Record<string, unknown> };

const enrichedSelect = (): Promise<EnrichedRow[]> =>
  sql<EnrichedRow[]>`
    select zljlr, zdf_d5, zdf_d20, zdf_d60, extra from market_daily
    where trade_date = '2020-01-03'::date and index_key in ('BK_TEST_A', 'BK_TEST_B') order by index_key`;

test("writeMarketRows: zljlr/zdf_d* 落 numeric 列，缺失 → NULL；zgb 并入 extra（保留既有 key）", async () => {
  const rows: MarketRow[] = [
    {
      index_key: "BK_TEST_A",
      trade_date: "2020-01-03",
      close: 100,
      prev_close: 99,
      pct: 1.01,
      zljlr: -4852.31,
      zdf_d5: -1.87,
      zdf_d20: -4.51,
      zdf_d60: -1.88,
      zgb_raw: "36/93",
    },
    { index_key: "BK_TEST_B", trade_date: "2020-01-03", close: 100, prev_close: 99, pct: 1.01 },
  ];
  assert.equal(await writeMarketRows(rows), 2);
  const [a, b] = await enrichedSelect();
  assert.equal(a.zljlr, -4852.31);
  assert.equal(a.zdf_d5, -1.87);
  assert.equal(a.zdf_d20, -4.51);
  assert.equal(a.zdf_d60, -1.88);
  assert.deepEqual(a.extra, { zgb: "36/93" });
  assert.equal(b.zljlr, null);
  assert.equal(b.zdf_d5, null);
  assert.equal(b.zdf_d20, null);
  assert.equal(b.zdf_d60, null);
  assert.deepEqual(b.extra, {});
  // 重跑（幂等 upsert）：extra 既有 key 保留、zgb 更新、本次未带的字段 → NULL
  await sql`update market_daily set extra = '{"keep":1}'::jsonb where trade_date = '2020-01-03'::date and index_key = 'BK_TEST_A'`;
  assert.equal(await writeMarketRows([{ index_key: "BK_TEST_A", trade_date: "2020-01-03", close: 101, prev_close: 99, pct: 2.02, zgb_raw: "37/93" }]), 1);
  const [a2] = await enrichedSelect();
  assert.deepEqual(a2.extra, { keep: 1, zgb: "37/93" });
  assert.equal(a2.zljlr, null);
  assert.equal(a2.zdf_d5, null);
});

// DI 测试会真实写测试库：清掉脏行并关池（postgres 池 idle_timeout 600s，不关会把事件循环挂住→文件超时）
after(async () => {
  await sql`DELETE FROM market_daily WHERE trade_date in ('2020-01-02', '2026-09-30') and index_key = 'sh000300'`;
  await sql`DELETE FROM market_daily WHERE trade_date = '2020-01-03'::date and index_key in ('BK_TEST_A', 'BK_TEST_B')`;
  await closeDb();
});
