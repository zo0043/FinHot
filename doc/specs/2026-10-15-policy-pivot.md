# Spec：FinHot 政策化改造 —— 政策落地观测站

- 日期：2026-10-15
- 状态：待评审
- 分支：`finhot-policy-pivot`（worktree `worktrees/finhot-policy-pivot`，基于 main@71ce0b6）
- 取代：《FinHot 推演飞轮升级方案》（其 T1.4 首份回测报告、T4.3 direction 重试由本规格 W5 承接；其余已完成项为现有基建）

## 1. 背景与已定决策

现状：FinHot 是「财经热点站」——96 信源（官方为主）→ 六步流水线 → 精选 → 日报，之上已建「推演飞轮」（direction v2 + 预测台账 ~1830 行 + market_daily 20 板块 + 回测脚本）。2026-10-15 用户决策将站点改造为以政策为主轴：

| # | 决策 | 内容 |
|---|------|------|
| 1 | 「落地」含义 | 政策生命周期阶段追踪（发布 → 官方解读 → 配套细则 → 试点/落地执行）；**不含**地方政府文件信源 |
| 2 | 影响方向锚点 | A 股中长线投资者的 20 板块词表，复用 direction/台账/回测基建 |
| 3 | 重构程度 | 政策中心重构：首页/日报/主题页以政策生命周期为主线，行情新闻降为辅助 |
| 4 | 旧降噪分支 | 弃 `finhot-investment-analysis`（2/8 完成），按新口径重写；仅保留 eval/gold 方法论 |
| 5 | 生产栈 | 规格批准 + 首批改动落地后恢复；代码有改动 → 需重建 worker 镜像 |

**目标**：把精选主轴从「行情新闻为主、政策是 7 类内容之一」反转为「国家政策（中央：国务院 + 部委）发布与落地为主、行情为辅」，并对每条政策判断利好/利空哪些 A 股板块。

**本轮不做**：「政策文库」模块（全量官方文件索引/检索，二期）；地方政府文件信源；新增海外信源（现有 fed/sec/ofac/federalregister 保留为「全球」辅助）；热度/飞书/Bark 行为变更。

## 2. 继承的现有基建（不重造）

- 六步流水线 + 96 信源；10 个政府机构实体（ENTITIES/IDENTITY_LEXICON/PUBLISHER_DOMAINS：央行、证监会、金融监管总局、外汇局、统计局、海关、财政部、发改委、商务部、国务院）
- 五轴评分 + 7 内容类型；`policy_regulation` 已是最高 sig 权重（4/10）；「阶段口径」（传闻 < 征求意见 < 正式发布 < 获批 < 生效执行）已写在评分提示词
- direction v2（direction/scope≤3 板块/horizon t1·t3·t5/confidence，仅 selected 对用户面可见）+ prediction_ledger + market_daily + 回测脚本
- `scripts/eval-selection.ts` + gold 工作流（docs/gold-workflow.md）
- 信源线索（实施时逐条验证）：
  1. GitHub `changwu/china-policy-sites`：80+ 部委官方政策发布栏目 URL 清单（含省市目录）→ 候选库
  2. gov.cn 机器可读政策检索 `sousuo.www.gov.cn`（开源 MCP 项目已演示：p/n 分页，字段 policy_id/title/level/date/url/summary/issuing_agency/document_number，catalog 分 gongwen/bumenfile/gongbao）；入口 www.gov.cn/zhengce/zuixin/
  3. sources.json 现有 3 处「待自建 RSSHub」占位：发改委、金融监管总局、财政部债券管理

## 3. 变更

### W1 信源（industry/sources.json + 必要自建 RSSHub）

1. **国务院**（T1）：
   - 政策文件库：先验证 `sousuo.www.gov.cn` JSON 检索（分页/稳定性/频率限制）→ 稳则用 json 源（参照现有 csrc json 源形态）；不稳则回退列表页 `www.gov.cn/zhengce/zuixin/`
   - 政策解读栏目（www.gov.cn/zhengce 下解读入口，验证后定）
2. **部委官方栏目**（全部 T1 官方一手；目标 +12~18 个；逐个验证优先级：RSS > JSON > 稳定列表页 > 自建 RSSHub）：
   - 补占位：发改委、金融监管总局
   - 候选（与现有 96 去重后，按「对 A 股板块/宏观有直接传导」原则筛，最终 ~15 个）：工信部、科技部、住建部、市场监管总局、能源局、税务总局、生态环境部、商务部（确认现有）、医保局、水利部…
3. **实体扩充**：新部委同步进 ENTITIES + IDENTITY_LEXICON + PUBLISHER_DOMAINS（以最终信源清单为准）
4. **采集频率**：官方栏目随活跃源 15 分钟；日更型（文件库）1 小时；每个源验证时间序稳定性
5. **成本预算**：新增源预计 +40~80 原始条/天；上线观察 3 天，超成本可源级单独停用

### W2 评分口径（prompts/selection-score.md + industry/taxonomy.ts + selection.ts）

1. **定位重写**：站点主轴 = 「政策发布与落地」；读者不变（A 股中长线）。
2. **保留五轴框架与整数加权**（可 eval、保留历史回执）；重写 `policy_regulation` 行与品味规则，新增三个政策维度：
   - **政策级别**（入 sig）：国务院/国常会/国办文件 > 多部委联合发文 > 单部委 > 司局级；海外政策维持辅助档
   - **落地深度**（入 sig/nov）：生效执行 > 配套细则/实施意见 > 官方解读 > 正式发布 > 征求意见/草案 > 传闻；只有表态、无执行内容的封顶
   - **影响面**（入 reson）：全市场（货币/财政）> 多板块（scope≥3）> 单板块
3. 原「阶段口径」继续管 cred 轴（证据强度）；其阶段值与 W3 的 `policy_stage` 取值对齐。
4. 其余 6 类内容的噪声规则保留压缩（行情仍是辅助）；个股条目沿用旧降噪分支口径的核心（单一公司噪声压制、14 板块例外），改写进政策化提示词后**旧分支弃用**。
5. **taxonomy.ts**：
   - CATEGORIES：新增 key `policy` → 分节「政策中心」（第一分节）；`macro` → 「宏观数据」（官方统计与数据解读）；`market` → 「盘面」；`a-share` → 「公司动态」；`global` → 「环球」；`industry` → 「行业动态」（第二主线）；`people` → 「人物观点」；`research` → 「数据研究」
   - 分节顺序：政策中心 → 行业动态 → 盘面 → 宏观数据 → 公司动态 → 环球 → 人物观点 → 数据研究
   - ITEM_TYPES/CATEGORY_TAGS 不变；TOPIC_TAGS 新增 3 个政策主题标签：货币政策、财政政策、产业政策
   - **联动**：标签词表变更需同步 `prompts/content-understanding.md` 的白名单；类别 guide/顺序变更需同步 `prompts/structure.md`
6. **selection.ts 门槛不预设**，W4 eval 后重校准（现值 42/48/55 作参考）。

### W3 结构：policy_stage 字段 + 日报/首页/主题页

1. **新字段 `policy_stage`**（nullable；仅 itemType=policy_regulation 时非空）：
   - 取值 6 个：`draft`（征求意见/草案）`release`（正式发布）`interpretation`（官方解读）`details`（配套细则/实施意见）`pilot`（试点/试行）`execution`（生效执行）；**拿不准输出 null，不猜**（与 direction=none 纪律一致）
   - 输出位置：direction 步（`directions.md`）同一次调用加一个字段 —— 零额外调用，direction/scope/horizon/confidence/policy_stage 一起出
   - 先例：direction（migration 0039~0041 + 回执 + contracts `site.ts` ItemDetail 的 direction/scope 块）
   - **回填**：direction 回执变更 → 全量已打分条目（~1830+）direction 回执作废 → 一次性回填（白天单线程，断点可续）
2. **聚簇**（group-*.md）：加一条纪律 —— 同一政策的后续落地（解读/细则/试点/执行）与发布归同一事件（事件 = 政策文件）；代表稿逻辑不变，卡片展示最新阶段
3. **日报**（report-*.md + taxonomy 分节）：「政策中心」为第一分节；政策卡片展示发布机构（实体标签）+ 阶段徽章 + 影响方向（复用现有 direction/scope 渲染）
4. **主题页**：类别筛选出现「政策中心」；topics.json 新增 货币政策/财政政策/产业政策 三个主题（对应 W2 标签）
5. **site.ts 文案**（草案，评审可改）：
   - homeTitle：`FinHot — 政策落地 · A股板块影响 · 每日精选`
   - description：`盯住国务院与部委官方政策信源，跟踪政策从发布、官方解读、配套细则到试点执行的全过程，并判断它利好或利空哪些 A 股板块；行情新闻为辅。`
   - tagline：`先看政策，再看盘面`
   - name/subject 不变（FinHot/财经）

### W4 Eval 与 gold（前置：W1 信源已上线 1~2 周有真实产出）

1. gold：旧 200 条按新口径重标 + 新增 100~200 条政策样本（来自 W1 新源）→ 合计 300~400
2. `scripts/eval-selection.ts` → 目标：总体 AUC ≥ 0.80，政策子集 AUC ≥ 0.80
3. 门槛决策：T1/T1_5/T2 由 eval 数据定
4. **门禁**：eval 通过才进 W5

### W5 恢复生产 + 回测

1. 重建 worker 镜像（industry/ 提示词与代码变化打进镜像）——白天执行、避开 pi-web 高峰、盯内存（VPS 3.4GB）
2. `sudo docker compose up -d`（恢复检查单在 .agents/plans/FinHot-推演飞轮升级方案.md）
3. 观察 3 天：精选率、政策类占比、policy_stage 覆盖率、direction 覆盖率、网关失败率
4. **T1.4**：跑首份回测报告（含政策条目 —— 「影响方向」的首次量化验证）
5. **T4.3**（可选）：direction 单次重试，视网关状态

## 4. 执行顺序

```
P1（离线）: W1 信源（验证+配置） ∥ W2 口径重写 ∥ W3 代码/提示词改动
           → 本地 eval 干跑（eval-selection 可用 --rm 容器，不需全栈）
P2（上线）: 重建镜像 → compose up -d → 观察 3 天
P3（校准）: W4 gold 重标 + eval + 门槛定案
P4（收尾）: W5 回测报告 + T4.3（可选）
```

P1 工作量最大（约 1~1.5 周，W1 信源验证与 W2 口径写作为重心）；P3 的 gold 重标为人工为主 1~2 天。

## 5. 验收标准

1. 新增政策信源 ≥12 个上线（国务院 1~2 + 部委 ≥10），3 天采集成功率 ≥90%
2. policy_stage 对 selected 的 policy_regulation 覆盖率 ≥90%，分布合理（非全 null）
3. 日报「政策中心」为第一分节，卡片带阶段徽章与影响方向
4. eval：总体与政策子集 AUC ≥ 0.80，门槛定案
5. T1.4 首份回测报告产出（含政策条目方向准确率基线）
6. 无回归：盘面/热度/飞书/Bark/MCP 行为不变；leaderboard/codexReset 保持 off

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| gov.cn 接口反爬/不稳 | W1 先验证（json 检索 vs 列表页），回退自建 RSSHub |
| direction 回执变更 → 全量回填 | ~1830+ 次调用，白天单线程，回执系统可断点续 |
| token 成本（新源 + 恢复运行） | 3 天观察，低收益源可单独停用；eval 跑在闲时 |
| 网关 D5 劣化（p50 146s、~10% 失败） | 重活白天 + T4.3 重试 |
| docker 镜像重建内存（3.4GB VPS） | 白天执行，避开 pi-web 高峰 |
| gold 重标工作量 | 300~400 条，可分多天 |

## 7. 开放问题（评审时定）

1. 部委候选清单的最终裁剪（W1 验证后定 ~15 个）
2. policy_stage 取值 6 值与命名
3. site.ts 文案草案（尤其 tagline「先看政策，再看盘面」）
4. 政策主题标签 3 个（货币政策/财政政策/产业政策）是否够用
