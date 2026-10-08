# FinHot 精选降噪 — 开发交接（Handoff）

**日期**：2026-10-01
**产出**：给新会话/新开发者一份可直接开工的交接单。读完这份文件应该能独立继续开发，无需回溯对话历史。

---

## 0. 一句话现状

精选降噪规格（`selection-noise-suppression`）已批准；其 8 个实施任务完成 2 个（基线、测试漂移修正）。**下一步 = W1T3 gold 34 行重标**。评估框架规格已批准但实施计划尚未开工。

---

## 1. 工作区与环境（先做这些）

```bash
# 工作树（所有开发都在这里，不要在 main/主 checkout 写代码）
cd /home/ubuntu/app/FinHot/.worktrees/finhot-investment-analysis
git log --oneline -3      # HEAD 应为 f9d8813

# node 必须用 v22（默认 PATH 的 node 是 v12，会失败）
PATH=/home/ubuntu/.nvm/versions/node/v22.23.2/bin:$PATH

# 测试（共享测试库 finhot_ci，每文件独立进程）
PATH=/home/ubuntu/.nvm/versions/node/v22.23.2/bin:$PATH \
  DATABASE_URL=postgres://aihot:aihot@172.20.0.4:5432/finhot_ci \
  node --test tests/analyze.test.ts      # 当前 8/8 绿

# 若测试库落后于迁移（曾停在 0038 缺 analyses.direction），先迁移：
PATH=/home/ubuntu/.nvm/versions/node/v22.23.2/bin:$PATH node scripts/migrate.ts
# 注意：该库现已在 0039；如遇缺列报错先跑迁移再测

# docker 需要 sudo -n；compose 项目名固定 aihot（两个 checkout 共享镜像 tag + db 容器）
sudo -n docker compose ps
```

**关键路径**：
- 工作树：`/home/ubuntu/app/FinHot/.worktrees/finhot-investment-analysis`
- 主 checkout（**gold 数据文件在这里**）：`/home/ubuntu/app/FinHot`
- gold 数据：`/home/ubuntu/app/FinHot/.data/gold.jsonl`（200 行）、`gold-candidates.jsonl`（含 3 行 `//` 注释头）
- 生产库：docker `db` 容器，`aihot/aihot`

---

## 2. 已批准的两个规格

| 规格 | 路径 | 状态 |
|---|---|---|
| 精选降噪 | `doc/specs/2026-09-30-selection-noise-suppression.md` | 已批准，**执行中（2/8）** |
| 统一能力评估框架 | `doc/specs/2026-10-01-model-evaluation-framework.md` | 已批准，**未开工** |

对应实施计划（合规 Wave/Task 格式，`plan_check` 已通过）：
- `doc/plans/2026-09-30-selection-noise-suppression.md`
- `doc/plans/2026-10-01-model-evaluation-framework.md`

**执行顺序（owner 已拍板）**：先降噪，后框架。

---

## 3. 降噪规格：问题、口径、方案（浓缩版）

**问题**：生产 30 天 48 条精选里 ~46% 是港股/海外个股或单一公司行情（智通·港股 13 条全是个股；Google News·韩股/日经/FT Markets 共 9 条），owner 反馈"都是特定公司、小公司、影响力低却精选了"。

**根因**：① `selection-score.md` 权重表里"相关度"轴 `reson` 只占 1–2/10 分，小公司只要数字具体就能过 T2=55；② 噪声规则没覆盖"真实但低相关的单一公司基本面"，港股 ADR 绕开了"与 A 股无传导"规则；③ gold 基准本身也 select 了这类噪声（校准目标失真）；④ 门槛按信源分级且智通·港股**已在最严档 T2=55** → 门槛不是杠杆，**提示词才是**。

**owner 拍板的严格口径**：单一公司/个股类**默认拒绝**，除非 (a) 公司属 14 重点板块 且 (b) 事件是该板块真基本面节点。保留：金川国际 +7.7x（铜/周期资源）、内房股+房贷贴息（政策级）。拒绝：JS环球生活涨10%、欢创暗盘、中远海能尾盘跌5%、Momenta 股价、兖煤澳、希音-W 目标价、恒安主席辞世、小公司例行公告。

**方案（方案 A，外科式）**：只改 `industry/prompts/selection-score.md` 三处（不动五轴定义/权重表/输出契约）+ gold 重标定 + eval 门禁。

**三处提示词编辑**（规格 Approach §1 有全文，逐字照抄）：
- (a) "必须压住的噪声"新增"单一公司与个股行情"条目（默认 `sig ≤ 4` 且 `nov ≤ 3`，双条件例外）
- (b) "与 A 股无传导的海外日常新闻"扩边界至港股 ADR/H 股个股行情
- (c) "A 股公司公告中的机会型披露"加"重点板块/板块节点"限定

---

## 4. 任务清单与进度（`plan_tracker` 当前状态）

| # | 任务 | 状态 | 关键点 |
|---|---|---|---|
| W1T1 | 基线 | ✅ | 测试原为红；生产 prompt 版本列名是 `selectbench_runs.prompt`（**不是** `prompt_version`） |
| W1T2 | 修 `tests/analyze.test.ts` 门槛漂移 | ✅ | 信源 T1→T2；`:95` 断言 60→55；8/8 绿（commit f9d8813） |
| **W1T3** | **gold 34 行切片 + 重标 + 合并校验** | ⏳ **下一步** | 见 §5 |
| W1T4 | 更新 `docs/gold-workflow.md` 口径 | ⏳ | 写入单一公司规则 + 修 §2.3 裸 `wc -l` |
| W2T5 | eval round 0（旧 prompt × 新 gold 基线） | ⏳ | 见 §6 |
| W3T6 | 提示词三处外科编辑 | ⏳ | 规格 §1 全文 |
| W4T7 | 重建镜像 + 部署 + eval round 1 验收 | ⏳ | 三验收线；迭代 ≤3 轮 |
| W5T8 | 收尾 | ⏳ | 全量测试 + 提交 + 生产确认 + 观察 note |

---

## 5. W1T3 详细做法（下一步，务必照做）

**为什么只重标 34 条**：严格口径只**增加**拒绝条件、不放松，所以 166 条旧 reject 在新口径下不可能翻成 select → 稳定，无需重标。

```bash
cd /home/ubuntu/app/FinHot   # 主 checkout！gold 文件在这里
# 1. 切片：全部 gold.decision == "select" 的 34 行
PATH=/home/ubuntu/.nvm/versions/node/v22.23.2/bin:$PATH node -e '
const fs=require("fs");
const rows=fs.readFileSync(".data/gold.jsonl","utf8").split("\n").filter(l=>l.trim().startsWith("{"));
const sel=rows.filter(l=>JSON.parse(l).gold?.decision==="select");
fs.writeFileSync(".data/strict-review-20260930.jsonl", sel.join("\n")+"\n");
console.log("select rows:", sel.length);'   # 期望 34
```

2. **派 1 个 fixer subagent 串行重标**（不要并发多路：会打 429）。brief 必须含：
   - 2026-07 owner 口径全文（30 天滚动池；A 股中长线；14 重点板块；纯短线噪音 sig≤4）
   - 本次新增的"单一公司/个股行情"硬规则（规格 Context「Owner 拍板」节）
   - 先例：`export-002` 埃斯顿股权激励 = 汽车机器人板块机会型披露 → **select**；`export-048` 兖煤澳 / `export-065` Momenta → **reject**；`export-019` 金川国际 +7.7x → **select**；`export-027` 内房股+房贷贴息 → **select**
   - 要求：**忽略现有 `gold.decision` 独立判断**；除 `gold.decision` 外字段**逐字节保留**；输出翻转清单
3. 合并：旧 gold 备份到 `.data/backup-20261001-<HHMM>/gold.jsonl`（勿覆盖既有 `backup-20260930-1736/`），重标结果并回 `.data/gold.jsonl`（200 行）
4. 校验（**禁用裸 `wc -l`**，候选文件有 3 行 `//` 注释头）：
   - 数据行数 = 200（`grep -c '^{'`）
   - caseId 集合 == `gold-candidates.jsonl` 的 caseId 集合（`caseId = sha1(url||title)[:16]`）
   - `gold.decision` ∈ {select,reject} 无空值
   - `export-020/044/048/065/100` = reject；`export-019/027` = select

---

## 6. W2T5–W5T8 关键命令

**eval 跑法**（主 checkout，`.data` 需挂载）：
```bash
cd /home/ubuntu/app/FinHot
sudo -n docker compose run --rm --no-deps -v "$PWD/.data:/app/.data" --entrypoint node setup \
  scripts/eval-selection.ts --gold .data/gold.jsonl --n 200 --label <label>
```
**成本警告**：receipt 身份含 promptVersion + system sha → **每次改提示词都会让全部打分 receipt 失效，每轮 eval 全额重付 ~600 次调用**。归档基线一致率 0.556–0.595（最近 59.5%，`selection-score@5c5a429baa`）。

**验收线（三线全过）**：
1. 噪声全翻：重标为 reject 的个股噪音条 eval 判定全 reject
2. 真信号零误杀：金川国际/内房+贴息/统计局大超/央行社融方向变化 → 保持 select
3. 总一致率 ≥ 90%（"either" 不计入）
4. 不达线迭代提示词，**上限 3 轮**；超线停下找 owner 调口径，不许硬凑

**部署**（prompt 打包进镜像，**必须先 build 再 eval**）：
```bash
# 工作树里 build（共享镜像 aihot-app）
cd /home/ubuntu/app/FinHot/.worktrees/finhot-investment-analysis && sudo -n docker compose build
# 主 checkout 里 up（worktree 缺 .env，compose 解析失败时先 cp /home/ubuntu/app/FinHot/.env .env，gitignored）
cd /home/ubuntu/app/FinHot && sudo -n docker compose up -d --no-deps worker api web
```

**round 0 用途**：改提示词**之前**先跑一次（旧 prompt × 新 gold），既做管线预检又留改前基线。

---

## 7. 评估框架规格（降噪做完后开工）

一句话：给 selection / direction / summary 三能力建统一评估台。
- **一池三 gold**：月度 200 条池 → 精选判定 ×200（子代理标）、方向+板块 ×~34（**owner 全量自标**）、关键事实 ×~34（owner 自标）
- **四个 runner**：`eval-selection`（扩 DB gold 模式）、`eval-direction`（一致率+混淆矩阵+板块 P/R）、`eval-summary`（忠实性裁判+关键事实覆盖）、`backtest`（**从未实现**，方向×market_daily 算 5/20/60 日命中，**必须对基线报 lift**）
- **模型 A/B**：`--model <能力>=<模型id>`（对应 12 能力注册表 env）
- **Web**：gold 标注页（预填+误入选覆盖）+ 看板四 tab
- **行情前置**：`market_daily` **当前 0 行**，cron 昨天(09-30)才上线且只拉当日 → 需一次性 kline 回填（东财 `push2his`，secid `90.BKxxxx`，~140 交易日 × 16 key）
- **迁移号 = 0044**（现存最大 0043）
- Phase 1 = 地基（迁移→import-gold→DB gold→回填→admin API→标注页→eval-direction），Phase 2 = eval-summary + backtest + A/B + 文档

---

## 8. 硬约束与坑（务必遵守）

1. **node v22**：`/home/ubuntu/.nvm/versions/node/v22.23.2/bin` 必须在 PATH 前；默认 PATH 的 node 是 v12。
2. **不要在 main 写代码**：全部在 worktree。
3. **docker 需 `sudo -n`**；compose 项目名固定 `aihot`，两个 checkout **共享**镜像 tag 与 db 容器 → 在 worktree build 会影响主 checkout 的容器（这是有意的：部署流程靠它）。
4. **worktree 没有 `.env`**：eval/生产操作从主 checkout 跑；worktree 里 compose build 若报 env_file 缺失，临时 `cp /home/ubuntu/app/FinHot/.env .env`（gitignored）。
5. **gold 文件在主 checkout** `.data/`，不在 worktree。
6. **`caseId = sha1(url||title)[:16]`**；候选文件含 3 行 `//` 注释头 → 校验用 caseId 集合 + `grep -c '^{'`，**不要用 `wc -l`**。
7. **门槛是硬编码**在 `industry/selection.ts` `{T1:42, T1_5:48, T2:55}`（`understandFloor: 50`）——**没有任何 env 覆盖路径**。智通·港股已在最严档 T2 仍漏 → 门槛不是杠杆。
8. **单 LLM 网关**（litellm.zero43.top，无 failover）；评估跑量 ~600 调用/轮。
9. **少开 subagent**（owner 约束）：串行执行；gold 重标只开 1 个 fixer。
10. **测试库准备**：`tests/setup.ts` 强制 `_test`/`_ci` 库（`finhot_ci`），跑测试前若缺列先 `node scripts/migrate.ts`；不在主 checkout 时需显式带 `DATABASE_URL`。

---

## 9. 提交历史（相关）

```
f9d8813 fix(tests): 门槛漂移修正 + 回滚错误诊断 + 提交两个实施计划   ← HEAD
82653c2 docs(spec): 既有欠账修正（此项结论已被 f9d8813 纠正）
343c706 docs(spec): 评估框架规格迁移号修正 0040→0044
8ed3542 docs(spec): 统一能力评估框架
93a3cdc docs(spec): 精选降噪规格
```

**注意**：`82653c2` 引入的"env 覆盖缺口"结论是**错的**（我误读了工具输出），`f9d8813` 已回滚为正确的"测试漂移"诊断。若看到 `tests/selection-thresholds.test.ts` 相关描述，一律以 f9d8813 后的规格/计划为准。

---

## 10. 工作流约定（本项目）

- 规格驱动：`brainstorm` → 规格（`doc/specs/`）→ 批准 → 实施计划（`doc/plans/`，Wave/Task/Spec coverage 合规格式，`plan_check` 校验）→ 执行（subagent-driven-development）→ verify → finishing
- 执行期间：父会话只编排，**代码由 subagent 写**（派发 fixer/reviewer）
- 规格是唯一契约；代码与规格冲突时改代码；规格本身有缺陷时走规格修订流程（不要静默偏离）
- 每个 Wave 结束提交；`plan_tracker` 记录进度
