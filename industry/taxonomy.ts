// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉模型怎么归类。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 */
export const CATEGORIES = [
  { key: "market", label: "盘面", section: "盘面动态", guide: "主要市场整体行情：指数涨跌、成交与资金流向、板块涨跌轮动、涨跌停与大幅异动" },
  { key: "macro", label: "宏观", section: "宏观政策", guide: "中国宏观政策与监管取向：货币与财政操作、部门重要政策、新规与重要会议定调" },
  { key: "a-share", label: "A股", section: "A股公司", guide: "上市公司事件：定期报告与业绩预告、重大公告、停复牌、回购增减持、股权激励、立案调查与处罚" },
  { key: "global", label: "全球", section: "环球市场", guide: "海外与全球因素：海外央行、外围股指、关税贸易与地缘冲突、汇率与大宗商品变化" },
  { key: "industry", label: "行业", section: "行业动态", guide: "产业与板块基本面：景气、供需与产品价格、产能与技术路线、行业性政策细则；同时兜底归不上其他类别的财经消息" },
  { key: "people", label: "人物", section: "人物观点", guide: "重点人物的公开信号：官员、企业家、投资人与经济学家的讲话、访谈、署名文章与公开市场行为" },
  { key: "research", label: "数据", section: "数据研究", guide: "统计与数据发布及市场解读；券商研报、经济与行业研究、指数与排行发布" },
] as const;

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["company_filing", "capital_deal", "policy_regulation", "market_shift", "data_release", "opinion_view", "research_explainer"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "行情/异动", "政策/监管", "公司公告", "资本运作", "数据发布", "研究/解读", "人物观点", "行业动态", "其他",
] as const;

export type CategoryTag = (typeof CATEGORY_TAGS)[number];
export type CategoryKey = (typeof CATEGORIES)[number]["key"];

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "人工智能", "半导体", "新能源", "医药生物", "金融", "消费", "房地产", "汽车", "债券", "汇率", "黄金", "原油商品", "美联储", "关税贸易", "互联网",
] as const;

/** 可选的实体标签（公司、机构、平台）。 */
export const ENTITY_TAGS = ["贵州茅台", "宁德时代", "比亚迪", "腾讯控股", "阿里巴巴", "华为", "字节跳动", "小米集团", "中芯国际", "英伟达", "苹果", "特斯拉", "中国平安", "招商银行"] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  // → 公司公告
  公告: "公司公告", 业绩: "公司公告", 财报: "公司公告", 年报: "公司公告", 季报: "公司公告", 半年报: "公司公告",
  业绩预告: "公司公告", 披露: "公司公告", 分红: "公司公告",
  // → 资本运作
  并购: "资本运作", 收购: "资本运作", 重组: "资本运作", 定增: "资本运作", 再融资: "资本运作", IPO: "资本运作",
  回购: "资本运作", 增持: "资本运作", 减持: "资本运作", 股权激励: "资本运作", 借壳: "资本运作", 配股: "资本运作", 私有化: "资本运作",
  // → 政策/监管
  政策: "政策/监管", 监管: "政策/监管", 法规: "政策/监管", 新规: "政策/监管", 央行: "政策/监管", 降准: "政策/监管",
  降息: "政策/监管", 加息: "政策/监管", LPR: "政策/监管", 货币政策: "政策/监管", 财政: "政策/监管", 证监会: "政策/监管",
  发改委: "政策/监管", 关税: "政策/监管",
  // → 行情/异动
  行情: "行情/异动", 异动: "行情/异动", 涨跌: "行情/异动", 涨停: "行情/异动", 跌停: "行情/异动",
  大盘: "行情/异动", 资金流向: "行情/异动", 北向: "行情/异动", 板块轮动: "行情/异动",
  // → 数据发布
  数据: "数据发布", 统计: "数据发布", GDP: "数据发布", CPI: "数据发布", PPI: "数据发布", PMI: "数据发布",
  社融: "数据发布", M2: "数据发布", 进出口: "数据发布",
  // → 研究/解读
  研报: "研究/解读", 解读: "研究/解读", 分析: "研究/解读", 复盘: "研究/解读", 综述: "研究/解读", 科普: "研究/解读",
  // → 人物观点
  观点: "人物观点", 访谈: "人物观点", 演讲: "人物观点", 表态: "人物观点", 讲话: "人物观点", 撰文: "人物观点",
  // → 行业动态
  行业: "行业动态", 产业: "行业动态", 产业链: "行业动态", 景气: "行业动态", 供需: "行业动态",
  // → 主题与实体标签
  美联储: "美联储", 汇率: "汇率", 人民币: "汇率", 黄金: "黄金", 金价: "黄金",
  原油: "原油商品", 油价: "原油商品", 大宗: "原油商品",
  债券: "债券", 债市: "债券", 国债收益率: "债券", 英伟达: "英伟达", 台积电: "半导体",
  非财经: "其他", 无关: "其他",
};

/** 模型漏了分类标签时，按内容类型补一个。 */
export const CATEGORY_BY_ITEM_TYPE: Readonly<Record<string, string>> = {
  company_filing: "公司公告", capital_deal: "资本运作", policy_regulation: "政策/监管", market_shift: "行情/异动",
  data_release: "数据发布", opinion_view: "人物观点", research_explainer: "研究/解读",
};

/**
 * 分类标签 → 类别 key（CATEGORIES 的 key）。structure 步给不出 category 时，靠它把标签兜底成类别：
 * 「其他」和没有对应类别的标签统一进 industry（CATEGORIES 注释里规定的兜底类别）。
 */
export const CATEGORY_BY_TAG: Readonly<Record<CategoryTag, CategoryKey>> = {
  "行情/异动": "market",
  "政策/监管": "macro",
  "公司公告": "a-share",
  "资本运作": "a-share",
  "数据发布": "research",
  "研究/解读": "research",
  "人物观点": "people",
  "行业动态": "industry",
  "其他": "industry",
};

/**
 * category 的兜底链（analyze.ts 的 structure 步 category 允许模型失败，历史上约八成样本走到这里）：
 *   1. structure 步直接给出的 category key（模型做对了，最可信）；
 *   2. 内容类型 → 分类标签（CATEGORY_BY_ITEM_TYPE）→ 类别 key；
 *   3. 已打上的标签里第一个分类标签 → 类别 key；
 * 都落空返回 null（旧数据靠 deriveCategory 重新写入才会补齐，这里只对新分析兜底）。
 */
export function deriveCategory(structureCategory: string | null, itemType: string | undefined, tags: readonly string[]): CategoryKey | null {
  if (structureCategory) return structureCategory as CategoryKey;
  const fromType = itemType && CATEGORY_BY_ITEM_TYPE[itemType];
  if (fromType) return CATEGORY_BY_TAG[fromType as CategoryTag] ?? null;
  for (const tag of tags) if (tag in CATEGORY_BY_TAG) return CATEGORY_BY_TAG[tag as CategoryTag];
  return null;
}

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * 这 43 个 id 就是 topics.json「公司与机构」组的 slug（主题页的主键）：加一条要同时改 topics.json 与
 * seed 里的 topicEntityId，少一条会让主题页挂空。displayTag 只给 14 家名片级公司（与 ENTITY_TAGS 一致）；
 * 监管、交易所、指数、金融机构与人物一律 null，只用 entity:<id> 归类。
 * 别名前三个会进结构提示词，写最能指认的；股票代码是最干净的指认，名片股都带上。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[] }> = {
  // ── 监管与官方（动作主语，也是日报「宏观政策」节的常客）──
  pboc: { name: "中国人民银行", displayTag: null, aliases: ["中国人民银行", "央行", "PBOC"] },
  csrc: { name: "中国证监会", displayTag: null, aliases: ["中国证监会", "证监会", "CSRC"] },
  nfab: { name: "国家金融监督管理总局", displayTag: null, aliases: ["国家金融监督管理总局", "金融监管总局", "金融监管"] },
  safe: { name: "国家外汇管理局", displayTag: null, aliases: ["国家外汇管理局", "外汇管理局", "SAFE"] },
  stats: { name: "国家统计局", displayTag: null, aliases: ["国家统计局", "统计局"] },
  customs: { name: "海关总署", displayTag: null, aliases: ["海关总署", "海关"] },
  mof: { name: "财政部", displayTag: null, aliases: ["财政部", "中国财政部"] },
  ndrc: { name: "国家发展改革委", displayTag: null, aliases: ["国家发展改革委", "发改委", "NDRC"] },
  mofcom: { name: "商务部", displayTag: null, aliases: ["商务部", "中国商务部", "MOFCOM"] },
  gov: { name: "国务院", displayTag: null, aliases: ["国务院", "国常会", "国务院常务会议"] },
  // ── 交易所与指数 ──
  sse: { name: "上海证券交易所", displayTag: null, aliases: ["上海证券交易所", "上交所", "SSE"] },
  szse: { name: "深圳证券交易所", displayTag: null, aliases: ["深圳证券交易所", "深交所", "SZSE"] },
  bse: { name: "北京证券交易所", displayTag: null, aliases: ["北京证券交易所", "北交所", "BSE"] },
  hkex: { name: "香港交易所", displayTag: null, aliases: ["香港交易所", "港交所", "HKEX"] },
  csindex: { name: "中证指数公司", displayTag: null, aliases: ["中证指数公司", "中证指数"] },
  // ── 重点金融机构与投行 ──
  huijin: { name: "中央汇金", displayTag: null, aliases: ["中央汇金", "汇金", "中央汇金投资"] },
  icbc: { name: "工商银行", displayTag: null, aliases: ["工商银行", "工行", "ICBC"] },
  cmb: { name: "招商银行", displayTag: "招商银行", aliases: ["招商银行", "600036", "招行"] },
  pingan: { name: "中国平安", displayTag: "中国平安", aliases: ["中国平安", "601318", "平安保险"] },
  citisec: { name: "中信证券", displayTag: null, aliases: ["中信证券", "600030", "CITIC Securities"] },
  cicc: { name: "中金公司", displayTag: null, aliases: ["中金公司", "601995", "CICC"] },
  eastmoney: { name: "东方财富", displayTag: null, aliases: ["东方财富", "300059", "东财"] },
  goldman: { name: "高盛", displayTag: null, aliases: ["高盛", "Goldman Sachs"] },
  morganstanley: { name: "摩根士丹利", displayTag: null, aliases: ["摩根士丹利", "Morgan Stanley", "大摩"] },
  // ── A股龙头个股（卡片上有标签）──
  moutai: { name: "贵州茅台", displayTag: "贵州茅台", aliases: ["贵州茅台", "600519", "茅台"] },
  catl: { name: "宁德时代", displayTag: "宁德时代", aliases: ["宁德时代", "300750", "宁王"] },
  byd: { name: "比亚迪", displayTag: "比亚迪", aliases: ["比亚迪", "002594", "BYD"] },
  // ── 科技公司 ──
  tencent: { name: "腾讯控股", displayTag: "腾讯控股", aliases: ["腾讯控股", "00700", "腾讯"] },
  alibaba: { name: "阿里巴巴", displayTag: "阿里巴巴", aliases: ["阿里巴巴", "09988", "BABA"] },
  huawei: { name: "华为", displayTag: "华为", aliases: ["华为", "HUAWEI", "鸿蒙"] },
  bytedance: { name: "字节跳动", displayTag: "字节跳动", aliases: ["字节跳动", "ByteDance", "抖音"] },
  xiaomi: { name: "小米集团", displayTag: "小米集团", aliases: ["小米集团", "01810", "小米"] },
  smic: { name: "中芯国际", displayTag: "中芯国际", aliases: ["中芯国际", "688981", "00981"] },
  // ── 海外与全球 ──
  fed: { name: "美联储", displayTag: null, aliases: ["美联储", "Fed", "FOMC"] },
  nvidia: { name: "英伟达", displayTag: "英伟达", aliases: ["英伟达", "NVDA", "NVIDIA"] },
  apple: { name: "苹果", displayTag: "苹果", aliases: ["苹果", "AAPL", "Apple"] },
  tesla: { name: "特斯拉", displayTag: "特斯拉", aliases: ["特斯拉", "TSLA", "Tesla"] },
  // ── 重点人物：只放掌故级名人全名；在任官员一律走机构 id（换届不腐化）──
  ren: { name: "任正非", displayTag: null, aliases: ["任正非", "Ren Zhengfei"] },
  jackma: { name: "马云", displayTag: null, aliases: ["马云", "Jack Ma"] },
  ponyma: { name: "马化腾", displayTag: null, aliases: ["马化腾", "Pony Ma"] },
  leijun: { name: "雷军", displayTag: null, aliases: ["雷军", "Lei Jun"] },
  jensen: { name: "黄仁勋", displayTag: null, aliases: ["黄仁勋", "Jensen Huang"] },
  musk: { name: "马斯克", displayTag: null, aliases: ["马斯克", "Elon Musk", "埃隆·马斯克"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 财经领域简称歧义比 AI 站更危险，所以走“宁可漏、不可错”：漏拦只是少认一个实体，误放是把别的公司
 * 写进标题，属于投资误导。三条纪律：裸歧义简称（平安/中信/中金/华泰）不进 pattern；二级实体（平安银行/
 * 中信银行/招商蛇口）各自一条，不用母公司裸词覆盖；股票代码是最干净的指认，名片股全带码。
 * 机构职务语（央行行长/证监会主席/财政部长）映射到机构 id，不映射到个人；在任官员不做人物实体。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  // ── 监管与官方（机构简称 + 职务语；换届后机构 id 不变）──
  { id: "pboc", name: "中国人民银行", patterns: [/中国人民银行|人民银行|央行|\bPBOC\b/i, /央行行长|人民银行行长|货币政策委员会|公开市场(?:业务|操作)公告/i] },
  { id: "csrc", name: "中国证监会", patterns: [/中国证监会|证监会|证监局|\bCSRC\b/i, /证监会主席|证监会副主席|证监会新闻发言人|证监局对/i] },
  { id: "nfab", name: "国家金融监督管理总局", patterns: [/国家金融监督管理总局|金融监管总局|金融监督管理总局|\bNFRA\b/i, /金融监管总局局长|金融监管总局(?:对|公布|表示)/i] },
  { id: "safe", name: "国家外汇管理局", patterns: [/国家外汇管理局|外汇管理局|外汇局|\bSAFE\b/i] },
  { id: "stats", name: "国家统计局", patterns: [/国家统计局|统计局|国统局/i, /国家统计局(?:公布|发布|表示|新闻发言人|数据显示)/i] },
  { id: "customs", name: "海关总署", patterns: [/海关总署|海关|\bGACC\b/i, /海关总署(?:统计|公布|署长|副署长)/i] },
  { id: "mof", name: "财政部", patterns: [/财政部|中国财政部|\bMOF\b/i, /财政部部长|财政部(?:公布|发布|表示|新闻发言人|办公厅)/i] },
  { id: "ndrc", name: "国家发展改革委", patterns: [/国家发展改革委|国家发改委|发改委|\bNDRC\b/i, /发改委主任|发改委(?:新闻发言人|表示|印发)/i] },
  { id: "mofcom", name: "商务部", patterns: [/商务部|中国商务部|\bMOFCOM\b/i, /商务部部长|商务部(?:新闻发言人|表示|对)/i] },
  { id: "gov", name: "国务院", patterns: [/国务院|国常会|国务院常务会议|中国政府网/i, /国务院办公厅|国办发|国务院总理/i] },
  // ── 交易所与指数 ──
  { id: "sse", name: "上海证券交易所", patterns: [/上海证券交易所|上交所|\bSSE\b/i, /沪市(?:交易|上市|挂牌|收盘)|科创板(?:上市|申报|受理)/i] },
  { id: "szse", name: "深圳证券交易所", patterns: [/深圳证券交易所|深交所|\bSZSE\b/i, /深证成指|创业板(?:指|上市|受理)/i] },
  { id: "bse", name: "北京证券交易所", patterns: [/北京证券交易所|北交所|\bBSE\b/i] },
  { id: "hkex", name: "香港交易所", patterns: [/香港交易所|港交所|\bHKEX\b/i, /港股(?:通|上市规则|IPO)/i] },
  { id: "csindex", name: "中证指数公司", patterns: [/中证指数公司|中证指数有限公司|中证指数|\bCSI\b/i, /沪深\s?300|中证\s?[15]00|中证\s?1000|科创\s?50/i] },
  // ── 重点金融机构与投行 ──
  { id: "huijin", name: "中央汇金", patterns: [/中央汇金|汇金公司|汇金投资|\bCentral\s?Huijin\b/i] },
  { id: "icbc", name: "工商银行", patterns: [/工商银行|工行|中国工商银行|\bICBC\b/i, /\b601398\b/i] },
  { id: "cmb", name: "招商银行", patterns: [/招商银行|招行|\bCMB\b/i, /\b600036\b/i] },
  { id: "pingan", name: "中国平安", patterns: [/中国平安|平安保险|\bPing\s?An\b/i, /\b601318\b/i] },
  { id: "citisec", name: "中信证券", patterns: [/中信证券|\bCITIC\s?Securities\b/i, /\b600030\b/i] },
  { id: "cicc", name: "中金公司", patterns: [/中金公司|中国国际金融股份|\bCICC\b/i, /\b601995\b/i] },
  { id: "ciccgold", name: "中金黄金", patterns: [/中金黄金|\b600489\b/i] },
  { id: "ciccln", name: "中金岭南", patterns: [/中金岭南|\b000060\b/i] },
  { id: "eastmoney", name: "东方财富", patterns: [/东方财富|东财|\bEast\s?Money\b|天天基金/i, /\b300059\b/i] },
  { id: "goldman", name: "高盛", patterns: [/高盛|\bGoldman\s?Sachs\b/i] },
  { id: "morganstanley", name: "摩根士丹利", patterns: [/摩根士丹利|\bMorgan\s?Stanley\b|大摩/i] },
  // ── 二级金融实体：母公司裸词（中信/平安/华泰/中金）覆盖不到，各自一条 ──
  { id: "pab", name: "平安银行", patterns: [/平安银行|\bPAB\b/i] },
  { id: "citicbank", name: "中信银行", patterns: [/中信银行|\bCITIC\s?Bank\b/i, /\b601998\b/i] },
  { id: "citic", name: "中信集团", patterns: [/中信集团|中信股份|中信有限|\bCITIC\s?Group\b/i] },
  { id: "csc", name: "中信建投", patterns: [/中信建投|中信建投证券/i, /\b601066\b/i] },
  { id: "htsc", name: "华泰证券", patterns: [/华泰证券|华泰联合|\bHTSC\b/i, /\b601688\b/i] },
  { id: "gtja", name: "国泰君安", patterns: [/国泰君安|国泰海通/i, /\b601211\b/i] },
  { id: "boc", name: "中国银行", patterns: [/中国银行|中行|\bBank\s?of\s?China\b/i, /\b601988\b|\b03988\b/i] },
  { id: "ccb", name: "中国建设银行", patterns: [/建设银行|建行|\bChina\s?Construction\s?Bank\b/i, /\b601939\b|\b00939\b/i] },
  { id: "abc", name: "中国农业银行", patterns: [/农业银行|农行|\bAgricultural\s?Bank\s?of\s?China\b/i, /\b601288\b|\b01288\b/i] },
  { id: "china-life", name: "中国人寿", patterns: [/中国人寿|中国人寿保险|\bChina\s?Life\b/i, /\b601628\b/i] },
  { id: "cpic", name: "中国太保", patterns: [/中国太保|中国太平洋保险|\bCPIC\b/i, /\b601601\b/i] },
  { id: "picc", name: "中国人保", patterns: [/中国人保|中国人民保险|\bPICC\b/i, /\b601319\b/i] },
  { id: "cm-land", name: "招商蛇口", patterns: [/招商蛇口|招商局置地/i, /\b001979\b/i] },
  { id: "ant", name: "蚂蚁集团", patterns: [/蚂蚁集团|蚂蚁金服|\bAnt\s?Group\b|支付宝|蚂蚁消金/i] },
  // ── 科技公司 ──
  { id: "tencent", name: "腾讯控股", patterns: [/腾讯控股|腾讯|\bTencent\b|微信|\bQQ\b/i, /\b00700\b/i] },
  { id: "alibaba", name: "阿里巴巴", patterns: [/阿里巴巴|阿里集团|阿里云|淘宝|天猫|\bAlibaba\b/i, /\bBABA\b|\b09988\b/i] },
  { id: "huawei", name: "华为", patterns: [/华为|\bHUAWEI\b|鸿蒙|昇腾|麒麟芯片/i] },
  { id: "bytedance", name: "字节跳动", patterns: [/字节跳动|\bByteDance\b|抖音|今日头条|\bTikTok\b/i] },
  { id: "xiaomi", name: "小米集团", patterns: [/小米集团|小米|\bMIUI\b|\bXiaomi\b|澎湃OS|红米/i, /\b01810\b/i] },
  { id: "smic", name: "中芯国际", patterns: [/中芯国际|\bSMIC\b|中芯绍兴|中芯京城/i, /\b00981\b|\b688981\b/i] },
  { id: "nvidia", name: "英伟达", patterns: [/英伟达|\bNVIDIA\b|\bNVDA\b|\bBlackwell\b|\bCUDA\b/i] },
  { id: "apple", name: "苹果", patterns: [/\bApple\b|\bAAPL\b|\biPhone\b|\biPad\b|\bMacBook\b/i, /苹果(?:公司|集团|股价|市值|产业链|概念股|新机|发布会|财报|门店|手表|供应链)/i] },
  { id: "tesla", name: "特斯拉", patterns: [/特斯拉|\bTesla\b|\bTSLA\b/i] },
  // ── A股名片股（带代码，最干净的指认）──
  { id: "moutai", name: "贵州茅台", patterns: [/贵州茅台|茅台酒|茅台|\b600519\b/i] },
  { id: "catl", name: "宁德时代", patterns: [/宁德时代|\bCATL\b|宁王/i, /\b300750\b/i] },
  { id: "byd", name: "比亚迪", patterns: [/比亚迪|\bBYD\b/i, /\b002594\b/i] },
  // ── 海外央行 ──
  { id: "fed", name: "美联储", patterns: [/美联储|美国联邦储备|\bFOMC\b|\bFed\b|联储/i] },
  // ── 重点人物：只放全名与常用英文拼写，不放绰号、不放同名裸字 ──
  { id: "ren", name: "任正非", patterns: [/任正非|\bRen\s?Zhengfei\b/i] },
  { id: "jackma", name: "马云", patterns: [/马云|\bJack\s?Ma\b/i] },
  { id: "ponyma", name: "马化腾", patterns: [/马化腾|\bPony\s?Ma\b/i] },
  { id: "leijun", name: "雷军", patterns: [/雷军|\bLei\s?Jun\b/i] },
  { id: "jensen", name: "黄仁勋", patterns: [/黄仁勋|\bJensen\s?Huang\b/i] },
  { id: "musk", name: "马斯克", patterns: [/马斯克|\bElon\s?Musk\b|\bMusk\b/i] },
];

/** 这些域名上的文章，发布方就是对应机构（托管平台、券商研报聚合站不算一手）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "pboc", domains: ["pbc.gov.cn"] },
  { entityId: "csrc", domains: ["csrc.gov.cn"] },
  { entityId: "nfab", domains: ["nfra.gov.cn"] },
  { entityId: "safe", domains: ["safe.gov.cn"] },
  { entityId: "stats", domains: ["stats.gov.cn"] },
  { entityId: "customs", domains: ["customs.gov.cn"] },
  { entityId: "mof", domains: ["mof.gov.cn"] },
  { entityId: "ndrc", domains: ["ndrc.gov.cn"] },
  { entityId: "sse", domains: ["sse.com.cn"] },
  { entityId: "szse", domains: ["szse.cn"] },
  { entityId: "bse", domains: ["bse.cn"] },
  { entityId: "hkex", domains: ["hkex.com.hk"] },
];

/**
 * 原文里的这些写法也算提到了对应主体：机构简称覆盖不到的固定写法（研报署名、公告落款）。
 * 主要识别仍靠 IDENTITY_LEXICON 里的机构简称 pattern，这里只补两条。
 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  // 研报署名：平安证券研究所的口子归集团；平安银行另有自己的条目（pab），不走这里
  { entityId: "pingan", pattern: /平安证券(?:研究所|首席|分析师|资管)/i },
  // 公告/财报落款：上市公司法定全称（贵州茅台酒股份有限公司）
  { entityId: "moutai", pattern: /贵州茅台酒股份有限公司|贵州茅台股份有限公司/i },
];
