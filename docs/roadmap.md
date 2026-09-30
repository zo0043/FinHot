# FinHot 优化技术方案：从新闻聚合到可回测的 A 股信号源

> 状态：待执行 · 2026-07（基于代码侦察核实，所有文件路径与行为均对照当前 main 分支）

## 0. 定位与原则

FinHot 的交易价值只在**理解层**可赢：速度（毫秒级竞争）与获取（独家信息）两条赛道结构性打不过财联社/终端。因此所有投入只服务四件事：

1. **降噪**——把"通用财经重要性"变成"对你可操作的重要性"
2. **方向**——给每条精选事件打"事件内在方向"标签（偏多/偏空/中性 + 作用对象），明确不是指数预测
3. **闭环**——接入日频市场结果数据，把"有没有用"变成可回测的命中率
4. **记忆**——历史相似事件检索（地基已存在，见 §1）

**明确不做**：不堆轮询速度；不接 tick 级行情（框架扛不住，日频已够回测）；不承诺"独立预测器"——公开新闻 + 方向标签大概率是弱信号，价值是"有证据、可叠加的主观信号"。

---

## 1. 现状诊断（代码核实版）

| # | 事实 | 证据 | 影响 |
|---|---|---|---|
| 1 | **84% 精选无 category**。structure 步 `category: z.enum(...).nullable().catch(null)`（`analyze.ts:124`），失败静默变 null；`normalizeAnalysis` 里 `category: run.structure?.category ?? null`（`analyze.ts:395`）**没有任何兜底** | `editorial/analyze.ts` | 站点筛选栏、日报分节、主题页大面积空 |
| 2 | **评分输出只有 `attentionScore` 一个字段**（`selection-score.md` 末尾契约），五轴（sig/nov/cred/reson/act）是内部计算不落库；**无方向/情绪轴** | `industry/prompts/selection-score.md` | 结构上产生不了方向信号，调参改不出来 |
| 3 | **embeddings 地基已存在**：`0006_embeddings.sql`（`embeddings` 表，`real[]`，无 pgvector，注释明说"recall scans a bounded recent window"）+ `providers/embeddings.ts` 的 `ensureEmbeddings(kind: fact\|article\|story)`，供事件归组召回用。**但当前 `.env` 未配 `EMBEDDING_*`**（"不填也能跑，只是归组少一路线索"） | `database/migrations/0006_embeddings.sql`、`providers/embeddings.ts` | "历史相似事件"不是从零建，是**启用 + 去掉时间窗限制** |
| 4 | **告警框架已存在**：`operations/alerts.ts` 的 `collectFindings` 三级（now/today/digest），`ops.alerts` cron `*/10` 分钟，发送走 `notify/feishu.ts` 的 `sendAlert`。但默认静默窗口 `ALERT_QUIET_MINUTES=360`（6 小时）太长；且 `.env` 里 `FEISHU_INTERNAL_ENABLED=false`、`FEISHU_ALERT_CHAT_ID` 未配——告警即使触发也发不出去 | `operations/alerts.ts`、`apps/worker/src/schedules.ts`、`.env` | “静默断流”的根因之一：告警通道根本没通。**用户 2026-07 拍板用 Bark 替代飞书做告警/推送通道** |
| 5 | **评测地基已存在**：`scripts/eval-selection.ts`（跑真实 analyze 流程 + 阈值扫描 + SelectBench 导入）、gold 格式（`docs/selection.md`、`industry/gold.example.jsonl`）。但 gold 还是两个 AI 行业示例，**财经标注样本为 0** | `scripts/eval-selection.ts` | 阈值校准是"标数据 + 跑现成脚本"，不是写代码 |
| 6 | 门槛已是 `{T1:42, T1_5:48, T2:55}`（AI 时代 `{60,65,76}` 已弃），`selection.ts` 里挂着 TODO："上线前必须用 100-200 条人工标注 gold 样本重校准" | `industry/selection.ts` | 校准是既定欠账 |
| 7 | LLM 走单一 `default` 网关（litellm.zero43.top → zero-flash），预设模型（zhipu/deepseek 等）在代码里但无 key；**无 failover** | `providers/llm.ts`、`.env` | 429 断流无自动恢复 |
| 8 | 摘要偏薄（~177 字均值）；`summarize-article.md` / 内容理解提示词没有结构化骨架要求 | `industry/prompts/summarize-*.md` | 卡片信息密度低 |
| 9 | 两个 AI 专属模块（leaderboard、codexResetMonitor）已 `features.ts` 关闭，无需清理 | `industry/features.ts` | — |

**结论**：比上一版方案轻——三个"从零建"（向量库、告警、评测）其实都有地基，真正的硬活只剩 **方向轴、结果数据、回测、标注**四件。

---

## 2. 目标架构

```
信源(107, T1/T1_5/T2)
  → 采集 (collect.ts, 双源健康监控)
  → 判重/入库 (content/)
  → 预筛 (prefilter.md)
  → 评分 ×2 (selection-score.md, 五轴×7类型权重 — 不动)
  → [新] 方向判断 (directions.md, 仅入选项, 便宜模型)   ← P3
  → 理解/摘要 (structured summary 骨架)                  ← P1
  → 归组 (events/, embeddings 召回 — 启用)               ← P5
  → 精选门槛 (selection.ts, gold 校准后)                 ← P2
  → [新] 结果上下文 (market_daily: 指数/涨跌停/两融)     ← P3
  → 公开读取层 (publication/, 方向+盘面字段)
  → 出口: 网页 / RSS / API / MCP / 飞书卡片(方向标签) / 日报(今日盘面+方向)
  → [新] 回测 (scripts/backtest.ts, 方向×板块×1/3/5日)   ← P4
  → [新] 历史相似 (全史 embedding 检索 + 当时市场反应)    ← P5
  → 运维: ops.alerts(*/10) + litellm fallback            ← P0
```

新增代码全部落在 `packages/backend/src/market/`（结果数据）、`editorial/direction.ts`（方向步）、`events/history.ts`（历史检索）、`industry/sectors.ts`（板块受控词表）与两个脚本；迁移只有 `0017` 一个（纯增量，符合"迁移只做向后兼容"规则）。

---

## 3. 数据模型（迁移 `0017_market_direction.sql`）

```sql
-- 事件方向（内在方向，不是指数预测）：入选项由独立轻量步判断
ALTER TABLE analyses ADD COLUMN direction text
  CHECK (direction IN ('bullish','bearish','neutral','none'));
ALTER TABLE analyses ADD COLUMN scope text[] NOT NULL DEFAULT '{}';  -- industry/sectors.ts 的 key
ALTER TABLE publications ADD COLUMN direction text
  CHECK (direction IN ('bullish','bearish','neutral','none'));
ALTER TABLE publications ADD COLUMN scope text[] NOT NULL DEFAULT '{}';

-- 日频市场数据：回测输入 + 日报/卡片的"结果上下文"。不公开（仅站内飞书/日报/后台用）
CREATE TABLE market_daily (
  trade_date  date NOT NULL,
  index_key   text NOT NULL,   -- sh000001/sh000300/…/bk1036(板块)/zt_count/dt_count/margin_bal
  close       numeric,
  prev_close  numeric,
  pct         numeric,
  extra       jsonb NOT NULL DEFAULT '{}',
  source      text NOT NULL DEFAULT 'eastmoney',
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_date, index_key)
);
CREATE INDEX market_daily_key_date_idx ON market_daily (index_key, trade_date DESC);
```

板块受控词表 `industry/sectors.ts`（新文件）：约 15-20 个主要板块，每项 `{ key, label, indexKey(东财代码), benchIndexKey(默认 sh000300) }`。**方向提示词只能从这个词表选 scope**——受控词表是回测可算的前提。

---

## 4. 分阶段执行

### P0 稳定：让断流不再静默 【✅ 已完成 2026-07，提交 b206cad】

Bark 通道已按下单用户的 key 接通（告警原先只有飞书一条路、而飞书在 `.env` 里是全关的）：

| 任务 | 位置 | 状态 |
|---|---|---|
| Bark 通道 | `notify/bark.ts`（新）+ `sendAlert` 并行通道 | ✅ 真实推送 code 200 验证 |
| 每日精选摘要 | `sendBarkDailyDigest` + `notify.bark-daily` cron 08:05（取当早日报） | ✅ |
| 入选实时推送 | `notify/selected.ts` + `BARK_PUSH_SELECTED=t1/all/off` | ✅ 默认只推最高门槛 |
| 行情健康告警 | `operations/alerts.ts` | ✅ market_daily 连续 2 交易日未更新 → today 级 |
| 静默窗口收紧 | `.env` | ✅ `ALERT_QUIET_MINUTES=120` |
| 源级失败告警 | `operations/alerts.ts` | ✅ 自上次成功算连续 ≥3 次（2 天内），today 级 |
| 网关 failover | litellm 服务端 | ⏸ 用户拍板：暂不动，后面自己配 |

**验收口径改为**：① Bark 收到告警；② 服务器带库验证；③ 日报摘要推送。

### P1 修地基：category + 摘要 【✅ 代码完成 2026-07，提交 773385d】

诊断订正：84% 无 category 的根因是 **structure 步 `category` 解析失败静默变 null，且 `normalizeAnalysis:395` 直接 `?? null` 无兜底**（itemType 为空只是兜底线索也断了）。

| 任务 | 位置 | 状态 |
|---|---|---|
| category 兜底链 | `taxonomy.ts` `CATEGORY_BY_TAG` + `deriveCategory`（structure → itemType→标签 → 首个分类标签 → null），analyze.ts:395 接入 | ✅ 单测 4 例过 |
| 摘要骨架 | `summarize-article.md` 120-220 字/4 句 + 影响对象/后续观察点；`content-understanding.md` 同步 | ✅ |
| 基线快照 | `scripts/baseline.ts` | ✅ 待服务器带库跑 |
| gold 候选导出 | `scripts/export-gold.ts`（tier × 分数段 × category 分层 200 条） | ✅ 待服务器带库跑 |

**验收**：新入库 category 非空率 ≥ 95%（旧数据不回刷，自然更替）；摘要中位长度 ≥ 250 字。

### P2 "对你重要"：评分标准 + 阈值校准（~1-2 天代码 + 你的 1-3 天标注）

这是**唯一需要你提供 KnowHow** 的阶段，也是降噪真正的杠杆。

1. **投资口径访谈**（我出问卷，你答 ~10 个题）：
   - 交易什么：个股/ETF/指数？周期：日内/波段（天-周）/中长线？
   - 重点板块：从 `sectors.ts` 词表圈 5-8 个
   - 什么事件会让你动手（举 3-5 个真实例子）→ 写进 `selection-score.md` "必须正常评价"
   - 什么是纯噪声（举 3-5 个）→ 写进 "必须压住的噪声"
   - 重点人物/公司核对（`topics.json` + `ENTITY_TAGS` 现有 43 家公司是否贴合你）
2. **按 AGENTS.md 规则改评分提示词**：保留五轴结构、权重表、安全边界，只替换"什么算重要/噪声"的例子。
3. **gold 集**：新脚本 `scripts/export-gold.ts` 从生产池按分层（源 tier × 分数段 × 类别）抽 150-200 条 → `.data/gold-candidates.jsonl` → 你在后台/文件里标 `select|reject` → `scripts/eval-selection.ts --gold .data/gold.jsonl`（现成，回执免费重跑）→ 读 SelectBench 前后对比 → 重定 `selection.ts` 的 `{T1,T1_5,T2}` 与 `understandFloor`。
4. **每次改提示词前后都跑一遍 gold 回归**（变成固定纪律，防 prompt 回归）。

**验收**：50 条 holdout 上 precision/recall 不劣于旧门槛且研报层 recall 提升；你抽看 20 条 must-watch，≥ 80% 认同"值得看"。

### P3 方向轴 + 结果数据（~2-3 天，之后开始攒数据）

| 任务 | 位置 | 做法 |
|---|---|---|
| 板块词表 | `industry/sectors.ts`（新） | 15-20 板块 + 东财 index key，含 A股整体/宏观流动性 两个特殊项 |
| 日频市场数据 | `packages/backend/src/market/`（✅ 代码已提交）+ `market_daily` 表 | `market.daily` cron 15:35：东财 push2 拉指数+板块收盘（f43/f60/f59/f86 缩放与时间戳处理，非交易日跳过）。涨跌停家数、两融余额接口结构不同，`PENDING_SERIES` 留 TODO（服务器侧核对接口后补） |
| 方向判断步 | `editorial/direction.ts`（新）+ `prompts/directions.md`（新）+ `models.ts` 注册 | 触发点：`runAnalysis` 中分数 sum 已知后（:354 附近），**仅入选项**并行发起一次便宜模型调用。输出 `{ direction: bullish\|bearish\|neutral\|none, scope: [sectors key…] }`。提示词要点：只判"事件的内在方向"（事件本身偏多/偏空于哪个对象），不判"指数明天涨跌"；证据不足 → `neutral`/`none`，不许猜。落 `analyses.direction/scope`（迁移 0017），随 publication 层透出 |
| 出口透出 | `publication/`（items/reports）+ `notify/selected.ts` + `reports/compose.ts` | 飞书卡片加一行 note：`方向：偏多 · A股整体/半导体`；日报头部加"今日盘面"（指数涨跌 + 涨跌停家数，来自 market_daily）；站点卡片加方向角标 |
| 数据健康 | `operations/alerts.ts` | finding：连续 2 个交易日 market_daily 无新数据 → `today` 级 |

**验收**：must-watch 方向标签覆盖率 100%；market_daily 连续 ≥ 5 个交易日完整；飞书卡片与日报可见方向与盘面。

### P4 第一次回测（P3 跑满 2-3 周后，~1-2 天）

- `scripts/backtest.ts`（新）：对每条 `direction ∈ {bullish,bearish}` 且有板块 scope 的入选事件（日 T），取 scope 板块（或基准）`market_daily` 在 T+1 / T+3 / T+5 的累计涨跌 `pct`，hit = 符号一致。
- 输出：分 horizon、分板块、分方向类型的命中率 + **基准自身方向持续性作 baseline**（回答"事件方向是否比大盘惯性更有信息"）→ 报告落 `docs/backtest/<date>.md`，可导入后台。
- **诚实预期**：大概率是弱信号（55-60% 量级，与板块惯性接近）。回测的意义是**给你证据**：若某板块/某方向类型显著高于 baseline，Bark 卡片就多了"历史上有几分可信"的注脚；若全面不显著，就把方向标签定位为纯分类而非信号，并回收 P3 的成本预期。
- 防过拟合：报告用全时段，但下结论前留最后 1 周做 out-of-time 验证。

**验收**：第一份带数字的回测报告 + 明确的"保留/调整/降级"决策记录。

### P5 记忆层：历史相似事件（~2 天，可与 P2 并行，历史市场上下文依赖 P3 的 market_daily）

地基都在（§1.3），三件事：

1. **启用 embedding**：`.env` 配 `EMBEDDING_*`（litellm 代理 dashscope `text-embedding-v4`，或直接百炼 key）；补一个 backfill job 给存量 stories 补 `kind='story'` embedding（`ensureEmbeddings` 已幂等）。
2. **全史检索**：`events/history.ts`（新）——对新 story 扫 `embeddings WHERE kind='story'` 全表（不做近期窗口），SQL 里算 cosine 取 top-3。规模上 story 每月几十条，几千行 `real[]` 全扫毫秒级，**不需要 pgvector**（>10 万行再升级）。
3. **当时市场反应**：top-3 每条 join `market_daily`（T 日与 T+5 的基准/相关板块涨跌）→ 飞书卡片加一行"历史相似：2024-03-12 ××事件（当时 5 日板块 +4.2%）"；站点 story 页加"相似历史事件"节（走 publication 层）。

**验收**：≥ 90% story 能出 top-3 + 历史市场上下文，检索 < 2s；飞书卡片可见。

---

## 5. KPI 总表（验收口径）

| 指标 | 现状 | 目标 | 何时 |
|---|---|---|---|
| category 非空率 | ~16% | ≥ 95%（新数据） | P1 |
| 摘要长度中位数 | ~177 字 | ≥ 250 字，四要素覆盖 ≥ 80% | P1 |
| 断流告警时延 | ∞（通道未通） | < 15 分钟 | P0 |
| 网关 429 恢复 | 人工 | 自动（litellm fallback） | P0 |
| must-watch 人工认同率 | 未测 | ≥ 80%（20 条抽检） | P2 |
| 阈值校准 | TODO 欠账 | gold ≥ 150 条 + SelectBench 对比 | P2 |
| 方向标签覆盖 | 0 | 100%（入选项） | P3 |
| market_daily 完整率 | 无 | ≥ 95% 交易日 | P3 |
| 回测命中率 | 无 | 有数（诚实值 + baseline 对比） | P4 |
| 历史相似检索 | 无 | ≥ 90% story，< 2s | P5 |

---

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| 东财接口不官方、可能变 | 双源（新浪 hq 备用）+ market_daily 健康告警；该数据只供回测/站内，不公开，坏了影响有限 |
| prompt 回归（改评分标准伤其他维度） | 每次改前后跑 gold 回归（P2 起成纪律）；提示词版本已在 `prompt_version` 留痕 |
| 回测过拟合 | 绝对数值 + baseline 对照 + out-of-time 验证；预期管理为"弱信号" |
| scope 词表太窄（事件塞不进板块） | 允许 `neutral`/`none` 出口；回测期统计"无法归类"比例，> 30% 再扩词表 |
| 方向步增加成本 | 仅入选项触发（每天十几条量级），用便宜模型；回执机制天然防重 |
| 飞书告警疲劳 | 只 now/today 两级直发，其余进 09:00 digest（框架已有分级）→ 已由 Bark 分组（FinHot/FinHot告警/FinHot精选）替代 |
| 两融数据 T+1 延迟 | 09:40 job 拉前一日值，日报标注"截至昨日" |

---

## 7. 执行顺序与依赖

```
P0 稳定 ──► P1 地基（两者可并行）
              │
              ├──► P2 口径+校准（需要你：~10 题问卷 + 1-3 天标注）
              │       │
              │       ▼
              │    P3 方向+结果数据 ──► 攒 2-3 周数据 ──► P4 回测
              │
              └──► P5 记忆层（可与 P2 并行；"当时市场反应"部分依赖 P3）
```

**日历预期**（我执行、你只参与 P2 标注）：
- 第 1 天：P0 + P1 完成，站点变稳、内容变实
- 第 2-5 天：P2（等你问卷 + 标注）+ P5 前半（embedding 启用）
- 第 6-9 天：P3 上线，Bark 卡片带方向 + 日报带盘面
- 第 10 天起：P5 收尾；同时回测数据开始积累
- 第 3 周末：P4 第一次回测报告——"FinHot 对走势到底有没有用"的第一个实证答案

---

## 8. 需要你拍板的决定 —— 2026-07 已答

1. ~~飞书通道~~ → **改用 Bark**（`https://api.day.app`，key 已在 `.env` 配好）。告警与推送都走 Bark；飞书保持关闭。
2. ~~备用网关~~ → **暂不改，用户后面自己配置**。
3. 投资口径：**A 股为主，重点发掘投资机会与投资趋势**（已答，评分提示词例子层已按此改，见提交 fb52c04）。还差：重点板块圈选（P2 问卷里 5-8 个）+ 什么事件会让你真的动手（2-3 个真实例子）。
4. 回测定位：**已接受**——预测要可测量（方向 × 板块 × 1/3/5 日命中率 + baseline 对照），分析要结合历史事件与当下情况（P5 历史相似 + 归因），回测要可回归（固定口径、可重跑）。

## 9. 不做的清单（防资源错配）

- ❌ 缩短轮询间隔/加并发采集（速度赛道赢不了）
- ❌ tick 级行情、L2、订单流（框架与成本都扛不住，日频够回测）
- ❌ pgvector（几千行全扫足够，> 10 万行再说）
- ❌ 重写评分五轴/权重表（AGENTS.md 规则：结构不动，换例子；且校准靠 gold 不靠手感）
- ❌ 把 market_daily 公开到 API/RSS（数据源不官方，公开有合规与可信度风险）
