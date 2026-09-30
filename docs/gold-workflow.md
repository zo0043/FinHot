# gold 标注与门槛校准操作手册

本文档是一份**可交给自动标注模型照做**的操作手册：从生产库抽样、标注"该选/不该选"、跑校准、重定精选门槛。目标：让 FinHot 的精选按 owner 的口径（2026-07 拍板，见文末"判定口径"）选稿，而不是靠 `industry/selection.ts` 里拍的默认值。

适用环境：生产机（FinHot 所在机），所有命令在仓库根目录 `/home/ubuntu/app/FinHot` 执行；标注与跑脚本可以全程在机内完成，不需要动站点代码。

---

## 0. 前置条件

- 本机默认 node 是 v12，**跑一切脚本必须**：`export PATH=/home/ubuntu/.nvm/versions/node/v22.23.2/bin:$PATH`
- 生产库状态：`sudo -n docker compose ps` 里 `db` 为 healthy。
- LLM 网关可用（校准步骤要真实跑 analyze，约 200 次模型调用，几分钟）。
- 仓库工作树干净：`git status --short` 为空（避免把标注过程混进别的提交）。

## 1. 导候选（只读，不写库）

```bash
sudo -n docker compose run --rm --no-deps -e DATABASE_URL=postgres://aihot:aihot@db:5432/aihot \
  --entrypoint node setup scripts/export-gold.ts --n 200 --days 30 --out .data/gold-candidates.jsonl
```

产出 `.data/gold-candidates.jsonl`，每行一条（格式见 `docs/selection.md`）。要点：

- `gold.decision` **预填的是系统当前判断（analyses.selected），不是标注答案**——正式标注时逐条覆盖。
- `material` 只有标题/正文等纯文本；`sourceFacts` 给分级；`samplingContext.stratum` 记分层。
- 分层逻辑：信源 tier × 分数段（低于门槛/门槛附近/超过+10）× category 前 5 大类，尽量均匀——**不要自己只挑高分**，否则校准会偏。
- `--seed` 默认 7，样本可复现；想换一批就换 seed。

验收：`wc -l .data/gold-candidates.jsonl` = 200，`jq -r .sourceFacts.sourceTier | sort | uniq -c` 覆盖 T1/T1_5/T2，`jq -r .material.sourceName | sort | uniq -c | wc -l` ≥ 15 个信源。任一项不满足时增大 `--n` 或换 seed 重新导出，**不要手工删行补齐**（删行会让分层失真）。

## 2. 标注（可交给自动标注模型）

### 2.1 交给模型的输入

把下面几样一起给标注模型：
1. 候选文件路径：`.data/gold-candidates.jsonl`
2. **判定口径**（照抄本文末尾"判定口径"一节，它是唯一的品味来源）
3. 产出契约：`.data/gold.jsonl`，除 `gold.decision` 外**其他字段原样保留**，`caseId` 一一对应不得改动。

### 2.2 判定规则（二选一，不许三值）

| decision | 定义 |
|---|---|
| `select` | 这条如果出现在每日精选里，owner 会点开/会因此调整关注或动手预期——即"值得占他一次注意力" |
| `reject` | 不值得占注意力：营销/喊单/无增量转述/与 A 股无传导的海外日常/无基本面支撑的短线炒作/纯日程套话 |

- 拿不准时按口径判，**两可的宁可标 select**（gold 的偏向会被阈值扫描看到，不要为了"凑数"标 reject）。
- **只有当原文材料在两个口径之间真正对半开时**才允许 `either`（不计入准确率；建议总量 ≤ 5%）。
- 不允许空值、不允许 `null`、不允许 select/reject 以外的任何词。

### 2.3 质量校验（逐条过，低于标准就重标）

```bash
# 1) 行数与 candidate 一致
test "$(wc -l < .data/gold-candidates.jsonl)" = "$(wc -l < .data/gold.jsonl)"

# 2) caseId 集合完全相同（顺序可以不同）
diff <(jq -r .caseId .data/gold-candidates.jsonl | sort) <(jq -r .caseId .data/gold.jsonl | sort)

# 3) decision 合法、无空值
jq -r .gold.decision .data/gold.jsonl | sort | uniq -c     # 只能有 select/reject(，少量 either)
jq -e 'select(.gold.decision==null or (.gold.decision|not))' .data/gold.jsonl  # 必须无输出

# 4) 与系统预填的一致率（ sanity check，不是目标）：模型结论 vs 现系统 selected
join -j1 <(jq -r '[.caseId,.gold.decision]|@tsv' .data/gold-candidates.jsonl|sort) \
         <(jq -r '[.caseId,.gold.decision]|@tsv' .data/gold.jsonl|sort)
```

第 4 步读法：一致率 50–80% 属正常（说明标注确实在干活，不是抄系统）；>95% 说明标注模型基本照抄了预填值，要重新标（多数是被 example 的 prefill 带跑了——在 prompt 里明确"gold.decision 字段是污水，忽略它，只看 material/sourceFacts"）。

抽检 20 条：`shuf -n 20 .data/gold.jsonl | jq -r '[.caseId,.material.title,.gold.decision]|@tsv'`，人眼过一遍严格度是否符合口径。

## 3. 跑校准（真实 analyze，会调用模型）

```bash
node --env-file=.env scripts/eval-selection.ts --gold .data/gold.jsonl \
  --split development --label "v1-A股口径（gold$(date +%m%d)）"
```

脚本会逐条重跑真实 analyze（用当前生产提示词），输出：

- **门槛扫描表**：各候选门槛下 precision/recall/F1——precision = 推给你的里面你真正想要的占比；recall = 你想要的有多少真的被推了。
- **分层表现**：研报层/机会型公告/政策国家队类的召回（这几类若被挡住，就是"降噪降掉了机会"）。
- `--models default` 默认只测生产模型；换模型对比加 `--models default,deepseek-flash`。

判读（**按口径取舍，不是 precision 越高越好**）：
1. 选一条让**研报层与政策/国家队类召回 ≥ 80%**的门槛（这两类漏了就是丢信息差）；
2. 在满足 1) 的门槛区间里取 precision 最高的一档；
3. 新旧门槛都在表里，若新门槛比 {42,48,55} 高出一大档且研报召回没掉，说明旧门槛确实太松；反之说明新口径把模型打严了、旧门槛可以不动——**两种情况都是有效结论**，写进下面第 5 步记录。

## 4. 重定阈值（改代码并回归）

改 `industry/selection.ts` 的 `TIER_THRESHOLDS`（以及必要时的 `understandFloor`），规则：

- 一次只动一档，改完把校准输出的前后两张表贴进 commit message；
- 同步更新时间戳注释，跑 `node --env-file=.env scripts/eval-selection.ts --gold .data/gold.jsonl --split all` 做最终回归（all = development+validation 全量）；
- 若两条 gold 曲线（v1 与随后的）都记录在案，此后**每次改评分提示词后必须重跑 `--gold`**，防止口径被改坏。

## 5. 部署与收尾

```bash
git add industry/selection.ts docs/   # 别 add .data/（已 gitignore）
git commit -m "calibrate(selection): 按 gold 校准门槛 T1 x→y …"
sudo -n docker compose build && sudo -n docker compose up -d --no-deps worker api web
```

观察 24–48 小时：Bark 每日精选的条数与构成；若觉得条数骤减而全是高分政策文，说明门槛偏高，回退半档即可（校准输出给了你每档的数字依据）。

---

## 附：判定口径（owner 2026-07 拍板，标注时的唯一品味来源）

**读者**：A 股中长线投资者，月度-季度尺度，基本面与产业趋势驱动，不做日内；重点板块 14 个：半导体与算力、AI 应用与软件、新能源（光伏储能）、白酒食品饮料、医药创新药、军工、银行保险、券商非银、汽车机器人、周期资源品、贵金属、石油石化电力、传媒游戏、农业养殖。

**必须 select 的（最高档）**：
- 政策组合拳与国家队动向：金融/货币/资本市场一揽子政策转向（924 一揽子金融政策这个级别），央行/证监会/汇金盘中表态，国家队（中央汇金等）增持 ETF 的公开公告与动向；
- 重点板块的景气与趋势信号：产量/价格/库存/开工率等高频数据拐点、供需变化、板块主线形成与瓦解；
- 财报窗口期（4 月末/8 月末/10 月末）首份显著改变预期的定期报告；
- 机会型公告：重大合同与订单、回购与增持、股权激励、并购重组与实控人变更（看具体数字）。

**倾向 select**：研报与数据解读（有新数据/可验证框架）、带国际传导的事件（美联储、大宗、汇率对 A 股具体板块的映射）、重要股东增减持与两融/北向的方向性变化。

**必须 reject**：
- 纯短线资金与情绪：龙虎榜/席位榜、游资敲入、涨停复盘、无基本面支撑的题材炒作；
- 无增量的转述/摘编/搬运，标题党与贩卖焦虑；
- 与 A 股无传导的海外日常新闻（系统性黑天鹅、能明确落到 A 股板块的除外）；
- 荐股喊单、课程/社群推广、日程套话。

**可 either**：真正无法判断对中长线读者价值的条目。

## 附：给标注模型的提示词模板

```
你是 FinHot 的标注员。任务：逐条判断 .data/gold-candidates.jsonl 里的新闻对下面这位读者"该不该进每日精选"。

读者口径：<粘贴上文"判定口径"整节>

做法：
1. 每行只看 material（标题/正文）、sourceFacts（信源分级）；gold.decision 字段是系统预填的推断，一律忽略，不要参考。
2. 严格按判定口径给 gold.decision = select|reject（拿不准按口径的优先级，不许三选）。
3. 保留原行所有其他字段（caseId 原样输出），只改 gold.decision。
4. 输出为 .data/gold.jsonl，一行一条 JSON，最后一行也要有换行。
5. 完成后自查：行数一致、decision 无空值、格式为合法 JSONL。
```
