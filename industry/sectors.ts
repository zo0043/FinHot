// A 股板块受控词表：方向步（editorial/direction.ts）的 scope 只能从这里选，回测（scripts/backtest.ts）
// 也只认这些 key。选它的原因：板块太多会稀释样本，回测算不动；太少事件塞不进去。先订 18 个主线
// 板块 + 2 个特殊对象，一个月后按 P4 回测里"塞不进任何板块"的比例（>30% 就扩）再调整。
//
// indexKey：东方财富板块指数 secid 的 BK 部分（90.BKxxxx），用于取板块收盘/涨跌幅（market_daily）。
// TODO(P3 市场数据模块)：BK 代码写自行业记忆，接东财前逐个对一遍（https://quote.eastmoney.com/center/boardlist.html
// 的行业板块 secid），并在首次跑通时把返回的板块名打出来人工核对。

// benchIndex：该板块的对照基准，默认沪深300；宏观与流动性相关板块用上证指数。

export interface Sector {
  key: string; // 受控词：提示词输出与数据库 scope 都用它
  label: string; // 中文名：卡片与日报显示
  indexKey: string; // 东财板块指数 secid 的 BK 部分
  benchIndex: string; // 对照基准（sh000300 / sh000001）
  aliases: readonly string[]; // 提示词里点名的同义说法，降低"塞不进"的比例
}

const BENCH_300 = "sh000300";
const BENCH_SH = "sh000001";

export const A_SHARE_MARKET = { key: "a-share", label: "A股整体", indexKey: "sh000300", benchIndex: "sh000001", aliases: ["A股", "大盘", "两市"] } as const;
export const MACRO_LIQUIDITY = { key: "macro", label: "宏观流动性", indexKey: "sh000001", benchIndex: "sh000300", aliases: ["货币政策", "流动性", "央行动作"] } as const;

export const SECTORS: readonly Sector[] = [
  A_SHARE_MARKET as Sector,
  MACRO_LIQUIDITY as Sector,
  { key: "semicap", label: "半导体/算力", indexKey: "BK1036", benchIndex: BENCH_300, aliases: ["半导体", "芯片", "算力", "AI硬件", "光模块"] },
  { key: "ai-app", label: "AI应用/软件", indexKey: "BK1044", benchIndex: BENCH_300, aliases: ["AI应用", "软件", "云计算", "大模型商用"] },
  { key: "new-energy", label: "新能源/光伏储能", indexKey: "BK1024", benchIndex: BENCH_300, aliases: ["光伏", "储能", "风电", "新能源车", "锂电"] },
  { key: "liquor", label: "白酒/食品饮料", indexKey: "BK0478", benchIndex: BENCH_300, aliases: ["白酒", "食品饮料", "消费"] },
  { key: "pharma", label: "医药/创新药", indexKey: "BK0727", benchIndex: BENCH_300, aliases: ["医药", "创新药", "医疗器械", "CXO"] },
  { key: "military", label: "军工", indexKey: "BK0493", benchIndex: BENCH_300, aliases: ["军工", "国防", "航空发动机"] },
  { key: "bank", label: "银行/保险", indexKey: "BK0475", benchIndex: BENCH_300, aliases: ["银行", "保险", "券商", "金融"] },
  { key: "broker", label: "券商/非银", indexKey: "BK0473", benchIndex: BENCH_300, aliases: ["券商", "经纪", "资本市场中介"] },
  { key: "real-estate", label: "房地产/建材", indexKey: "BK0451", benchIndex: BENCH_300, aliases: ["房地产", "地产", "建材", "家居"] },
  { key: "auto", label: "汽车/机器人", indexKey: "BK1017", benchIndex: BENCH_300, aliases: ["汽车", "整车", "机器人", "零部件"] },
  { key: "industrial", label: "工业/机械/自动化", indexKey: "BK0437", benchIndex: BENCH_300, aliases: ["机械", "工业母机", "自动化", "工程机械"] },
  { key: "cyclical", label: "周期/资源品", indexKey: "BK0438", benchIndex: BENCH_300, aliases: ["煤炭", "钢铁", "有色", "化工", "资源"] },
  { key: "precious", label: "贵金属", indexKey: "BK0528", benchIndex: BENCH_300, aliases: ["黄金", "白银", "贵金属"] },
  { key: "energy", label: "石油石化/电力", indexKey: "BK0465", benchIndex: BENCH_300, aliases: ["石油", "石化", "电力", "公用事业", "电网"] },
  { key: "transport", label: "交运/物流", indexKey: "BK0421", benchIndex: BENCH_300, aliases: ["航运", "港口", "物流", "航空", "快递"] },
  { key: "telecom", label: "通信/运营商", indexKey: "BK0735", benchIndex: BENCH_300, aliases: ["通信", "运营商", "5G", "光通信"] },
  { key: "media", label: "传媒/游戏", indexKey: "BK0726", benchIndex: BENCH_300, aliases: ["游戏", "传媒", "影视", "广告"] },
  { key: "agriculture", label: "农业/养殖", indexKey: "BK0528", benchIndex: BENCH_300, aliases: ["养殖", "种植", "农业", "猪周期"] },
];

export const SECTOR_KEYS = SECTORS.map((s) => s.key) as unknown as readonly [string, ...string[]];
export const SECTOR_BY_KEY = new Map(SECTORS.map((s) => [s.key, s]));

/** 方向提示词里点名的同义说法汇总（"只在影响对象明显时给 scope"的判据就在这些说法上）。 */
export const SECTOR_ALIAS_GUIDE = SECTORS.map((s) => `${s.label}（${s.key}）：${s.aliases.join("、")}`).join("\n");
