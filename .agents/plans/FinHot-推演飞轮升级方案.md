# FinHot 推演飞轮升级方案（P0–P3 + M1–M4）

> **状态**: approved / 执行中（2026-10-07 批准，Phase 0/1 已基本完成）
> **本文件**: 2026-10-09 21:00 整理的**状态版**（canonical，已提交仓库）。原始未标记版在 `/home/ubuntu/app/.agents/plans/2026-10-07T12-47-24-700Z-finhot.md`（仓库外，仅供对照）。原 `FinHot/.agents/plans/FinHot-推演飞轮升级方案.md` 副本曾被并行会话事故删除（仓库无 git 记录），2026-10-09 从原始版重建。
> **目标一句话**: 把 FinHot 从「新闻注意力策展 + 可回测管线」升级为「信息 → 结构化预测 → 市场验证 → 蒸馏先验 → 参数再推导 → 回灌推演」的自改进飞轮，同时让「推演将来」可见可度量、「总结过去」可自动复盘。

---

## 0. 状态总览（整理于 2026-10-09 21:00）

> 图例：✅ 已完成 · 🔄 进行中 · ⏳ 观察中（等数据/时间） · ⬜ 未开始

### 任务状态

| 任务 | 内容 | 状态 | 备注（2026-10-09 实测） |
|---|---|---|---|
| T0.1 | 修红测试 / 绿色基线 | ✅ | 10-08；基线 219/222（3 个既有 env-red 需 live 网络） |
| T0.2 | 迁移 0040（台账 + market 加列） | ✅ | 生产 10-08 22:41 手工应用；committed 手工 CI 变体坑已修复（39862b3、0e49b4a）并与生产 schema 逐列对齐 |
| T0.3 | 腾讯解析增强（zljlr/zdf_d5/d20/d60） | ✅ | 10-08；10-08/10-09 连续两日 18/18 板块行新列填满 |
| T0.4 | direction 全量化 + 台账写入 | ✅ | 10-08 15:32 部署；台账 1830 行（published=false 反事实 1634）；ok 1642 / failed 189（10.3%，D5） |
| T0.5 | 历史反事实回填 | 🔄 | 10-09 13:49 起实跑 ~1130/1645（69%），ETA 10-10 凌晨；~10% 失败（网关超时 + 1 起 step 套餐报错）需补跑 |
| T0.6 | T+N 标注作业（16:10） | ✅ | 10-09 16:10 首产：labeled=0（无 T+5 可算，设计内）/ skipped=858（全 neutral/none/空 scope/failed）/ pending 117 |
| T1.0 | labeler T+N off-by-one 修复（Phase 1 新增） | ✅ | 1fd3f20；10-09 16:10 首标前合入 |
| T1.1 | 用户面暴露 direction/scope（仅 selected） | ✅ | 12290f9；v1 payload + Bark/Feishu + web 卡片；反事实不进用户面（A7） |
| T1.2 | scripts/backtest.ts | ✅（未首跑） | 84ff3ff；§5.1/5.2 手算测试全绿；首跑需 T+5（10-13）；改进：加 `--horizon t1/t3` 可出 T+1 早期读 |
| T1.3 | direction v2（horizon+confidence）+ 0041 | ✅ | 4c9112c，10-09 11:57 部署；验收 339/340=99.7%（≥95% ✓；缺失 52 行全为 direction failed） |
| T1.4 | 第一份回测报告 + 决策记录 | ⬜ | 前置 10-13 首批 T+5；预期 10-13/14 出报告（D1） |
| T1.5 | 泄漏审计 | ⬜ | reviewer 专项 lane，随 T1.4；红项阻塞 G2 |
| T2.1 | direction v3 市场上下文注入 | ⬜ | phase2 worktree 已建（零 commit） |
| T2.2 | market_regime + 0042 | ⬜ | 0042 未建 |
| T2.3 | 相对强度日报 | ⬜ | zdf_d20 自 10-09 起日积累，10 月底可算 |
| T2.4 | priors.regenerate 月度作业 | ⬜ | 表已就绪（空）；coarse 格子 n≥100 需 11 月积累 |
| T2.5 | lift 看板 | ⬜ | |
| T3.1 | 先验注入 A/B | ⬜ | G3 后；总 no-go 判定点 |
| T3.2 | params.propose + 阈值配置化 | ⬜ | |
| T3.3 | embedding 类比（可选） | ⬜ | |
| T3.4 | 自动化决策门 | ⬜ | 仅 3 连续月 OOT 正 lift 时讨论 |
| T4.1 | market.backfill-retry 周作业 | ⬜（优先级↓） | 一次性回填已完成（market_daily 07-02→10-09，66 交易日 × 20 keys，D3） |
| T4.2 | xiaoshi 交叉校验 | ⬜ | |
| T4.3 | direction 单次重试 | ⬜（**建议提级**） | 当前 ~10% 失败无重试；A8/护栏 6 已留设计 |
| T4.4 | prefilter 抽样审计 | ⬜（后置） | |

### 总体进度

- **Phase 0（埋点地基）**：6/6 完成，**G0 通过**；唯一尾巴 = T0.5 回填（ETA 10-10 凌晨）
- **Phase 1（可见+可度量）**：4/5 完成并部署（10-09 11:57，main ff55385，206/206 全绿）；T1.4 等数据、T1.5 等排期；**G1 观察中**
- **Phase 2（上下文+学习）**：未启动；最早 10 月底（G2 决策 + 数据积累后）
- **Phase 3（学习边）**：未启动（1 月+）
- **Phase 4（加固）**：未启动；T4.1 降级、T4.3 建议提级

### 修正后时间线（D1）

| 日期 | 事件 |
|---|---|
| 10-10（六）凌晨 | T0.5 回填完成 → 补跑 ~10% 失败行 |
| 10-10（六）16:10 | labeler 标注回填行（skipped / 落 t0_date） |
| 10-13（一）16:10 | 首批 T+5 落库（T0=09-30 批）→ 当晚 T1.4 首份 T+5 报告 + T1.5 泄漏审计 → G2 |
| 10-15（三） | 全部 T0 的 T+5 齐；G1 关闭 |
| 10 月底 | 完整首份回测报告（~15-18 交易日板块史）；Phase 2 启动窗口 |
| 11-12 月 | M2 基率/校准（G3 在 12 月） |
| 1 月+ | M3 参数提案（G4）；总 no-go 判定 |

### 偏差与组织备注（D1–D7）

1. **D1 假期口径修正**：方案 §1 假设 10-01..10-08 休市、节后首交易日 10-09；实际 **10-08（四）已复牌**。t0=09-30 批 T0=10-08（§5.1 示例写 10-09），首批 T+5 提前至 10-13（原 10-15），全部 T+5 于 10-15 齐。T+N 口径以 market_daily 实际交易日历数据驱动，代码不受影响，仅时间线前移。
2. **D2 T0.5 慢于计划**：计划 0.5 rps 一次跑完；实际 ~33s/行（网关 p50 146s），ETA 10-10 凌晨，~10% 失败需补跑。
3. **D3 行情历史提前达成**：计划「板块史 1 天 → 1 月中旬 60 交易日」；实际 10-08 部署 0040 新列 + 一次性回填（scripts/backfill-market.ts），market_daily 已含 07-02→10-09 共 66 交易日 × 20 keys，baseline n≈60 已足够 → T4.1 周期性补漏优先级下调。
4. **D4 台账 v1 缺口**：T0.4 于 10-08 15:32 部署，此前 selected 的 v1 direction 未写台账；T0.5 总体定义 `direction IS NULL`，故 09-30→10-08 15:32 的 ~40 条 v1 selected 方向不在台账内（analyses 有值、无 horizon、无回测行）。影响轻微（~2%），如需完整可对其补跑 direction v2（~40 次调用）。
5. **D5 网关劣化（最大运营风险）**：api.zero43.top step-5-preview 自 10-01 起 p50 10s→146s；10-09 另有 "no active step plan subscription"（套餐问题）→ 方向 failed 189 行（10.3%）、回填失败率 ~10%。T4.3 单次重试未实现，**建议提级**；套餐需 owner 侧检查。
6. **D6 生产事故**：10-09 18:00 并行会话在 /home/ubuntu/app（旧 AINews compose）build+up，生产 worker/api 被幽灵代码替换 24 分钟（零数据污染），18:25 从 main 5caa4ed 重建。铁律：动生产前后查 `docker inspect aihot-worker-1 --format '{{.Created}}'`；不要从 /home/ubuntu/app 跑 compose。
7. **D7 执行提速与并行线**：Phase 1 计划「10 月中 ~ 11 月初」，实际 10-09 完成部署。并行工作线（不在本方案内）：finhot-investment-analysis（降噪提示词两轮 + 统一能力评估框架 spec，9 commits 未合并，合并前需 rebase 到 main，该分支不含 0040/0041）；phase2 worktree 已建零 commit。

### 待决/待派事项

- [ ] 10-10 早：确认回填完成，补跑 ~10% 失败行（趁网关空闲）
- [ ] 派 fixer：backtest.ts 加 `--horizon t1/t3/t5`（含测试）→ 10-09/10-10 出首份 T+1 早期读
- [ ] 10-13 晚：T1.4 首份 T+5 报告 + T1.5 泄漏审计 → G2 决策
- [ ] owner：检查 api.zero43.top step 套餐（D5）
- [ ] 10 月底：启动 Phase 2（T2.1–T2.5，phase2 worktree）

---

## 1. 现状基线（已验证，非估计）

**数据（生产库 `aihot`，2026-10-07 实查）**

| 项 | 数值 | 含义 |
|---|---|---|
| market_daily | 146 行，07-02 → 09-30 | **板块行仅 09-30 一天**（20 行）；指数（sh000001/sh000300）60 天；其余日仅指数 2 行 |
| 交易日历 | 09-25 中秋、10-01..10-08 国庆休市 | **10-09（周五）为假期后首个交易日**；腾讯 kline 最新 bar = 09-30 收 4357.62，与库一致（无同步缺失） |
| articles | 18,838（自 09-29），近 7 日 ~1,843/日 | 原始采集量 |
| analyses | 1,956，近 7 日 ~136/日 | 过 prefilter 的已打分文章（**反事实总体**） |
| selected / 有 direction | 156 / **38**（~5/日，全 ≥09-30） | direction 目前只算 selected |
| receipts | 近 7 日 ~1,215 LLM 调用/日（zero-flash 8,043 + step-5-preview 451） | `purpose='direction_article'` 可归因成本 |
| publications | 152 selected | 用户面 |

**代码锚点（已定位，file:line）**

- direction 唯一闸门: `packages/backend/src/editorial/analyze.ts:429-437`（`out.selected ? judgeDirection(...) : null`，失败吞掉、direction 保持 null）
- judgeDirection: `editorial/direction.ts:49-66`（model=`DIRECTION_MODEL`，`editorial/models.ts:23`；prompt=`industry/prompts/directions.md`，**第 1 行硬编码「已经通过精选入选」**；purpose=`direction_article`；temp 0 / 30s / maxTokens 300；scope 受控词表 `industry/sectors.ts:229`）
- 提示词版本: `analyze.ts:40` `PROMPT_VERSIONS.directions`、`:43` `ANALYZE_PROMPT_VERSION`（改提示词必须 bump）
- 持久化: `analyze.ts:454-459`（INSERT analyses，同事务）；publications 镜像 `publication/publish.ts:163-252`（:237 direction 已在列）
- 反事实可行性: **所有过 prefilter 的文章都有 analyses 行**（含 blocked 的 score=NULL 行），已打分行带 title_zh/summary_zh/category/tags → judgeDirection 全部输入齐备；历史回填总体 = `analyses WHERE score IS NOT NULL AND direction IS NULL`（每 article 取最新行，≈1,700 条）
- 行情增强: `market/tencent.ts:49-72 parseRankBoards` 只读 code/name/zxj/zd/zdf，**zljlr/zdf_d5/d20/d60/zgb 为同行字符串数值、现被丢弃**（tencent.ts:5 注释）；`market/daily.ts:12-18 MarketRow`、`:133-149 writeMarketRows`（逐行 upsert，timestamptz 写 Date 实例的坑在 :135-139 有注释）；market_daily 已有空 `extra jsonb`（0039:19）
- 作业注册: `apps/worker/src/schedules.ts:26-31`（Scheduled 接口）、`:58`（`market.daily` = `35 15 * * *`, missed once 示例）、`:87-100 registerSchedules`（队列 `cron.<name>`，tz=Asia/Shanghai）；run 记账 `job_runs`
- 迁移: 最新 0039（模式: ALTER/CREATE/INDEX/COMMENT）；下一个 = **0040**
- 回测设计（既有）: `docs/roadmap.md:144-151`（P4，含诚实预期 55-60% ≈ 惯性、OOT 保留最后 1 周）；`scripts/backtest.ts` 不存在（greenfield）
- 测试: `tests/analyze.test.ts`（DB 依赖；**:95 红点**断言 tierThreshold("T1")===60 实际 42；桩 `stepOf` :28-32 **无 direction 分支**、:98-99 断言恰好 5 个 receipt —— direction 全量化后都会红）；`tests/direction.test.ts`（纯）；`tests/tencent.test.ts:96-300`（纯+DB）
- 用户面: `publication/v1.ts`（V1ItemPayload）、`notify/{selected,bark,feishu,deliver}.ts`、`operations/reports.ts`；web 卡片目前不渲染 direction（0 命中）

---

## 2. 对抗性分析（10 条：发现 → 设计决策）

| # | 发现（证据） | 设计决策 |
|---|---|---|
| **A1 数据冷启动主导时间线** | 板块历史 1 天；direction 标签 38 条（5/日）；即使一切顺利，首批 T+5 结果 = **10-15**，60 交易日板块历史 = **~1 月中旬** | 方案分三期：**埋点期（10 月）→ 积累期（11–12 月）→ 学习期（1 月+）**。前 2 个月对用户可见的价值 = 方向可见 + 市场上下文日报 + 第一份诚实回测，**不承诺「自动变聪明」**；M2/M3 的统计意义期在 12 月–1 月 |
| **A2 反事实成本** | 已打分 ~136/日；全量 direction ≈ +136 调用/日 = **现 LLM 量的 +11%**；prefilter 拒绝（~1,700/日）是噪声，其「门槛」是 prefilter 不是阈值 | direction 覆盖 **全部 `score IS NOT NULL`**（含反事实）；排除 prefilter 拒绝（后置 T4.4 抽样审计）；历史 ~1,700 条一次性低速回填（t0=原 created_at，诚实记录无市场上下文） |
| **A3 重复计数** | 同一故事多文章同日同板块 = 相关预测，行级聚合会虚增样本、基率过信 | 台账行 = analyses（article×revision，诚实单元）；**所有聚合统计在去重单元 (CST 日历日 × sector_key × sign(direction)) 上计算**；跨日重复计为已知限制 |
| **A4 版本可比性** | 改 directions.md / 注入市场上下文 / 注入先验都会变 prompt hash | 台账每行记 `prompt_version + model + input_snapshot`（t0 冻结，含当时所用市场/先验上下文原文）；**所有统计按版本切片，不跨大版本池化** |
| **A5 自动化陷阱**（oracle 红队核心警告） | 连续自动调门槛 = 过拟合 + 反馈震荡 + 自我实现样本内 lift → 「越学越差、回测更好看」 | **M3 前 6 个月 = 提案引擎**：只产 `parameter_versions(status=proposed)` + OOT 证据，人工审批 apply；阈值配置化（DB active 版本 + 代码默认 42/48/55 兜底）；auto-apply 需 3 连续月 OOT 正 lift 且显式用户决策 |
| **A6 回补不可行** | push2his 对本机 IP TLS 封禁；xiaoshi 板块成分股仅 16 个快照日且有断档 | 主策略 = **日积累 + 零额外请求捕获 zdf_d5/d20/d60/zljlr**（腾讯 rank 行里本来就有，10-09 起逐日沉淀多周期收益/资金流）；历史回补 = 每周重试（机会性）+ xiaoshi 交叉校验；**回测基线回退 = benchIndex**（每板块自带，指数有 60 天）→ direction 回测从第一天就能对指数级实际走势做 |
| **A7 两个耦合决策**（上轮留给 oracle） | baseline 口径与暴露范围 | baseline = 板块行优先、缺失时回退该板块 `benchIndex`（记 `baseline_ref`）；**用户面只暴露 selected 的 direction/scope**（反事实台账纯内部，不进 digest/推送） |
| **A8 代码库已知坑** | 红测试 :95；桩缺 direction 分支；postgres date OID（Date 对象比较静默失效）；idle_timeout 600s 挂起；litellm 429 窗口；宿主 DB IP 漂移 | 全部编码为 §8 护栏，开发期强制执行；direction 失败加单次重试 + `direction_status` 记录（failed ≠ miss） |
| **A9 YAGNI** | 多 horizon 多标签、实时相关性、第二模型都会放大表面积 | v1 = 单主 horizon（模型选 t1/t3/t5）+ 单置信度 0-100；板块间相关性/个股/估值/第二模型/embedding 类比全部后置（§2 非目标） |
| **A10 泄漏** | 三种：T+N 实际含当日反应 / 同窗口既回测又再推导 / 类比检索越过 t0 | T0 严格定义（§5.1，**T0 = 严格晚于 t0 日历日的第一个交易日**，事件收益自 T0-1 收盘起算）；OOT 保留最后 2 周只用于验证；台账 append-only；T1.5 专项泄漏审计 |

---

## 3. 目标 / 非目标

**目标（三层）**
1. **6 周**：direction 覆盖全量已打分文章（含反事实台账）；selected 的方向/板块用户可见；market_daily 含资金流/多周期收益日更；T+N 结果自动标注；第一份带 baseline + lift 的回测报告（G2）。
2. **3 个月**：市场上下文注入 direction（v3）；基率表（分层收缩）+ 置信度校准曲线（OOT 验证，G3）；相对强度日报；lift 看板。
3. **6 个月**：先验注入 A/B 结论；M3 参数提案引擎（人工审批）；决策：是否谈自动化。

**非目标（本版明确不做）**
- 个股行情/技术面、估值/基本面、第二 LLM 模型（韧性项，另立项）
- 板块-板块相关性、新闻-板块联动（需 3 个月板块数据，学习期后评估）
- prefilter 反事实审计（T4.4 后置抽样）
- embedding 历史类比（Phase 3 可选，需 EMBEDDING_* 配置）
- 自动改参数（任何时点都需人工审批，见 A5）

---

## 4. 目标架构（数据流）

```
96 源 → 采集 → prefilter → structure/摘要 → 2×score → 门槛 → selected → publications(用户面: 标题+摘要+方向/板块*)
                                                        │ score IS NOT NULL（全量，含反事实）
                                                        ▼
                                        direction v1→v2(horizon/conf)→v3(+市场上下文)→v4(+先验)
                                                        │ t0 冻结 input_snapshot(prompt_version/model/上下文原文)
                                                        ▼
                                        prediction_ledger（append-only，published 标志，direction_status）
                                                        │ 市场演化
                                                        ▼
                          cron market.label-outcomes（16:10 工作日，Asia/Shanghai）
                          → T0/T+N 对齐（§5.1）→ cum_pct / hit / baseline_ref（板块行优先→benchIndex）
                                                        ▼
                  ┌────────────────────────────────────┴───────────────────────────────┐
                  ▼                                                                     ▼
        scripts/backtest.ts（随时可跑）                                    cron priors.regenerate（月度，M2）
        docs/backtest/<date>.md：hit/baseline/lift/CI + OOT 表             → base_rate_priors（分层收缩, 版本化, OOT）
        + keep/adjust/demote 决策记录                                       → calibration_curve（10 bin + Brier, 按版本×模型）
                  │                                                                     │
                  └────────────────────────┬────────────────────────────────────────────┘
                                           ▼
                       cron params.propose（月度，M3，仅提案 + 人工审批）
                                           ▼
                parameter_versions(status=applied, active) → selection.ts 阈值/权重配置化 → 下一轮推演
```
*用户面暴露 = Phase 1（T1.1）；反事实行永远不进用户面（A7）。

**复利资产定位**（沿用上轮结论）：台账复利**数据**；基率/校准表（M2）复利**知识**（真正抬高推演下限）；版本化参数（M3）复利**策略**。

---

## 5. 关键算法（精确定义，防歧义）

### 5.1 T0 / T+N 对齐（防泄漏规则）
- `D(t0)` = t0 的 CST 日历日；`T0` = **严格大于 D(t0) 的第一个 market_daily 交易日**；`T0-1` = T0 的前一交易日；`T+N` = T0 之后第 N 个交易日。
- 事件收益 `cum(N) = close(T0+N) / close(T0-1) − 1`（含 T0 当日反应，事件研究惯例：公告日次一交易日开始度量）。
- 例：t0=09-30（中秋/国庆前最后交易日）→ T0=10-09，T+1=10-09 收盘（10-09 晚可知），T+5=10-15 收盘。
- 标注作业仅在 `max(trade_date) >= T0+N` 时标注；**任何计算不得引用 t0 之前生成的数据之外的未来信息**；标注幂等。
- 无 T0（如 t0 后长期无交易行）→ `outcome_status='skipped'`，记原因。

### 5.2 baseline（板块惯性）
- 对样本窗内每个交易日 X（板块集合与事件同）：`r(X) = close(X)/close(X−1) − 1`，`c(X,N) = close(X+N)/close(X−1) − 1`。
- `baseline(N) = P[ sign(c(X,N)) == sign(r(X)) ]`（当日方向持续 N 天的概率）。
- `lift = event_hit_rate(N) − baseline(N)`，同窗口、同板块集合、同去重口径。
- 板块行缺失的日期用该板块 benchIndex 行替代（与事件的 baseline_ref 口径一致）。
- 报告永远带 `n` 与 95% CI（`±1.96·sqrt(p(1−p)/n)`）；**n<30 的格子标 insufficient，不参与结论**。

### 5.3 基率与分层收缩（M2）
- 层级（从细到粗）：`(event_type × sector × horizon × regime) → (× sector × horizon) → (event_type × horizon) → global`；event_type = analyses.category（后续可细化）。
- 格子命中率 = 去重单元上的命中数/单元数（§2-A3）。
- 收缩估计 `p̂ = (n·p_cell + k·p_prior) / (n + k)`，**k=50**；`p_prior` = 上一层估计（global 起点 = 0.5）。
- 格子 n<20 只报收缩值并报 n；OOT 协议：**fit 用截至 T−2 周的数据，最后 2 周 holdout 只做验证**（报 hit 差与 OOT 命中率）。

### 5.4 置信度校准
- 按 `prompt_version × model` 切片；confidence 十分位 bin（0-9, 10-19, …）；每 bin 报 n 与实际命中率；整体 Brier score。可靠性图落 `docs/calibration/<date>.md`。

### 5.5 market_regime（Phase 2 起）
- 每交易日一行：`sh000300_20d_pct = close/close[−20] − 1`；`regime = up / down / chop`（`|pct| < 2%` → chop）。基率表按 regime 条件化（A：扁平基率会把市况平均成浆糊）。

---

## 6. 数据模型（迁移，仿 0039 模式）

**0040_prediction_ledger_market_enrich.sql**（Phase 0）
```sql
CREATE TABLE prediction_ledger (
  id bigserial PRIMARY KEY,
  analyses_id bigint NOT NULL UNIQUE REFERENCES analyses(id),
  article_id text NOT NULL REFERENCES articles(id),
  t0 timestamptz NOT NULL,               -- = analyses.created_at，冻结
  prompt_version text NOT NULL,
  model text,
  direction text NOT NULL CHECK (direction IN ('bullish','bearish','neutral','none')),
  direction_status text NOT NULL DEFAULT 'ok' CHECK (direction_status IN ('ok','failed','skipped')),
  scope text[] NOT NULL DEFAULT '{}',
  horizon text CHECK (horizon IN ('t1','t3','t5')),          -- Phase 1 起有值
  confidence integer CHECK (confidence BETWEEN 0 AND 100),   -- Phase 1 起有值
  published boolean NOT NULL DEFAULT false,                  -- t0 时是否 selected
  input_snapshot jsonb NOT NULL DEFAULT '{}',                -- t0 冻结输入原文（见 T0.4）
  outcome_status text NOT NULL DEFAULT 'pending' CHECK (outcome_status IN ('pending','labeled','skipped')),
  t0_date date,
  cum_pct_t1 numeric, cum_pct_t3 numeric, cum_pct_t5 numeric,
  hit_t1 boolean, hit_t3 boolean, hit_t5 boolean,
  baseline_ref text,                                -- 'sector:BKxxxx' | 'bench:sh000300'
  labeled_at timestamptz
);
CREATE INDEX ledger_t0_idx ON prediction_ledger (t0);
CREATE INDEX ledger_pending_idx ON prediction_ledger (outcome_status) WHERE outcome_status = 'pending';
COMMENT ON TABLE prediction_ledger IS 'M1 预测台账（含反事实）：回测/基率/校准/参数提案的唯一事实源；append-only';

ALTER TABLE market_daily
  ADD COLUMN zljlr numeric,      -- 主力净流入（腾讯原始字符串 → numeric，单位元）
  ADD COLUMN zdf_d5 numeric,     -- 5 日累计 %
  ADD COLUMN zdf_d20 numeric,    -- 20 日累计 %
  ADD COLUMN zdf_d60 numeric;    -- 60 日累计 %
-- zgb（涨跌家数，原始字符串）与未来条数类数据 → 既有 extra jsonb（0039:19），不动 schema
```

**0041_horizon_confidence_priors.sql**（Phase 1）
```sql
ALTER TABLE analyses
  ADD COLUMN horizon text CHECK (horizon IN ('t1','t3','t5')),
  ADD COLUMN confidence integer CHECK (confidence BETWEEN 0 AND 100);
ALTER TABLE publications
  ADD COLUMN horizon text CHECK (horizon IN ('t1','t3','t5')),
  ADD COLUMN confidence integer CHECK (confidence BETWEEN 0 AND 100);

CREATE TABLE base_rate_priors (
  version text NOT NULL,
  event_type text NOT NULL,
  sector_key text NOT NULL DEFAULT '',          -- '' = 跨板块
  horizon text NOT NULL CHECK (horizon IN ('t1','t3','t5')),
  regime text NOT NULL DEFAULT 'all',
  n_units integer NOT NULL,
  raw_rate numeric,                             -- 去重单元原始命中率
  hit_rate numeric,                             -- 收缩后（k=50）
  cum_pct_mean numeric,
  oot_hit_rate numeric,                         -- 最后 2 周 holdout
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version, event_type, sector_key, horizon, regime)
);

CREATE TABLE calibration_curve (
  version text NOT NULL,
  prompt_version text NOT NULL,
  model text NOT NULL,
  bin_lo integer NOT NULL CHECK (bin_lo BETWEEN 0 AND 90 AND bin_lo % 10 = 0),
  n integer NOT NULL,
  actual_rate numeric,
  brier numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version, prompt_version, model, bin_lo)
);

CREATE TABLE parameter_versions (
  version text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('thresholds','weights','priors_weight')),
  params jsonb NOT NULL,
  evidence jsonb NOT NULL,                       -- OOT lift / n / 窗口 / 收缩说明
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','applied','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decision_note text
);
```

**0042_market_regime.sql**（Phase 2）
```sql
CREATE TABLE market_regime (
  trade_date date PRIMARY KEY,
  sh000300_20d_pct numeric NOT NULL,
  regime text NOT NULL CHECK (regime IN ('up','down','chop'))
);
```

---

## 7. 阶段计划

> 每个 Phase 启动时由 orchestrator 展开为 TDD 任务清单（文件级 + 红绿步骤），fixer 并行 lane + reviewer 验收。以下任务已含文件锚点与验收标准。

### Phase 0 — 埋点地基（10-08 ~ 10-14，约 3 开发日 + 验证）

> **状态**: ✅ 全部完成（10-08）+ G0 通过（10-09）；唯一尾巴 = T0.5 回填 🔄（ETA 10-10 凌晨）

**T0.1 修红测试，建立绿色基线**

> **状态**: ✅ 完成（10-08）— 基线 219/222 全绿（3 个既有 env-red 需 live 网络）
- Modify: `tests/analyze.test.ts:95`（`60` → `42`；顺查 T1_5/T2 断言与 `industry/selection.ts:12` 一致）
- 验收: `sudo docker inspect aihot-db-1` 取 IP 后 `DATABASE_URL=postgres://aihot:aihot@<IP>:5432/finhot_ci npm test` 全绿。此后一切改动以此为基线。

**T0.2 迁移 0040（台账 + market 加列）**

> **状态**: ✅ 完成（10-08）— 生产 10-08 22:41 手工应用；committed 版本曾是手工 CI 变体（内嵌事务/自插行/缺 4 列），已在 main 修复（39862b3、0e49b4a）并与生产 schema 逐列 diff 对齐
- Create: `database/migrations/0040_prediction_ledger_market_enrich.sql`（§6 全文）
- 验收: finhot_ci 与 aihot 均干净应用；ledger 表 + market_daily 新列存在且可空。

**T0.3 腾讯解析增强（零额外请求）**

> **状态**: ✅ 完成（10-08）— 10-08/10-09 连续两日 18/18 板块行新列（zljlr/zdf_d5/d20/d60）填满，G0 观察点达成
- Modify: `market/tencent.ts:19-26`（TencentBoard 加 `zljlr/zdf_d5/zdf_d20/zdf_d60: number|undefined` + `zgb_raw?: string`）、`:49-72`（parseRankBoards 解析字符串数值，非法/缺失 → undefined）；`market/daily.ts:12-18`（MarketRow 同步）、`:133-149`（writeMarketRows 写新列，zgb_raw → extra）
- Test: `tests/tencent.test.ts`（纯函数：正常数值/负数/缺失/非法值；`sane()` 漂移守卫 :181-188 仅管 pct，不动）
- 验收: tencent.test.ts 绿；真实 rank_list 响应 curl 解析人工核对；10-09 15:35 后 20 板块行新列 100% 填充（G0）。

**T0.4 direction 全量化 + 台账写入（M1 核心）**

> **状态**: ✅ 完成（10-08 15:32 部署）— 台账全量写入运行中：1830 行，published=false 反事实 1634；direction_status ok 1642 / failed 189（10.3%，D5）
- Modify:
  - `editorial/analyze.ts:429-437` — 闸门 `out.selected` → `out.score !== null`；在 :454-459 同一事务内写 `prediction_ledger`（t0=now，`input_snapshot` = `{title_zh, summary_zh(≤400), category, tags, source, prompt_version, model, market_ctx: null, prior_ctx: null}`；`published` = selected；`direction_status` = ok/failed）
  - `industry/prompts/directions.md` — 去掉「已经通过精选入选」→ 中性措辞（受控板块词表与输出 schema 不变）；bump `analyze.ts:40/43` 版本号
  - `tests/analyze.test.ts` — 桩 `stepOf`(:28-32) 加 direction 系统提示分支；:98-99 断言更新（已打分文章 6 receipts：prefilter/score/score/structure/understand/direction；blocked 文章不变）
- Test: `tests/analyze.test.ts`、`tests/direction.test.ts`
- 验收: 每个 `score IS NOT NULL` 的文章产生 direction + 台账行（含完整 input_snapshot）；selected 的 publications 路径不变；全测试绿。

**T0.5 历史反事实回填（一次性）**

> **状态**: 🔄 进行中 — scripts/backfill-direction.ts（ef93adb）10-09 13:49 起实跑，~1130/1645（69%），ETA 10-10 凌晨；失败率 ~10%（api.zero43.top 超时为主 + 1 起 "no active step plan subscription"），跑完后需对失败行补跑一次；日志 /tmp/finhot-backfill-direction.log
- Create: `scripts/backfill-direction.ts` — 总体 = 每 article_id 最新 analyses 行且 `score IS NOT NULL AND direction IS NULL`（≈1,700 条）；复用 `direction.ts:49-66`；限速 0.5 rps；`--dry-run`；t0=analyses.created_at；input_snapshot 诚实记 `market_ctx: null`（当时不存在）；**`process.exit(0)` 显式退出**（memory #17）
- 验收: dry-run 计数与 SQL 一致；实跑后台账历史行 t0 分布匹配 analyses.created_at；receipts `purpose='direction_article'` 计数匹配。

**T0.6 T+N 标注作业（M4 之眼）**

> **状态**: ✅ 完成（10-08）— 10-09 16:10 首次生产运行：labeled=0（尚无 T+5 可算，设计内）/ skipped=858（全部 neutral/none/空 scope/direction failed）/ pendingRemaining=117；幂等；T+N 口径以 T1.0 修复后为准
- Create: `packages/backend/src/market/labeler.ts`（`labelOutcomes()`：取 pending 台账行 → §5.1 对齐 → cum pct（板块行优先，缺失回退 `sectors.ts:30` 的 benchIndex，记 baseline_ref）→ hit 标志 → 更新；date OID 归一（仿 `daily.ts:91-99` lastWritten 模式））
- Modify: `apps/worker/src/schedules.ts:34` SCHEDULES 数组加 `{ name: "market.label-outcomes", cron: "10 16 * * 1-5", missed: "once", run: () => labelOutcomes() }`（import 同 :23 模式）
- Test: `tests/labeler.test.ts`（finhot_ci fixture：跨假期 09-30→10-09；板块缺失→bench 回退；幂等重跑；非交易日不误标；skipped 路径）
- 验收: 09-30 预测批在 10-09 16:10 首标 T+1 正确（手算核对）；双跑幂等。
- **G0 门（10-09）**: 15:35 `market.daily` 首跑生产路径写 20 板块 + 2 指数行且新列填充；alerts 无新告警。

### Phase 1 — 可见 + 可度量（10 月中 ~ 11 月初）

> **状态**: ✅ T1.1/T1.3 完成并部署（10-09 11:57，main ff55385，206/206 全绿）；T1.2 完成未首跑；T1.4 ⬜（等 10-13 T+5）、T1.5 ⬜（随 T1.4）。开发中新增 **T1.0**（labeler T+N off-by-one 修复，1fd3f20，原 §5.1 示例在 10-08 复牌下 off-by-one）

**T1.1 用户面暴露 direction/scope（仅 selected）**

> **状态**: ✅ 完成（12290f9，10-09 部署）— v1 payload + Bark/Feishu + web 卡片，仅 selected；反事实不进任何用户面（A7 达成）
- Modify: `publication/v1.ts`（V1ItemPayload + `direction/scope`，向后兼容）；`notify/selected.ts` + `notify/bark.ts`/`feishu.ts`（入选条目行加「方向: 利好 · 板块: 半导体, 贵金属」）；web 卡片组件（实现期 recon 定位 SSR 渲染组件，加一行）
- Test: `tests/publication.test.ts` payload 断言扩展；notify 渲染测试
- 验收: web 卡片 + Bark/Feishu 可见（仅 selected）；反事实行不进任何用户面（A7）。

**T1.2 `scripts/backtest.ts`（roadmap P4 口径 + §5.2 baseline）**

> **状态**: ✅ 完成未首跑（84ff3ff）— §5.1/§5.2 口径 + fixture 手算测试全绿；首跑需 T+5 数据（首批 10-13 周一 16:10 落库）；改进项：目前只取 outcome_status='labeled'（等 T+5）的行，加 `--horizon t1/t3` 支持即可 10-09/10-10 出 T+1 早期读（T+1=T0，~404 信号行已全可算）
- Create: `scripts/backtest.ts`（分 horizon×板块×方向：hit rate、n、baseline、lift、CI；OOT 默认保留最后 2 周单列；输出 `docs/backtest/<date>.md`；`--as-of` 参数；process.exit(0)）
- Test: fixture 手算复算（与 §5.1/5.2 定义逐数核对）
- 验收: 在 10-15（首批 T+5）后产出第一份报告。

**T1.3 direction v2：horizon + confidence**

> **状态**: ✅ 完成（4c9112c，10-09 11:57 部署）— 0041 三表 10-08 已入生产；验收达成：部署后成功预测 horizon+confidence 339/340=99.7%（≥95% ✓），缺失 52 行全部为 direction failed（D5 网关超时，非 prompt 问题）
- Modify: `industry/prompts/directions.md`（要求 primary_horizon ∈ t1/t3/t5 + confidence 0-100 + 一句话 horizon 理由）、`editorial/direction.ts:23-26`（schema + 校验）、`analyze.ts`（透传写 analyses + 台账）、`publish.ts:237` 区域（publications 镜像）
- Create: `database/migrations/0041_horizon_confidence_priors.sql`（§6）
- 验收: ≥95% 新预测有 horizon+confidence；按 prompt_version 切片统计可用。

**T1.4 第一份回测报告 + 决策记录（G2）**

> **状态**: ⬜ 未开始 — 前置：10-13 首批 T+5 数据（T0=09-30 批，62 信号行）；预期 10-13/14 出 docs/backtest/ 首份报告 + keep/adjust/demote 决策记录（比 §11 原计划 10-15 提前，D1）
- 产出: `docs/backtest/2026-10-*.md` + 明确 keep/adjust/demote 决策（对齐 roadmap P4 验收：「第一份带数字的回测报告 + 明确的决策记录」）。诚实预期：大概率弱信号（55-60% ≈ 惯性）；报告的价值是**给证据**，不是给结论。

**T1.5 泄漏审计（reviewer 专项 lane）**

> **状态**: ⬜ 未开始 — 随 T1.4 排期（G2 关闭前必须无红项）；检查项中 T0 口径以 10-08 复牌的实际交易日历复核（D1）
- 检查项: T0 严格晚于 D(t0)；outcome 只含 close(T0-1)→close(T0+N)；OOT holdout 未进入任何「训练/拟合」；input_snapshot 不可变（append-only 抽查）；回测窗口与标注窗口无重叠使用
- 产出: 审计清单（红/黄/绿 + 修复建议），红项阻塞 G2 关闭。

### Phase 2 — 上下文 + 学习（11 月 ~ 12 月）

> **状态**: ⬜ 未开始 — phase2 worktree 已建（/home/ubuntu/app/FinHot-phase2，零 commit）；启动窗口 10 月底（G2 决策 + 数据积累后），0041 三张表已就绪可直接写入

**T2.1 direction v3：市场上下文注入（P1-6）**

> **状态**: ⬜ 未开始 — 数据源已就绪（market_daily 18 板块新列自 10-09 日更 + 07-02 历史）
- Modify: `industry/prompts/directions.md` + `direction.ts`（注入 18 板块紧凑表：`名称 | 当日% | 5日% | 主力净流入(亿)`，数据源 = market_daily 最新日；缺失行省略并记入 input_snapshot；单次调用、~400 token，不做两遍）；版本 bump
- 验收: 输出 schema 不破；受控词表命中率不降；v2/v3 版本切片对照报告可出。

**T2.2 market_regime 日作业**

> **状态**: ⬜ 未开始（0042 未建；sh000300 60+ 日历史已可算 20d）
- Create: 0042 迁移 + `market/regime.ts` + schedule `market.regime`（`15 16 * * 1-5`）
- 验收: 每交易日一行；regime 分布合理（±2% 规则）。

**T2.3 相对强度日报（P2-8）**

> **状态**: ⬜ 未开始（zdf_d20 自 10-09 起日积累，10 月底可算）
- Modify: `operations/reports.ts` / Bark daily（加「板块相对强度 TOP3/BOTTOM3 vs 基准」段，`zdf_d20 − bench.zdf_d20`）
- 验收: 日报出现；数值与库一致。

**T2.4 `priors.regenerate` 月度作业（M2 生成，G3）**

> **状态**: ⬜ 未开始 — base_rate_priors/calibration_curve 表已就绪（空）；coarse 格子 n≥100 去重单元需 11 月数据积累（当前台账 ~1830 行、bullish/bearish 信号行 ~404，11 月中旬达标）
- Create: schedule `priors.regenerate`（`0 6 1 * *`）+ `market/priors.ts`（§5.3 分层收缩 + §5.4 校准，去重单元，OOT 最后 2 周；写 base_rate_priors/calibration_curve 版本化；报告落 docs）
- 硬约束: **此阶段只产报告与表，不改任何 prompt/阈值**（A5）。
- 验收: 首版表带 n/CI/OOT；coarse 格子（event_type×horizon）≥100 去重单元方可引用。

**T2.5 lift 看板（M4 表面）**

> **状态**: ⬜ 未开始
- Modify: Bark daily 加「近 28 天预测 vs 惯性：T+5 lift +X.Xpp（n=NN，去重）」
- 验收: 数字与 backtest 脚本一致。

### Phase 3 — 学习边（1 月+）

> **状态**: ⬜ 未开始；总 no-go 判定点在 T3.1

**T3.1 先验注入 A/B（G3 通过后）**

> **状态**: ⬜ 未开始 — 若无 OOT 正 lift → 不注入、M3 不接线（总 no-go，系统降级为「测量 + 案例记忆」）
- direction v4：prompt 加先验行（「近 90 天同类事件在 X 板块 T+5 命中率 YY%（n=NN，OOT Z%）」，取自 active 版本 base_rate_priors）；与 v3 比 OOT lift
- 验收: 明确的 keep/discard A/B 结论（落决策记录）。**若无 OOT 正 lift → 不注入，M3 不接线（总 no-go）。**

**T3.2 `params.propose` 月度提案引擎（M3）+ 阈值配置化**

> **状态**: ⬜ 未开始；T3.3（可选 embedding）/ T3.4（自动化决策门）同样未开始
- Create: schedule `params.propose`（月度，priors 之后）；产 thresholds/weights 提案 → `parameter_versions(status='proposed')`（含 n/OOT/收缩说明）
- Modify: `industry/selection.ts:12` + `analyze.ts:54 tierThreshold` — 阈值改读 `parameter_versions` active 版本（status='applied'），无则回退代码默认 {42,48,55}
- 流程: 人工审批（decision_note 留痕）→ status='applied'；**禁止 auto-apply**
- 验收: 首份提案含完整 OOT 证据链；审批有记录。

**T3.3（可选）embedding 历史类比** — 需 EMBEDDING_* 配置；每条类比带机制标签并锚定 base_rate_priors（防「表面相似因果不同」复利错教训）
**T3.4 自动化决策门** — 仅当 3 连续月 OOT 正 lift 提案时讨论 auto-apply；默认长期人工审批。

### Phase 4 — 加固（与主链并行、机会性）

> **状态**: ⬜ 未开始。**T4.1 优先级下调**（D3：一次性回填已完成，周期性补漏不再是关键路径）；**T4.3 建议提级**（D5：当前 ~10% 方向失败无重试，live + 回填都受影响）

- **T4.1** `market.backfill-retry` 每周作业：push2his 限速（20 请求 × 5s）只补缺失板块日；成功即 xiaoshi 交叉校验
- **T4.2** xiaoshi 每日新行交叉校验（复用 `scripts/verify-market-xiaoshi.py`，偏差入 alerts）
- **T4.3** direction 单次重试（10s 退避，走 receipt_attempts 预算）+ `direction_status='failed'` 可观测
- **T4.4（后置）** prefilter 反事实抽样审计（量化 prefilter 漏放率）

---

## 8. 护栏（开发期强制执行）

1. **T0.1 先于一切**：:95 红测试不修，后续每次测试都带噪声。
2. analyze.test.ts 桩与断言随 T0.4 同步更新（6 receipts），否则新增红点。
3. postgres date OID：比较前归一（typeof 判断 + `slice(0,10)`，仿 `daily.ts:91-99`）；timestamptz 列写 Date 实例（`daily.ts:135-139`）。
4. 一次性脚本（scripts/*.ts）主路径结束 **`process.exit(0)`**；禁用 `timeout N … | tail` 管道（掩盖挂起）。
5. 宿主侧 DB：`docker exec aihot-db-1 psql`（IP 随宿主重启漂移，勿硬编码）；测试连 finhot_ci 先 `docker inspect` 取 IP。
6. litellm 429：direction 30s 超时 + 失败吞 → T4.3 加单次重试；失败 ≠ 预测 miss（direction_status 区分）。
7. 部署：改 .env 后 `docker compose up -d worker api`（restart 不重读 env_file）；镜像重建后跑 G0 检查。
8. 提示词任何改动必须 bump `PROMPT_VERSIONS.directions` / `ANALYZE_PROMPT_VERSION`（A4 可比性命脉）。
9. 台账 append-only：outcome 列只由 labeler 写；input_snapshot 一经写入不可更新（审计抽查点）。
10. 所有新 SQL 的 date/timestamptz 处理在 PR 描述中显式声明用了哪种归一方式。

---

## 9. 验证门（No-Go 判据）

| 门 | 时点 | 判据 | 状态（10-09） |
|---|---|---|---|
| **G0** | 10-09 | 15:35 market.daily 生产首跑：20 板块 + 2 指数行、新列填充；alerts 无新告警 | ✅ **通过**（15:35 落 20 行、18/18 板块新列填满；alerts 当次 sent=[]，3 个既有 open 告警 content.process/sources.failing/provider.refused.llm，其中 provider.refused.llm ↔ D5 网关问题） |
| **G1** | Phase 0 完 | 连续 5 交易日 ledger 覆盖 ≥95% 已打分文章；market 新列 100% 填充；测试全绿；backtest fixture 手算一致 | ⏳ **观察中**（10-09 覆盖 487/487=100% ✓ 首日；10-08 为 277/344=80.5%，系 T0.4 当日 15:32 才部署的冷启动不计入；连续 5 交易日 = 10-09/12/13/14/15 → **10-15 可关闭**；market 新列 100% ✓；测试 206/206 ✓） |
| **G2** | ~10-15 起 | 首份回测报告含 hit/baseline/lift/CI + OOT 表 + keep/adjust/demote 决策记录；T1.5 审计无红项 | ⬜ **预期 10-13/14**（D1 提前）；依赖 T1.4 + T1.5 |
| **G3** | 12 月 | 基率表 coarse 格子 ≥100 去重单元且 OOT 通过；校准可靠性图 + Brier；T2 各 surface 上线 | ⬜ |
| **G4** | 1 月+ | 首份参数提案（含 OOT 证据）+ 人工决策；此前**禁止**任何 auto-apply | ⬜ |
| **总 no-go** | 3 个月先验注入 A/B | 无 OOT 正 lift → M3 不接线，系统降级为「测量 + 案例记忆」，决策记录归档，不硬上 | ⬜ 判定点在 T3.1 |

---

## 10. 开放决策（批准即按推荐执行）

| # | 决策 | 推荐 | 理由 |
|---|---|---|---|
| 1 | direction 覆盖全量已打分文章（非仅 selected） | **YES** | +11% LLM 调用（~136/日）；是台账/基率/门槛校准的前提（A2/A3） |
| 2 | 用户面只暴露 selected 的方向/板块（反事实台账纯内部） | **YES** | digest 保持质量门语义；台账是机器环的燃料（A7） |
| 3 | M3 前 6 个月人工审批 + 阈值配置化 | **YES** | 防自适应不稳定（A5）；配置化是审批的前提而非对立面 |
| 4 | baseline 板块行优先、缺失回退 benchIndex | **YES** | 指数历史 60 天 vs 板块 1 天，回退让回测从第一天可用（A6） |
| 5 | embedding 类比后置 Phase 3（先证 M2 再用记忆环） | **YES** | 记忆环在 M2 之前会复利未校准的教训（oracle 红队） |

---

## 11. 时间线与数据可用性（诚实冷启动）

| 日期 | 事件 | 可度量物 |
|---|---|---|
| 10-09（五） | 假期后首交易日：G0 首跑生产同步 + labeler 首标 09-30 批 T+1 | 首条「预测 vs 实际」 |
| 10-15（三） | 09-30 批 T+5 结果齐全 | 首批 T+5 数字（n≈回填+6 日增量，~200-400 行，去重后 ~100-200 单元） |
| 10 月底 | ~15-18 交易日板块历史 | 完整首份回测报告（G2）；相对强度段可算 |
| 11 月底 | ~35-40 交易日 | coarse 基率格子开始有统计意义；zdf_d60 时间序列可用 |
| 12 月 | G3 | 基率表 + 校准曲线（OOT）；先验注入 A/B 结论 |
| 1 月+ | G4 | 首份参数提案；自动化决策门评估 |

**明示**：前 2 个月用户可见价值 = 方向/板块可见 + 市场上下文日报 + 回测报告 + lift 看板；「自动变聪明」的飞轮效应最早 12 月–1 月可见，且以 OOT 证据为准，不以回测好看为准。

---

## 12. 执行说明

- **展开机制**：每 Phase 启动时 orchestrator 将任务展开为 TDD 任务清单（每步 2-5 分钟、红绿-commit 粒度），fixer 并行 lane（文件/资源不相交）+ reviewer 验收；Phase 间以 G 门为检查点。
- **分支**：每 Phase 一个 worktree 分支 → PR → main；部署 = 镜像重建 + `docker compose up -d worker api`。
- **回滚策略**：台账写入可独立关闭（闸门回退 selected-only，数据保留）；提示词按版本回退；迁移均为加性（无破坏性），必要时 drop table。
- **风险登记册**：§2 十条 A1-A10 + §8 护栏 + §9 no-go 判据，开发中任何一步触发 no-go 即停并出决策记录。
