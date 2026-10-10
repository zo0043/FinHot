# FinHot · pi-web 会话归档摘要

> 生成：2026-10-09（归档操作当日）
> 来源：`~/.pi/agent/sessions/--home-ubuntu-app--/` 下 48 个 pi-web 会话（JSONL）
> 归档操作：其中 22 个 FinHot 相关会话已在 pi-web 中标记归档（`~/.pi/agent/pi-web-session-state.json`，22 条 `archivedAt`）；当前执行归档的会话（01a120da）在运行时未归档。
> 方法：4 个并行 agent 按阶段提取各会话 JSONL（用户消息全量 + 助手文本抽样，jq 提取），引用数字与仓库内 gold.jsonl、提交记录、生产 DB 实测交叉核对。时间为北京时间（10-07 一节因原文按 UTC 记录，本地 = +8h）。

## 0. FinHot 历史一图流（2026-09-30 → 10-09）

1. **09-30 上午·起源**：AIHOT 项目分析（三个分叉会话）→ 拍板改做理财财经（FinHot 诞生）；期间踩了 pi-web 输出截断横幅（maxTokens 65536 限制）
2. **09-30 下午/夜·金标与降噪**：gold 三轮标注 82/118 → 严格版 34/166；第一性原理分析（研究卡方案 → 精选降噪规格）；发现 zero-flash 评分截断根因
3. **10-01·降噪落地**：W1T3 重标 → strict gold 27/173；提示词三处编辑；eval 61.1%→67.6%（3 轮上限 64.4%）；handoff 交接
4. **10-07·运维与飞轮方案**：运行体检（板块行情模块从未成功过）+ 行情换源腾讯 ifzq + BK 码 18 个中 14 个错配修复；litellm 网关完全退役，LLM 切 api.zero43.top/v1（step-5-preview）；「推演飞轮升级方案」落盘、Phase 0 完成部署、Phase 1 开工；当日 3 起 git 树损坏（并行会话互踩）
5. **10-08·抢救与收口**：进度检查①发现 Phase 0 一半增量在 git 事故中丢失 → 从生产 Docker 镜像救回 630 文件树 + 重写 T0.4 → 部署（c180018）；Phase 1 开工（off-by-one、node V8 日期 bug）→ 收口 218/218 部署（5e8643b）；finhot-recover-1 容器半夜复活破坏，悬空 commit 重建 4 分支 + 2 worktree
6. **10-09·验证与归档**：worktree 目录定论并清理；G0 提前达成（10-08 实为交易日）；修 4 回归后 Phase 1 补部署生产（206/206，11:57）；T0.5 回填 1645 条（69% 时点）；东财 WAF 封锁板块历史回补 → 设计内跳过（labeler 有指数回退）；方案文件重建 + 状态标记入库（756126c）；18:00 幽灵 compose 事故（18:25 恢复）

## 1. 已归档会话清单（22）

| 日期 | id | 一句话主题 | 结束状态 |
|---|---|---|---|
| 09-30 | 01a0f0e5 | AIHOT 项目分析 → 财经改造（起源主线） | 完成，方案落盘 |
| 09-30 | 01a0f0f0 | 同上（分叉支线 A） | 完成 |
| 09-30 | 01a0f0f9 | 同上（分叉支线 B，最完整） | 完成 |
| 09-30 | 01a0f0e8 | 会话截断横幅排查（因起源会话触发） | 完成 |
| 09-30 | 01a0f100 | FinHot 侦察 + 生产 30 天全面分析 + 48 小时工作项 | 进行中（后续会话续） |
| 09-30 | 01a0f175 | gold 全量标注首轮 82/118 + eval 根因诊断 | 中途停止 |
| 09-30 | 01a0f1fb | gold 严格重标 34/166（后续基线） | 完成 |
| 09-30→10-01 | 01a0f2a6→01a0f33e | 第一性原理：研究卡→降噪规格→实施+handoff（分叉主线） | 完成（handoff 交付） |
| 09-30 | 01a0f351 | 数据源优化深度咨询 | 失败会话（零产出，故障样本） |
| 10-01 | 01a0f7d8 | handoff 执行：W1T3 重标 + W1T4 提示词 + W2 基线 61.1%→67.6% | 延续至 10-06 |
| 10-07 | 01a1142a | 运行体检 + xiaoshi 评估 + 行情模块改造（设计+实施中断） | 中断 |
| 10-07 | 01a114de | 行情换源验收/部署 + litellm 停摆事故 + 两信源"假修" | 中断 |
| 10-07 | 01a11597 | 隧道统一 + litellm 退役，LLM 切 api.zero43.top/v1 | 完成 |
| 10-07 | 01a1163a | 推演飞轮方案 + Phase 0 部署 + Phase 1 开工 | 中断（T1.2 进行中） |
| 10-08 | 01a11941 | 进度检查①：Phase 0 从 git 事故抢救并部署（c180018） | Phase 0 已部署 |
| 10-08 | 01a11a31 | 交接分支（交接文件未落盘，摘要被复制进下会话） | 结束 |
| 10-08 | 01a11a36 | Phase 1 开工：T1.3 提交、off-by-one 与 node 日期 bug | 断线 |
| 10-08 | 01a11b69 | 进度检查③ + Phase 1 收口 218/218 部署 + recover-1 复活抢救 | 完成 |
| 10-09 | 01a11e81 | worktree 目录定论 + 清理（纯历史残留） | 完成 |
| 10-09 | 01a11ea0 | 进度检查④：G0 提前达成、修 4 回归、11:57 补部署 | 中断（18:00 幽灵事故） |
| 10-09 | 01a1205d | 进度检查⑤：T0.5 69%、缺数据定性、方案重建入库 756126c | 完成 |

**未归档（25，非 FinHot）**：LiteLLM/lllm（10）：01a0b98e 01a0bc11 01a0bcbf 01a0bce5 01a0bd6b 01a0bde1 01a0c1bb 01a0c3c5 01a0c3d3 01a0c800；VPS 内存分析（4）：01a0bcc1 01a0bdc6 01a0c7d8 01a0c865；dsh/web/杂项（4）：01a0bcaf 01a0bdb9 01a0d180 01a0c3c1；pi 工具链（6）：01a0cc42（v0.9.2）01a11416（v0.10.0）01a11e8d（v0.11.0）01a11b28（截断问）01a0eafa（magic-context 安装）01a0fcab（agent-harness）；其他项目（1）：01a0ce1d（liyuan）。另有本归档会话 01a120da（运行中未归档，结束后可在 pi-web 手动归档）。
**边界判定**：01a0f0e8 表面是 pi-web 通用问题，但起因与排查对象均为 FinHot 起源会话 → 纳入归档；01a11b28、01a11e8d 仅顺带提及 FinHot（系统提示/记忆）→ 未归档。

## 2. 分阶段会话摘要

### 2.1 起源阶段（09-30 上午）

#### 09-30 · 01a0f0e5 + 01a0f0f0 + 01a0f0f9 · 起源主线（AIHOT 分析 → 理财财经改造）
**分叉关系**：三文件共享同一首条用户消息（分析 AIHOT 项目、能否改成理财财经方向）。以 01a0f0e5（最长，1032 条消息）为主线；01a0f0f0 与其前 12 条 message id 完全一致、从第 13 条分叉（走"数据源接入验证"支线）；01a0f0f9 前 26 条与主线完全一致、从第 27 条分叉（走"竞品对比 + 数据源可行性验证"支线，三文件中消息最全）。三者是同一对话的三次分叉/重试，非三次独立工作。

**主线（01a0f0e5）用户请求时间线**（15 条用户消息）：
1. 分析 AIHOT 项目，看能否改造为理财财经方向
2. 不要改原来的代码，新建目录重新开发
3. 按你推荐的方向做（数据源换成财经方向）
4. 怎么让 LLM 调用走 Cloudflare 网关 / 为什么没走
5. 继续（数据源配置）
6. 现在能跑通吗，部署一下
7. 部署到 finhot.zero43.top
8. 继续优化数据源（加财经源）
9. 把 LLM 切到 stepfun 的 step-5-preview
10. 继续（跑通全流程）
11. 写一个 README 说明项目
12. 数据源质量不行，帮我找更高质量的财经数据源
13. 按新数据源改造
14. 部署 + 验证
15. 总结这次改造的关键决策

**关键产出与决策**：
- 确认 AIHOT（github.com/KKKKhazix/AIHOT）架构可复用：Next.js 前端 + Fastify 后端 + 多源采集 + LLM 评分精选
- 决策：**不 fork 原仓库**，新建 `/home/ubuntu/app/FinHot` 独立目录，保留 AIHOT 的采集/评分/推送骨架，替换数据源为财经向
- 数据源改造：从原 AIHOT 的科技/AI 源（HN、Reddit、Twitter 等）换成财经源（智通财经、东财、央行、统计局等），分 T1（权威：央行/统计局/证监会）、T1_5（准权威）、T2（媒体：智通/券商）三级
- LLM 路由决策：初版走 Cloudflare AI Gateway → 后改为直接调 stepfun 官方 API（step-5-preview），理由是网关多一层故障面且 AI Gateway 对国内 LLM 兼容性一般
- 域名：`finhot.zero43.top` 走 Cloudflare 隧道（cloudflared），与 litellm.zero43.top 同隧道多路由
- 部署：Docker Compose（web + worker + db + redis），web:3000 对外

**结束状态**：主线完成，README 已写，部署到 finhot.zero43.top 并验证跑通。改造方案（数据源三级分级、LLM 切 stepfun、独立目录）成为后续所有 FinHot 工作的基线。

**事故注意点**：① Cloudflare AI Gateway 对 stepfun 的 SSE 流式解析有 bug（chunk 边界截断 JSON），是后来直接调官方 API 的直接原因；② 初始数据源配置里 T1_5 级 13 个源全部零文章（key 未配/RSSHub 未部署），这个坑在 09-30 下午的 gold 标注会话（01a0f175）里才被发现并定性为基础设施缺口。

#### 09-30 · 01a0f0e8 · 会话截断横幅排查（起源会话的副作用）
- 用户请求时间线：09-30 14:34 问「为啥我的会话老是输出截断」→ 追问「能调大吗」→ 16:52「继续分析根因」
- 关键产出与决策：
  - 定位截断横幅来源 = pi-web 的 `maxTokens` 默认 65536 限制（非模型侧截断）：assistant 单次回复文本超限时 pi-web 前端显示"输出已截断"横幅，但 JSONL 里完整保留
  - 根因链：FinHot 起源会话（01a0f0f0 等）单轮回复经常 >64K tokens（大量表格+代码块）→ 触发横幅
  - 决策：不改全局 maxTokens（成本考虑），改为在长回复场景拆分成多轮；横幅本身无害（纯 UI 提示，不影响落盘）
- 结束状态：完成，结论记入本归档。该问题在后续 FinHot 会话（01a0f2a6 尾部空回复、01a1163a 工具输出撞 token 上限中断）反复出现，定性一致。
- 事故注意点：本会话的"深度分析"部分直接引用了 01a0f0f0 的 JSONL 做样本分析——它本身就是 FinHot 起源史的一部分。

### 2.2 标注与降噪阶段（09-30 下午 → 10-01）

#### 09-30 · 01a0f175 · gold 全量标注首轮执行（82/118）+ eval 报错根因诊断
- 用户请求时间线：16:37「阅读 FinHot/docs/gold-workflow.md，并进行标注」→ 16:55「继续」→ 16:58「不要启动太多的 subagent 了，继续」→ 17:58「标注处理完了吗」→ 18:02「降低并发并添加重试，帮我进行重新跑，对有问题的试点进行重新标注」
- 关键产出与决策：
  - 导出 200 条候选（30 天池 420 条、28 层，seed 20260930）；发现 T1_5=0——13 个 T1_5 信源全部零文章（pending MP key / X key / 自建 RSSHub），属基础设施缺口而非采样问题
  - 主 agent 亲自逐 chunk（4×50）标注，交付首版 `.data/gold.jsonl`：**82 select / 118 reject**（22 个 T1 源/93 个 T2 源）
  - eval 试点（50 条）42 条失败于模型输出解析（畸形 JSON/NaN）：根因是生产 `SCORE_MODEL=zero-flash`，而 `scoreCall()` 只对 `glm-5.3-flash-selection` 给特殊待遇（temp 1、180s 超时），zero-flash 落到默认 temp 0.2 + maxTokens 1024 → 输出被截断。这是本批次最重要的系统级发现
  - 按用户要求改并发 2 + 3 次退避重试重跑 eval（后台）；对问题批次逐条重标，确立「stale 回填」规则（数据月份早于 2026-07 且已被新数据取代 → reject；当月/上月数据按内容判）
- 结束状态：18:28 会话中途停止——stale 回填一致性审计刚发现 chunk-4 大批历史月报标签不一致，Batch 2 的翻转尚未全部落盘，033 的标签核对未完成
- 事故注意点：① 4 个并行标注 subagent 全部 429（共享 LLM 网关限流），用户随后明令限制 subagent 数量；② read 工具显示层损坏（chunk-4 第 31–36 行内容与文件实际不符）→ 对照 ground-truth 查出 18 条错标并修正；③ 自写 jq 过滤器作用域 bug（`S | contains(.)` 恒真）导致两次"验证"全部无效，靠负对照才发现；④ 容器内 `/app/.data` 不可写（USER node、无挂载），需加 bind mount；⑤ 导出文件带 3 行 `//` 注释头，文档假设纯 JSONL，裸 `wc -l`/jq 会误判

#### 09-30 · 01a0f1fb · gold 全量重标（严格版 34/166，成为后续基线）
- 用户请求时间线：19:02 粘贴完整标注员 brief（逐条判 `.data/gold-candidates.jsonl`，只看 material/sourceFacts，忽略系统预填 gold.decision，严格按读者口径只许 select|reject，输出 `.data/gold.jsonl`）→ 19:11「继续」
- 关键产出与决策：
  - 发现 17:59 已存在 82/118 版 gold → 备份至 `.data/backup-20260930-1736/` 后从零重标
  - 首轮 4 路并行标注 worker 再次全部 429 → 改**串行**（chunk-1 w5 11/39 → chunk-2 w6 9/41 → chunk-3 w7 7/43 → chunk-4 w8），brief 内嵌完整口径 + 前 chunk 先例保证松紧一致
  - 合并校验全过，最终 **34 select / 166 reject（17%）**：T1 层 121 条中 21 select、T2 层 79 条中 13 select；vs 系统预填（77/123）147 条一致、53 条翻转（73.5%）。这 34 条 select 即后来 W1T3 重标切片的来源
  - 明确「本轮整体比首版严（完全按 2026-07 拍板的读者标准）」，并建议下一步跑 eval
- 结束状态：20:05 正常收尾，gold.jsonl 已落盘（此后经 10-01 W1T3 变 29/171、10-02 再翻 055/073 变 **27/173**，即当前仓库 `.data/gold.jsonl` 实测状态）
- 事故注意点：① 4 路并行 429 与 175 会话完全重演（该教训当天已出现一次）；② w5 上下文 84% 饱和后不复用、开新 worker 带先例；③ 事后证明：纯子代理标注的 gold 仍偏松——34 条 select 里混入个股噪声（10-01 被 owner 逐条纠正 5 条）

#### 09-30 夜→10-01 · 01a0f2a6 → 01a0f33e（分叉）· 第一性原理优化：研究卡方案 → 精选降噪规格 → 实施与 handoff
- **分叉关系**：两文件前 50 条 message id 逐条相同、首条用户消息相同（第一性原理分析）；2a6 在第 51 条处终止——用户 00:55:16 问「研究解读升级，给出完整的方案」后 assistant 回复只有空内容（疑似输出截断/失败），会话实际停在 10-01 00:55；用户随即从同一历史分叉出新会话 33e，并于 00:56:46 重发细化版请求。**2a6 是 33e 的前身，33e 是唯一延续**（3370 条 vs 20934 条消息）
- 用户请求时间线：09-30 22:09 第一性原理分析 FinHot 如何更好指导投资 → 22:54「研究解读升级」→ 10-01 00:55「给出完整的方案」（2a6 到此，空回复终止）→ 00:56「方案1，研究解读升级：每个重要事件解读成事实/证据/影响链/受益受损对象/验证指标/风险与失效条件，给出完整方案」→ 01:04「信息源有问题：精选里混入大量小公司、低影响力个股」→ 05:10「继续，不要启动太多的 subagent」→ 06:53「开发的怎么样了」→ 07:10「哪些 subagent 还在跑，先压缩会话」→ 07:11「纠正」→ 14:21「我想另外启动一个会话进行开发，帮我生成 handoff」
- 关键产出与决策：
  - 第一性诊断：FinHot 擅长"筛选+热度聚合"，不擅长判断"该买什么"；三选一中用户选**方案 1 研究解读升级**（证据优先的投资研究卡；研究卡规格 `doc/specs/2026-09-30-investment-research-card.md` 已写入工作树，后延后到下一轮）
  - 针对信源投诉拉生产 30 天数据核实：48 条精选中 27%（13 条）是智通·港股 T2 单一公司/个股（希音-W 73 分等）；根因不在门槛（`industry/selection.ts` 按信源分级 {T1:42, T1_5:48, T2:55}，该源已在最严 T2 还漏）而在**评分提示词**把"单一公司+具体数字"当高注意力 → 用户拍板**先修精选降噪、研究卡延后**，方案 A = 提示词外科手术 + gold 重标定 + eval 门禁
  - 规格 `2026-09-30-selection-noise-suppression.md`（17:19 写出，17:36 经 recon 修订：重标切片收敛为全部 34 条 gold select，00:21 提交 `93a3cdc`）；夜间并行启动**模型评估框架** brainstorm（三能力：精选成熟/方向零评估/摘要零评估；`market_daily` 空表、cron 昨天才上线；owner 拍板：判断参照双轨、owner 全量自标、单池 30 天滚动月度刷新、方案 A 统一能力评估台 = selectbench_* 保留 + 新增 capbench_*），规格 `2026-10-01-model-evaluation-framework.md` 落盘；两份实施计划（降噪 8 task + 框架）通过 plan_check
  - 实施与纠错：基线任务发现规格前提错误（测试并非全红、门槛并非 env 覆盖）→ 06:53 提交 `82653c2`（错误诊断"env 覆盖缺口"）→ 07:11 用户「纠正」后回滚为正确诊断（门槛**硬编码** {42,48,55}、`analyze.test.ts:95` 断言 60 真红），删除误建测试文件，8/8 绿，提交 `f9d8813`
  - 14:22 生成 handoff 双份：根目录 `HANDOFF-selection-noise.md`（10 节，供新会话直接找）+ 工作树 `doc/handoff-2026-10-01-selection-noise.md`（196 行）；启动语写明：读 handoff 后从 **W1T3**（gold 34 行切片 + 1 个 fixer subagent 串行重标 + 合并校验）继续，工作树 `/home/ubuntu/app/FinHot/.worktrees/finhot-investment-analysis`，HEAD 应为 `f9d8813`
- 结束状态：10-01 22:22 正常收尾（handoff 已交付，降噪 W1T1/T2 完成、W1T3 起待新会话执行；研究卡与评估框架规格/计划已入库未实施）
- 事故注意点：① 2a6 尾部空回复导致必须分叉重开（用户体感 = 会话"卡死"）；② w4 侦察 subagent 跑了 50 分钟未收口被手动取消，之后用户限定 subagent 数量；③ fixer 报告出现"沙箱疑似重置"（52 分钟时间缺口、commit hash 被改写），导致状态核对一度混乱；④ 门槛来源被连续误判两轮（env 覆盖论 → 硬编码事实），靠"纠正"轮才落定；⑤ round 0 前 eval 存在 33 条网关 JSON 解析错误（zero-flash 截断问题的延续）

#### 10-01 · 01a0f351 · 数据源优化深度咨询（死胡同，无产出）
- 用户请求时间线：01:16「看看这个项目，帮我深度分析，可以如何优化数据源」——同一请求 3 次重发（01:16:19 / 01:16:41 / 01:19:32）
- 关键产出与决策：无。全部 9 条 assistant 消息 content 均为空数组（无文本、无 toolCall 落盘），期间换了 3 次模型（gpt-6-astra → glm-5.2-deep-research → gemini-3.8-flash），01:20 会话即止
- 结束状态：未回答、无文件产出；数据源问题实际由 33e 主线（01:04 投诉 → 30 天数据核实）承接
- 事故注意点：该文件可作为"模型输出未落盘"故障样本——用户连发 3 次相同问题 + 换 3 次模型均无可见回复，归档时注意这不是正常短会话而是失败会话

#### 10-01 · 01a0f7d8 · handoff 执行：W1T3 gold 重标 → W1T4 提示词 → W2 基线与 Round 1（会话后延至 10-06）
- 用户请求时间线：22:22 启动语（读 `HANDOFF-selection-noise.md`，从 W1T3 继续：gold 34 行切片 + 1 fixer 串行重标 + 合并校验，工作树、HEAD f9d8813）→ 22:55「继续」→ 23:24「继续」→ 23:54「继续 W1T4」→ 16:46「继续 W2」【10-01 窗口内】→ 10-02 起「修复的怎么样了/现在运行的怎么样了/运行的怎样了」→ 10-06「检查运行问题」「先对 2 和 4 进行修复」（超本批次窗口，仅备查）
- 关键产出与决策（10-01 部分）：
  - **W1T3**（22:23–23:29）：34 条 select 切片至 `.data/strict-review-20260930.jsonl`（分布：智通·港股 7、券商研报 5、统计局 20、央行 2）→ 1 个 fixer 串行重标得 **29 select / 5 reject**，翻转的恰是规格点名的 5 条噪声行（export-020/044/048/065/100）→ 合并后 gold = **29/171**，非 gold 字段逐字节保留；顺带修 `docs/gold-workflow.md`（附录写入 2026-09-30 单一公司/个股行情口径 + 修 §2.3 裸 `wc -l` 校验），提交 `efaa598`
  - **W1T4**（23:54–16:40）：`selection-score.md` 三处逐字编辑（噪声区新增"单一公司与个股行情"上限+两条例外、海外日常新闻补港股 ADR/H 口径、机会型披露限重点板块），版本哈希自动更新；测试 145/145 全绿后分两提交：`95c507f`（提示词）+ `3d951cc`（修 `default-model.test.ts` 方向步漂移——方向调用 receipt 逻辑键不含 subject 导致首跑必挂、复跑过的 flaky）
  - **W2T5**（16:46–21:12）：Round 0 基线（旧 prompt `selection-score@5c5a429baa` × 新 strict gold，200 案，92 分钟）：**accuracy 61.1%**（167 条可裁决，33 条网关 JSON 错误），入选率 51.5% vs gold 13.8%，FP=64 → 部署新 prompt 镜像（3 服务）跑 Round 1：**67.6%**；剩余 FP 集中于央行/统计局例行宏观数据（提示词把权威信源打高）；确认 strict gold 隐含规则 = "核心月度运行数据必选、其他例行数据仅拐点选"；发现 `bodyZh` 为空、正文在 `bodyOriginal`
- 结束状态：10-01 21:12 当日工作停在 Round 1 FP 归因（bodyOriginal 复查）；会话实际延续：10-02 owner 拍板 Option A（gold 055/073 翻 reject → **27/173** 即当前值）、Round 2 = 65.4%（新规则被提示词自身"央行=最高价值锚点"条款压制）、Round 3 = 64.4%（10-03 凌晨）触发 3 轮上限；10-06 发现管道 10-01→10-04 近乎停摆，根因是**网关 p50 延迟 10s→150s（15 倍）自 10-01 起**，且 worker 当时跑的还是 r2 而非 r3 镜像
- 事故注意点：① 测试库 `finhot_ci` 积 6,929 条卡死的 `new` 文章（测试污染）致 alerts 测试只在全新库上能过；② 自命令 `| head -30` 以 SIGPIPE 杀掉 migrate（停在 0034，缺 `x_article`），造成 40 条假失败；③ 既有 flaky 测试（方向步第 6 次模型调用）被误判为新改动引入，靠 stash 隔离证明；④ eval 与生产 worker 共享 LLM 网关互相拖慢（~35 案/小时）；⑤ 3 轮提示词迭代 61.1%→67.6%→65.4%→64.4%，距 90% 验收线仍远——"锚点条款 vs 例行数据规则"的提示词内部冲突是未解主矛盾

### 2.3 运维与方案阶段（2026-10-07）

#### 10-07 · 01a1142a · 运行状态全面体检 + xiaoshi 数据源评估与行情模块改造（中途断）
- 用户请求时间线：02:21 @FinHot/ 分析项目运行状态，看有什么问题 → 02:29 找其他免费数据源，评估 /bin/xiaoshi-data 是否可用 → 02:49 继续 → 03:09 直接开始改造并做数据核对校验 → 03:33 开始
- 关键产出与决策：
  - 体检结论：**骨架健康**（容器 10-02 重建后 0 重启、24 个 cron 准点、无积压、LLM p50 从 146s 回落到 ~25s），但有 3 个真问题：① **market_daily 历史 0 行——板块收盘模块"从未成功过"**，根因 push2.eastmoney.com ulist 502，job 每天 written=0 静默失败；② **约 44% 入选文章分析失败**（prefilter 枚举越界 220 条/无 JSON 122 条/残缺 ~35 条/401×3，其中 zero-flash 组 3 个上游 key 有 1 个坏）；③ 4 个老病源数周未修（深交所公告 fetch failed 从未成功 38 次、智通 500、东财融字段映射错、Federal Register items path 错）
  - xiaoshi 评估：有 A 股日线（cn-daily 2020→09-30、2400 万行）+ 成分股快照（8 周仅 16 个快照日，极不规则），**无板块/指数行情**；纠正误判（10-01~10-07 国庆休市，09-30 即最后交易日，xiaoshi 数据其实是新鲜的）；挖到更合适的免费源 **腾讯 ifzq**（申万一级 31 行业 + 概念板，含 5/20/60 日收益与资金流）
  - **BK 代码审计：18 个只有 4 个对、14 个错配**（如"白酒"用的 BK0478 实为有色金属），全部用东财 searchapi 重核（贵金属→BK0732、农林牧渔→BK0433、国防军工→BK1204、汽车→BK1211）
  - 改造方案落 `.agents/plans/`（待确认）：新模块 `market/tencent.ts`（4 请求/日）+ 三级回退（tencent → 东财 push2his → push2 ulist）+ `syncMarketDaily` 重写 + 共享 upsert + 60 日回补 + xiaoshi 交叉校验
  - 实施与核验（中断前完成）：typecheck 首次全绿（基线本来是红的）；market 测试 25/25→93/93；宣称回补生产 840 行（42 交易日×20）840/840 校验通过；xiaoshi 交叉 PASS（18 交易日 356 组，中位偏差 0.39pp）；发现告警 `market.daily-missing` 节假日盲区
- 结束状态：**中断（05:27，无收尾）**——正在排查"14:15 手动触发的 market.daily job 卡 10+ 分钟，串行 job runner 被堵、ops.alerts 全部排队"，worker/DB 活跃查询未查完
- 事故注意点：
  - **数据口径矛盾（重要）**：本会话称已回补生产 840 行，但 01a114de 次日流程报"首次写入"且仅 146 行、01a1163a 12:36 活库实查确认板块历史仅 1 天（09-30）——840 行可能写错库或被后续容器重建冲掉（后续 10-09 经 backfill-market.ts 重新回补至 07-02 起 66 交易日，见记忆 #35⑥，本矛盾视为已解决但当时过程存疑）
  - 发现并行会话在同仓库开发同一 feature（f3d0e7a/d2d54a4 合并，其 581 行实现取代本会话版本），最终基于合并树继续
  - 生产 DB 存在间歇性写入卡顿：单行 upsert 实测 60s/98s（其余 ~8ms），是测试 flaky 根因
  - 环境坑：默认 PATH node 是 v12（须切 v22）；`node_modules/@aihot/backend` 曾是 09-30 的真实目录旧拷贝（非软链）导致测试解析错乱；db 容器 IP 当日 .4→.5 漂移

#### 10-07 · 01a114de · 行情模块改造落地/验收/部署 + litellm 停摆事故 + 两信源"假修"bug（中途断）
- 用户请求时间线：05:38 @FinHot/ 继续开发（附改造方案确认 + BK 审计结果与映射取舍）→ 05:54 确认开工 → 08:56 当前改动是否已全部提交并推送 GitHub？ → 09:15 交接文档呢？ → 09:57 哪一个是还没完成的 → 09:59 帮我再跑一下 → 10:31 现在没有可以优化的地方了吗？ → 10:51 现在进行排查
- 关键产出与决策：
  - 动手前独立复核：10 个改动 BK 码逐个打东财 searchapi 10/10 通过、腾讯侧 18 个板块名活 API 确认——映射不改
  - 修 4 个 bug：`tencent.ts:218` fromTencent 漏 return；**postgres.js 把 date 列解成 Date 对象，字符串比较走 NaN → skip 永不触发（同一天反复重写）**，归一字符串比较 + 回归测试；回补脚本无 `process.exit`（挂 10:02 → 1.2s）；xiaoshi 校验脚本 `stock_code`→`symbol`（parquet schema 变更）
  - 验收全过（10-07 休市日）：测试 166/169（3 个为存量红）；链一致性 5d/20d 最大偏差 0.014/0.032pp；双端点比对 0 偏差；xiaoshi 18/18 板块中位 0.39pp；容器内 `--sync` 休市 skip 1.9s
  - 部署：main 两 commit `a058488`+`aa766a8` 并重建镜像；推送 GitHub（含 `896245b`）；**新建交接文档 `HANDOFF-market-source.md`（`cfe5f4c`，已提交推送）**
  - 数据现状：market_daily 146 行（09-30 的 20 个板块行 + 指数 07-02~09-30 约 120 行）；**板块 60 日历史回补被 push2his TLS 层整 IP 硬封卡住**（编号 CDN 子域全封，脚本安全检查中止、不写脏数据）
  - 事故处置：litellm-a 又被显式 stop（19:01 本地，137）→ **内容流水线停摆 39 分钟、96 篇积压**，拉起后恢复；发现 memory 里"看门狗已加固"是**虚记**（实际从未落盘）→ 真装 `/usr/local/bin/litellm-watchdog.sh` + cron `*/5` 并跑通验证
  - 修 2 个"10-01 复查标记已修但实际还在失败"的信源：**深交所公告**——DB 配置是远古 seed 化石，字段 `body` 应为 `bodyJson`（POST 无 body → 远端 500），修 `industry/sources.json` + DB；**东财融资融券**——接口实为每日全市场汇总（无个股字段），映射方向整个错了，改 RZRQ 映射（DIM_DATE）
- 结束状态：**中断（11:25，无收尾）**——排查"DB 里两个源 config 反复被翻回旧值"时抓到真凶：**一个 psql 会话（pid 629，09:27 起挂着，来自 172.24.0.2 即 gpt-load 容器网络命名空间），其最后语句就是改 szse 的 UPDATE——有外部/并行会话在持续改这两个源的配置**，未查结
- 事故注意点：
  - 当日宿主/容器多次重建导致 db IP .4↔.5 漂移，硬编码 IP 全部失效（容器内用 `db` 服务名不受影响，宿主侧须 `docker inspect` 取 IP）
  - litellm 反复被显式 stop（137）是当日内容流水线两次停摆的根因；"加固完成"写进 memory 但未落盘 = 教训（加固动作必须当场验证落盘）
  - 并行会话互踩证据：package.json/db.ts/sources.json 出现内容未变但 mtime 更新、DB config 被周期性回写（与 01a11597 的 .env 被并行会话改写、01a1163a 的 git 树损坏相互印证）
  - 遗留：3 个存量测试红（analyze 阈值漂移×2、alerts recovery×1）未动

#### 10-07 · 01a11597 · 基础设施：隧道两实例统一为一 + litellm 网关完全退役，FinHot LLM 切到 api.zero43.top/v1（step-5-preview）
- 用户请求时间线：08:59 更新 cf cli → 09:11 更新知识库 → 09:14 cloudflared 是干啥用的 → 09:18 为啥搞 2 个实例，是不是统一为一个？ → 09:55 litellm.zero43.top 这个服务我要关闭的 → 11:08 LLM 切换为 base https://api.zero43.top/v1 + key sk-gl-27bf… + model step-5-preview，完全移除停用 litellm → 11:16 模型切换后 FinHot 跑起来了吗 → 11:24 选"1"（盯一会 429）
- 关键产出与决策（切换前后状态）：
  - **切换前**：FinHot 走本机 litellm.zero43.top（cloudflared 隧道 → nginx:80 → litellm-a:4000，zero-flash 组，其首选本来就是 stepfun 的 step-5-preview）；cloudflared 两实例并存（宿主 dsh-web 隧道 + litellm-tunnel 容器）
  - cloudflared 2026.9.1→2026.10.0（宿主 .deb 覆盖安装 + `dsh-cloudflared.service` 重启）；装 **cf**（Cloudflare 新官方 agentic CLI）v1.0.0-beta.12（Node 22），OAuth 设备流认证
  - **隧道统一（执行完毕）**：2 实例的技术根因是 litellm-tunnel 容器须同挂两个 compose 网络才能按服务名解析 nginx:80/web:3000；方案 = 宿主 dsh-web 隧道加 finhot→127.0.0.1:3000、litellm→nginx:80 两条路由，5 个域名 CNAME 切换并公网验证 → 删 litellm-tunnel 容器 + CF 侧删旧 `litellm` 隧道；**`gpt-load` 隧道在另一台机器（23.95.170.17）承载 api.zero43.top，本机不动**
  - 中途发现并处理：litellm-a 已 Exited(137) 3 小时（14:00 本地被显式 stop，后确认为用户本人操作）→ nginx 上游不可达、整网关 502；拉起后全链路 200（zero-flash 真实出 token）
  - **切换后（按 11:08 指示执行并验证）**：先实测 api.zero43.top/v1（可用、含 thinking 参数）→ FinHot `.env` 改 base `https://api.zero43.top/v1` + step-5-preview + 新 key（旧值备份 `.env.bak-litellm-*`）→ `up -d` 重建（restart 不重读 env_file）→ **完全移除 litellm 栈**（备份后删 `/opt/litellm`，含其 postgres 数据；1Panel 的 ai-gateway 注册项须在其 UI 卸载 = 遗留）→ 删隧道 ingress 与 litellm CNAME → 全链路绿
  - **验证结论**：4 容器健康、web 200、worker 日志 0 报错、流水线持续消化队列；429 在 19:11–19:25 本地（11:11–11:25 UTC）密集（峰值 13 条）后 25 分钟清零 = 瞬时、自愈；39 分钟完成率 78%
- 结束状态：**正常收尾（11:51）**——知识库 #20 拓扑、#21 改写为 litellm 退役记录、#22 记录 429 额度 + 并行会话风险（含复查 SQL）
- 事故注意点：
  - **跨会话改动**：`.env` mtime 19:09:54 UTC 非本会话写入——另一并行会话也在改 FinHot LLM 配置并于 19:11 UTC 重建了容器；19 点档回执 69 条 41 成功/28 失败（59%），失败集中在 step-5-preview 429
  - litellm-a 当日两次被显式 stop（137）：14:00 本地（用户本人）、19:01 本地（嫌疑 1Panel/手动）——`unless-stopped` 对显式 stop 不自动拉起，所以第一次挂了 3 小时无人管；本会话 09:31 UTC 加过看门狗 cron，09:56 UTC 因用户决定整体退役而撤掉
  - 1Panel ai-gateway 应用注册未卸载（需在 1Panel UI 操作）
  - api.zero43.top（另一台机器的 LiteLLM 网关）有 429 限流窗口，当日自愈，复查 SQL 已存记忆 #22

#### 10-07 · 01a1163a · 第一性原理推演优化 → 「推演飞轮升级方案」→ Phase 0 开发部署（Phase 1 进行中中断）
- 用户请求时间线：11:58 以信息推演/多角度推荐/相关性信息为第一性原理，看项目有哪些可优化 → 12:19 上面的分析能否构成完整数据流闭环、形成数据飞轮不断升级？ → 12:33 对抗性分析推演，形成完整可落地的升级方案（后续要开发） → 13:15 按建议全部 yes，依次开发 → 14:46 继续分批开发，启动 subagent（一次一个）直到全部开发完，并核对和 CR
- 关键产出与决策：
  - 3 个并行 explorer 完成项目地图 → P0–P3 优化建议；oracle 红队压测判词：**P0–P3 只闭合"测量环"，未闭合"学习环"**
  - 对抗性推演量化三个关键事实并实质改方案：① 冷启动比想象更硬（板块历史仅 1 天、direction 标签 38 条/5 日、首批 T+5 结果 10-15 才有、60 交易日历史 ~1 月中旬、基率统计意义在 12 月）→ 三期时间线：埋点期(10月)→积累期(11–12月)→学习期(1月+)，前两月不承诺"自动变聪明"；② 反事实成本 +11%（已打分 ~136 篇/日）→ **decision：direction 覆盖全部已打分文章** + 历史一次性回填；③ 板块历史回补大概率不可行（push2his 封 IP）→ 改道：腾讯 rank 行内 zdf_d5/d20/d60 + zljlr 零额外请求逐日沉淀，回测基线回退 benchIndex（指数有 60 天）→ 回测第一天就能跑
  - 方案落盘 **`.agents/plans/FinHot-推演飞轮升级方案.md`**（draft→批准）：迁移 0040/0041/0042（prediction_ledger 含反事实 + t0 冻结快照、market_daily 资金流/多周期列、基率/校准/参数三表）；T0/T+N 防泄漏对齐、惯性 baseline、分层收缩基率 k=50、去重单元；**6 道 No-Go 门**（12 月先验注入若无 OOT 正 lift → M3 不接线，降级为"测量+案例记忆"）；10 条护栏（把本仓库踩过的坑编码为强制项：红测试 :95、date OID、process.exit、litellm 429、IP 漂移）
  - 5 个拍板项全部 YES：direction 全量化（+11% LLM）、用户面只暴露 selected（反事实台账纯内部）、M3 前 6 个月人工审批 + 阈值配置化、baseline 板块行优先/缺失回退 benchIndex、embedding 类比后置 Phase 3
  - **Phase 0 完成并部署（main @ `67c38f4`）**：T0.1 红测试修复（断言 60→42）；T0.2 迁移 0040；T0.3 行情增强（zljlr/zdf_d5/d20/d60 解析入 market_daily，tencent 29/29）；T0.4 direction 全量化 + 同事务台账（闸门 `score !== null`、prompt v2 中性化、analyze 8/8）；T0.5 **历史回填 1432/1432、0 失败**（t0 覆盖 09-29→10-08，67 篇 published）；T0.6 T+N 标注作业 cron `10 16 * * 1-5`；全量测试 181/182（唯一红 = alerts 存量网络红）
  - 飞轮 M1 台账通电：prediction_ledger 1435 行带 t0 快照，测量环输入端自 10-07 起自动积累；开市后 **15:35 G0 门**（market.daily 生产首跑 20 板块+2 指数、新列首填）+ 16:10 label-outcomes 首标
  - Phase 1（subagent 串行）：T1.1 用户面暴露 direction/scope 完成（184/185，重新部署）；T1.2 回测脚本进行中
- 结束状态：**中断（15:38，工具输出撞 token 上限、bash 参数被截断）**——T1.2 `scripts/backtest.ts` 开发中，`tests/backtest.test.ts` 写入在 ~4.5KB 处截断；T1.3/T1.4/T1.5 未开始；G0 门验证排在 10-09
- 事故注意点（当日最密集）：
  - **3 起 git 树损坏**：① commit 与并行会话并发 index 写碰撞 → 38/1717 文件的损坏 commit，从 cfe5f4c 重建；② main 被并行会话 AMEND 成 497 文件树（丢 1222 文件含 0040），从 c7c2eae 恢复 + 重新部署；③ 恢复中 worktree commit 再次碰撞。对策固化为：worktree 隔离 + ff-only 合并 + 树完整性校验
  - **生产 analyze 路径宕机**：`export export const` 双重写入的语法错误被提交部署（worker 进程健康但 analyze 静默失败）→ hotfix + 重新部署恢复
  - subagent 静默丢失 2 次：w11 改完代码未提交即消失、w12 8 分钟死亡零产出 → 改为主会话直接实现；教训 = subagent 产出必须逐文件事后核验
  - worktree 共享 node_modules 会把 `@aihot/*` 解析到主 checkout 旧代码 → `cp -al` 独立副本
  - 发现生产隐藏行为：score 全 null 时走 LLM_DOWN fail-open（selected=true）→ 已入方案备注
  - 休市后首个交易日本会话记 10-09（腾讯 K 线核验），01a114de 早前写 10-08，两处口径略有出入，G0 门以 10-09 15:35/16:10 为准

### 2.4 进度检查与收口阶段（2026-10-08 → 10-09）

**进度增量链（一眼版）**
1. 检查①（10-08 上午）：Phase 0 约做一半、一半增量在 10-07 晚并行会话 git 事故中丢失 → 同会话内从生产 Docker 镜像救回 630 文件树 + 重写 T0.4，步骤 1–4 全部完成并部署（main `c180018`，0040 上生产）
2. （10-08 午后）Phase 1 开工：T1.3 提交；发现 labeler T+N off-by-one + 本地 node V8 日期 bug；会话中途断线
3. （10-08 夜）Phase 1 收口：修 4 个真 bug，218/218 全绿，部署生产（main `5e8643b`）；worktree 目录成因首次解释
4. 检查④（10-09 上午）：**G0 提前达成**（10-08 实为交易日，方案误判假期）；Phase 1 代码在 main 但未部署 → 当会话修 4 回归、206/206、11:57 部署；T0.5 回填 1645 条启动；东财 WAF 封板块历史回补，排除各备路后决定跳过（labeler 有指数基准回退）
5. 检查⑤（10-09 晚）：T0.5 回填 69%（ETA 次日凌晨）；真正缺的只有 T+5 未来收盘价，首份正式报告可提前到 10-13（周一）；方案文件重建+状态标记+提交仓库（`756126c`）

#### 10-08 · 01a11941 · 进度检查①：发现 10-07 事故丢失一半 Phase 0，当场抢救并部署
- 用户请求时间线：看方案开发进度（02:04）→ 按步骤 1–4 依次开发（02:13）→ 停止（05:45，停 finhot-recover-1 容器）→ 之前的开发任务开发完了么？（05:47）→ 直接开始 Phase 1（06:06）
- 关键产出与决策：
  - 状态报告（相对上次=基线）：Phase 0 做约一半，一半增量在 10-07 晚并行会话 git 事故丢失（迁移 0040 被 amend 吞掉、git 任何历史均无；生产库无 `prediction_ledger` 表；生产容器还是事故前镜像）；Phase 1 未动工（仅建分支）；10-09 G0 门当时"必挂"
  - 纠错：「main 树仅 497 文件=损坏」是误判（memory #23 基线错误，应用代码其实齐全），真实丢失仅 0040 + T0.4 代码
  - 恢复决策：origin 是 GitHub 私有 fork 且 ref 已污染 → 唯一完整源码=生产 Docker 镜像（1265 文件）；镜像导出 705 文件覆盖恢复 + 从 git 对象叠回 phase0 增量 + 补 0040
  - T0.4 重写：闸门 `out.score !== null`（入选+反事实都预测）、PROMPT_VERSIONS、direction receipt 入 receiptIds、台账同事务写入、directions.md 去「精选」措辞；analyze-ledger.test.ts 10/10
  - 步骤 1–4 全部完成（05:34 报告）：630 文件树恢复、T0.4 上线、0040 上生产（ledger 表+market_daily 4 新列+41 迁移）、重建部署（容器内代码验证 4/4），main=`c180018`
- 结束状态：Phase 0 已部署；用户说"直接开始 Phase 1"后会话在写 `market/backtest.ts` 核心库中途断掉（06:19 末行为半截工具调用，未回答该请求）
- 事故注意点：并行恢复容器 `finhot-recover-1`（root、挂载 /home/ubuntu/app、做同样的恢复，其恢复版 analyze.ts 缺 PROMPT_VERSIONS 部署后会 ReferenceError）；它曾 15:23 reset main 回旧树、drop 重建 finhot_ci、裸 docker run 重建 DB 容器丢 5432 端口映射（`docker compose up -d db` 恢复，45GB 数据无损）；经用户确认停止

#### 10-08 · 01a11a31 · 交接分支：从 01a11941 分叉，用户要交接文件（未写完即结束）
- **关系**：01a11941 的分支会话（共享历史至 05:48「分两层回答」节点，分叉点不含"直接开始 Phase 1"那段）
- 用户请求时间线：共享前 4 条同上 → 分叉后仅 1 条：将上面未完成的任务总结为交接文件，我将启动另外一个会话进行开发（06:27）
- 关键产出与决策：分叉点前 assistant 已给出「分两层回答」终版状态：今天步骤 1–4 全部完成；整个方案 **Phase 0 完成、Phase 1 未动工**（分支 `phase1-visible-measurable` 空着，`/tmp/finhot-recover/scripts/backtest.ts` 有未完成草稿可参考）、Phase 2 计划 11 月、Phase 3 计划 12 月起
- 结束状态：assistant 开始为交接文件核对事实（commit cf9329e、0040 schema、方案全文）时会话结束（06:29）——**交接文件并未落盘**；实际"交接"=上面这段 Phase 0–3 摘要，用户直接复制粘贴进了下一个会话（01a11a36 的首条消息）
- 事故注意点：无新增（finhot-recover-1 处置见 01a11941）

#### 10-08 · 01a11a36 · Phase 1 开工：派 worker 反复死亡，T1.3 提交后会话断线
- 用户请求时间线：粘贴 Phase 0 完成/Phase 1 未动工摘要 + "现在开始进行 Phase 1 的开发"（06:32）→ 开始开发（06:55，批准计划）→ 开发完了么？（09:32，未获回答）
- 关键产出与决策：
  - 开工前核实：Phase 0 已上生产（main cf9329e），ledger 已有 4 行；**发现 labeler T+N 口径 off-by-one**（与方案示例矛盾，会整体错标一个交易日，未跑过→可安全修）
  - 产出 Phase 1 执行计划 `.agents/plans/2026-10-08T06-45-00-533Z-finhot-phase-1-m1.md`（T1.0–T1.5 三 lane）
  - 三 lane 并行（explorer T1.1 侦察 / fixer T1.3 direction v2 / fixer T1.0+T1.2）：两个 fixer 反复撞 context 上限/provider 流错误死亡 → 主控直接接管；T1.3 提交至 `phase1-visible-measurable`（FinHot-phase0 worktree）
  - 测试混乱根因链：finhot_ci 被 receipt 回放污染（旧库 IN(NULL) 不报错造成时好时坏）、phase0 worktree 停在旧 commit c180018、死 worker 遗留 2 个孤儿全量测试进程
  - **本地 nvm node v22.22.0 V8 字符串日期解析损坏**（子进程内 `new Date("1971-01-01T04:00:00Z")` 偏 +8 天；生产 v22.14.0 正常）→ 决定 labeler 改纯算术 `D()`（不依赖原生字符串解析，环境免疫）
- 结束状态：会话 10:55 中途断线：Lane B 进行中（T1.0 labeler off-by-one 已定位 `market/ledger.ts:25`、`scripts/backtest.ts` 16KB 已写但测试未建、留 326B 调试探针 `tests/dtprobe.test.ts`），main 仍 cf9329e 未集成
- 事故注意点：worker 委派不稳定（2 轮委派烧 75 分钟零产出）；从 Docker 15:30 快照恢复 0040 文件（md5 与生产 schema_migrations 一致）

#### 10-08 · 01a11b69 · 进度检查③ + Phase 1 收口：218/218 部署，finhot-recover-1 半夜复活被救回
- 用户请求时间线：看方案进度 + **为啥新建这么多 finhot-xx 目录**（12:08，唯一一条；答完后开发自动续推至深夜，10-09 02:22 结束）
- 关键产出与决策：
  - 进度增量（相对上次）：Phase 0 ✅ 已部署（main cf9329e）；Phase 1 约 60–70% 卡集成前——T1.0 已提交（`1fd3f20`）、T1.3 写完未提交、T1.1 做一半（仅 publications 行）、T1.2 脚本写完测试未建
  - **worktree 目录成因（用户所问）**：FinHot-xx 全是 git worktree（同仓库多工作目录钉不同分支）；成因=项目铁律"开发一律在独立 worktree"（防并行会话动主树）+ Phase 1 计划并行 lane；`FinHot-phase0` 名字是 phase0 时期残留，实际挂的是 **phase1 分支**——因 finhot-recover-1 事故把 worktree+分支全删、从悬空 commit 重建时没改名；`FinHot-t04` 已完成可删、`.worktrees/finhot-investment-analysis` 是 10-02 旧特性（无关飞轮）、`/tmp/finhot-*` 临时可清
  - 续推完成：提交 T1.3（`22585da`）→ 派 worker 补 T1.1/T1.2（再次死亡，主控接管）→ T1.1 全链提交（`0c9b39a`）→ T1.2 写 15 用例测试 → 集成合并（502 文件、38 迁移无冲突）→ 修 **0040 内嵌 BEGIN/COMMIT+自插迁移行**（fresh 库 migrate 必炸 duplicate key 的最大元凶）→ 修 **postgres.js `IN(${array})` 恒炸**（须 `= ANY`）→ 218/218 全绿 → 部署生产
  - 终版报告：Phase 1 开发完成、已部署（main `5e8643b` + 并行会话 `0e49b4a` + 2034 年份修复），生产库 0041（horizon/confidence 列+3 张 M2/M3 表，38/38 迁移）；4 个真 bug 修复清单；清理 21 个调试库 + finhot_prod2 3.2GB 事故克隆
- 结束状态：完成收尾，"明天（10-09）16:10 看 labeler 回填+新台账行 horizon/confidence+推送/web 出现『方向：利好 · 板块：xxx』"
- 事故注意点：
  - **finhot-recover-1 容器 23:1x 复活**（10-08 已停的那个又被启动）：删 2 个 worktree、删分支、`git reset --hard` 主 checkout 回旧树、`git gc --prune=now`、删生产镜像；抢救=对象全在（gc 没跑到），从悬空 commit 重建 4 分支+2 worktree，未提交修复靠上下文重放；23:54 容器被 `docker rm` 消失——**assistant 当场问"这个移除是你做的吗？如果不是值得查"**（无后续会话确认）
  - 良性并行会话：23:0x 修了 committed 0040 缺 4 个行情列（与生产 schema 漂移）+测试隔离，提交 `0e49b4a` 在合并之上无冲突
  - 0041 曾意外提交到生产库（两 psql 进程不同连接）——纯增量无害，已补 bookkeeping 行

#### 10-09 · 01a11e81 · worktree 目录定论：全部已合并，清理完毕
- 用户请求时间线：FinHot/FinHot-phase0/FinHot-phase1 为啥有这么多类似目录（02:32）→ 合并分支，并删除已开发完成的
- 关键产出与决策：
  - 定论：同一仓库的多个 git worktree 钉不同分支（FinHot=main 9fd11a5 / FinHot-phase0=phase1-visible-measurable / FinHot-phase1=phase1-wip / 嵌套 .worktrees/finhot-investment-analysis）；名字是 recover-1 事故后重建未改名的历史残留；**两个 phase 分支 0 个未合并 commit、工作区全干净，纯重建后忘了清理**
  - 执行清理：无需合并（`t04-ledger` 逐行比对确认内容已全部在 main，按废弃 `-D`）；删 worktree FinHot-phase0/FinHot-phase1 + 分支 phase0-ledger、t04-tests、phase1、phase1-visible-measurable、phase1-wip、t04-ledger；保留 main + finhot-investment-analysis（9 个未合并 commit，精选提示词/评估框架另一条线，开发中勿动）；动 git 前照例查 finhot-recover 容器（已不存在）；布局记入项目记忆 #31
- 结束状态：完成，`/home/ubuntu/app` 下只剩一个 FinHot 目录（+ FinHot-phase2 为后续新 worktree）
- 事故注意点：无新增

#### 10-09 · 01a11ea0 · 进度检查④：G0 提前达成，补部署 Phase 1，东财 WAF 封锁后决定跳过
- 用户请求时间线：看方案进度（03:06）→ 同问重复两次要"现状和后续计划"（03:09/03:10）→ 到底是什么玩意一直限制了，可否跳过/其他路径（07:59）→ 全网搜索其他数据途径（08:27）→ xiaoshi 数据能否获取（08:49）→ 可否先跳过、先做其他开发（09:43）
- 关键产出与决策：
  - 进度增量（相对上次）：**G0 实际提前达成**——10-08 是真实交易日（方案误判为假期），10-08 15:35 market.daily 已写 20 行、板块新列 18/18 填满；台账 368 行在写（none 77%/bullish 17%/bearish 5%/neutral 1%）；**Phase 1 代码全在 main（9fd11a5）但生产跑的还是 T0.4 时期镜像**（0041 已手工上库=DB 领先代码）；T0.5 历史回填未跑；51 行被旧 labeler 误标终态 skipped 需重置；硬期限 10-12 16:10 前必须部署（否则 T+1 口径错标）
  - 当日 P0 执行：部署前验证抓到 **main 上 4 个真回归**（ff55385 修复：directions.md「精选」措辞其实从未修掉/空标题 direction 兜底/default-model stub 缺 direction 分支/3 测试泄漏 pending 台账行→全量时绿时红根源）→ 206/206 全绿+typecheck → 11:57 部署（镜像 3b1371d）→ 51 行 skipped 重置 pending
  - T0.5 回填：`backfill-direction.ts` 重写适配 v2（horizon/confidence），1645 条目标后台运行（~10% 网关超时）
  - 数据封锁定论：**push2his.eastmoney.com WAF 两层**——TLS 指纹封 node/undici 客户端（curl 能过）+ ~60 请求触发 IP 级封禁（24h~几天不可控）；备路实测：腾讯 pt 码只回 1 根 bar（死路）、东财镜像域名/80 端口同封、新浪板块分类体系不同需重映射、**stockapi.com.cn 可行**（文档支持东财 BK 码，唯一可用备路）、**xiaoshi/小石数据域名已无 DNS 记录（整个没了，本机 key 还在但无用）**
  - 决策：板块历史回补**先跳过**——labeler 有设计内回退（板块缺行→benchIndex，21 板块基准全是 sh000001/sh000300 两指数且 63 个交易日历史已补齐），baseline_ref 诚实记录；损失仅 11 月 M1 基率研究少 7–9 月板块级历史，解封后补跑即可；15:35/16:10 两观察点通过
  - 用户"先做其他开发"后：恢复被并行 actor 删掉的两个方案文件（git 恢复 149K 主方案+9.9K Phase 1 计划），开始 T2.1（Phase 2 市场上下文）
- 结束状态：18:30 中断——发现**生产 worker/api 18:00 被另一 actor 用幽灵代码树重建**（/app 来自 `/home/ubuntu/app/packages` 幽灵树：无 editorial/analyze.ts、无 ledger/labeler/T1.x，跑旧 boss/scheduler 循环）；根因已定位：`/home/ubuntu/app` 下有**旧 compose（build: ./packages）**，并行会话 17:57 改其 .env、18:00 从那里 build/up；FinHot 主 checkout 完好（main 5caa4ed），恢复动作进行到一半会话结束
- 事故注意点：与"今天删方案文件"同一模式（又一并行会话冲突源）；回填首跑全败曾因 .env 中 LLM_EXTRA_JSON 未加引号被 source 剥引号

#### 10-09 · 01a1205d · 进度检查⑤：缺数据定性，方案文件重建+状态标记入库（756126c）
- 用户请求时间线：看进度、出现状和后续计划（11:12）→ 现在缺的数据必须么，可移除/替代么 → 对升级方案整理，标记已完成/未完成/观察中 → 继续
- 关键产出与决策：
  - 进度增量（相对上次）：生产 18:25 已从 main 5caa4ed 重建（18:00 幽灵事故恢复，调度器正常）；**T0.5 回填进行中 1130/1645（69%），ETA 次日凌晨**（失败率 ~10%，api.zero43.top 超时为主）；台账 1830 行（none 1404/bullish 316/bearish 88/neutral 67，反事实 1634）；16:10 labeler 首次生产运行 858 行 skipped（neutral/none/空 scope/direction failed，设计内）、labeled=0 正常（T+5 未到不标）；**15:35 观察点 18/18 新列填满**
  - 缺数据定性：**真正缺的只有 T+5 未来收盘价（物理时间，不可替代）**；行情历史已回补到 07-02（n≈60 统计够）、~189 行方向失败可不管（failed 按设计排除回测）、market_ctx/prior_ctx 是 M2/M3 功能非缺数据、owner gold 标注轨可无限期推迟；**等待期可压缩**——labeler 已逐 horizon 填 T+1/T+3，backtest.ts 加 `--horizon` 小改动今晚可出首份 T+1 冒烟报告，**10-13（周一）16:10 首批 T+5 落库→当晚首份正式报告（比原预期提前 2 周）**
  - 方案整理：`FinHot/.agents/plans/FinHot-推演飞轮升级方案.md` 当时已**再次丢失**（FinHot 仓库 git 从未提交过它、/home/ubuntu/app 又非 git 仓库，无法恢复）→ 从 10-07 原始文件（32KB）重建 520 行状态版（24 处行内状态标记+状态总览表），**提交 main `756126c`**，并定规矩"以后方案更新改这个文件并 commit，不会再丢"
  - 状态总览：✅ Phase 0（6/6，G0 已过）+ Phase 1（T1.0–T1.3，10-09 11:57 部署、206/206）；🔄 T0.5 回填；⏳ G1 门 10-15 关闭；⬜ T1.4 首份回测报告+T1.5 泄漏审计（G2 预期 10-13/14）、Phase 2（T2.1–T2.5，10 月底启动，phase2 worktree 已建零 commit）、Phase 3（1 月+）；记录 7 项偏差 D1–D7（假期口径修正、T0.5 慢于计划、行情历史提前达成、**v1 台账缺口 ~40 条**（09-30→10-08 15:32 的 selected 方向未进台账，影响 ~2% 可选补跑）、网关劣化、18:00 幽灵事故与铁律、执行提速与并行线）
- 结束状态：完成（21:00 实测标记）。下一步：明早确认回填完成+补跑 ~10% 失败行 → 10-13 首批 T+5+首份回测报告 → 启动 Phase 2（M2）
- 事故注意点：**api.zero43.top step-5-preview 网关自 10-01 持续劣化（p50 10s→146s、10-06 曾 52% 文章失败、今日方向 failed 189 行+1 起"no active step plan subscription"）——被点名为当前数据积累速度最大运营瓶颈，需用户确认 step 套餐**；finhot-investment-analysis 分支不含 0040/0041，合并前需 rebase

## 3. 归档未结项与风险（跨会话汇总，与项目记忆 #22–#36 对应）

- **api.zero43.top step-5-preview 网关劣化**：自 10-01 起 p50 延迟 10s→146s，方向判断 ~10% failed、回填超时、"no active step plan subscription"——当前数据积累最大瓶颈，**需确认 step 套餐**（记忆 #22 有 429 排查 SQL 与判断标准）
- **push2his 东财 WAF**：TLS 指纹 + IP 封禁仍封锁板块 60 日历史回补，M1 基率研究少 7–9 月数据，待解封后 `node scripts/backfill-market.ts --days 60` 补跑；唯一可用备路 stockapi.com.cn
- **v1 台账缺口 ~40 条**（09-30→10-08 15:32 selected 方向未进台账，D4，影响 ~2%，可选补跑）
- **`/home/ubuntu/app` 下旧幽灵 compose（build: ./packages）**：10-09 18:00 已造成一次生产被换，**建议删除或加保护**（记忆 #34 铁律）
- **1Panel ai-gateway 注册未卸载**（litellm 退役遗留，需 1Panel UI 操作）
- **3 个存量测试红**（analyze 阈值漂移×2、alerts recovery×1）
- **远程侧失败源**：智通 500、财政部 502、Federal Register path 错
- **本地 nvm node v22.22.0 V8 日期解析损坏**（仅测试环境隐患，生产 v22.14.0 正常；labeler 已改纯算术免疫）
- **finhot-recover-1 23:54 被 docker rm 的归属**：至归档时未确认（记忆 #29）
- 已解决备查：840 行回补去向之谜（10-09 backfill-market.ts 重新回补至 07-02 起 66 交易日）、xiaoshi 域名消失、litellm 停摆（退役）

## 4. 归档操作说明

- **已归档 22 个会话**：通过 pi-web 自身 API（`POST /api/sessions/ui-state`，`{"action":"set","ids":[...],"archived":true}`）写入 `~/.pi/agent/pi-web-session-state.json`（22 条 `archivedAt`）。注：10-09 归档时 01a0f0e8 的完整 UUID 抄错（写成幽灵 key），实际 ID 为 `01a0f0e8-2a4f-72c4-806b-e899e15973ef`，10-10 已修正并中和幽灵 key。
- **原件已删除（2026-10-10）**：22 个会话 JSONL 已从 `~/.pi/agent/sessions/--home-ubuntu-app--/` 删除（46→24）。**唯一备份 = `~/.pi/agent/backups/pi-web-archived-finhot-2026-10-10.tar.gz`**（11MB，22 个文件，sha256 见同名 .sha256 文件，删除前逐文件核对 + 抽查字节一致）。恢复方法：解压回原目录，pi-web 侧边栏自动重新列出（归档状态仍保留）；单会话恢复后如需取消归档，走「已归档」视图或 API `{"action":"restore","entries":[{"id":"<session-id>","pinnedAt":null,"archivedAt":null}]}`。
- **未归档边界**：01a11b28（pi 截断问，4 处顺带提及）、01a11e8d（pi-web v0.11.0 升级，2 处顺带提及）未归档；01a0f0e8（截断横幅排查，起因与对象均为 FinHot 起源会话）已归档。
- **本归档会话**（01a120da）运行时不能自我归档，结束后可在 pi-web 手动归档。
- **本文件已提交 FinHot 仓库**（教训 #36：文档不入库会丢——推演飞轮方案文件曾两次丢失）。
