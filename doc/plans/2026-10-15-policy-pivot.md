# FinHot 政策化改造（P1 开发 + P2 恢复 + P3 校准 + P4 回测）实施计划

> **REQUIRED SUB-SKILL:** Use the subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 把 FinHot 精选主轴从行情新闻反转为「国家政策发布与落地」：政策信源上线、评分口径政策化、`policy_stage` 生命周期字段全链路贯通（含 direction 单次重试），恢复生产、gold 重标定门槛、产出首份方向回测报告。

**Architecture:** 三条开发泳道各自独立 worktree（`worktrees/pv-w1` / `pv-w2` / `pv-w3`，分支 `pv/w1-sources` / `pv/w2-scoring` / `pv/w3-structure`，均从 `finhot-policy-pivot` 切出，已建好），文件归属互斥、顺序合入集成分支 `worktrees/finhot-policy-pivot`。全部复用现有六步流水线与 direction 先例（migration 0039~0041、回执、回填脚本），不新增公开出口。执行并发 ≤2（owner 约束）：Wave 1 双泳道并行，其余串行。

**Tech Stack:** TypeScript（Node 24 直跑，npm workspaces）+ PostgreSQL（迁移 0042 纯增量）+ LLM 回执系统（providers/receipts）。

**Spec:** `/home/ubuntu/app/FinHot/worktrees/finhot-policy-pivot/doc/specs/2026-10-15-policy-pivot.md`

分相：Task 1-4 = spec §4 的 P1（开发），Task 5 = P2（恢复生产），Task 6-7 = P3（gold 校准），Task 8 = P4（回测）。Task 6 含人工门禁（用户重标）。

**Verification:**
```bash
export PATH=/home/ubuntu/.local/bin:$PATH
cd /home/ubuntu/app/FinHot/worktrees/finhot-policy-pivot
docker run -d --name finhot-pg-test -p 127.0.0.1:15432:5432 -e POSTGRES_PASSWORD=postgres postgres:16   # 已存在则跳过
createdb -h 127.0.0.1 -p 15432 -U postgres finhot_main_test   # 已存在则跳过
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/finhot_main_test node scripts/migrate.ts
npm run typecheck
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/finhot_main_test npm test
npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts
```

---

## 前置 Setup（orchestrator 直接执行，Wave 1 派工之前）

- [ ] 四个 worktree 各自的 node_modules（硬链拷贝主 checkout 的；npm workspace 软链是相对路径 `../../packages/*`，硬链后自动重定位到各自泳道，避免 VPS 上跑 4 次 npm ci 重活）：
  ```bash
  cd /home/ubuntu/app/FinHot
  for wt in worktrees/finhot-policy-pivot worktrees/pv-w1 worktrees/pv-w2 worktrees/pv-w3; do
    [ -e "$wt/node_modules" ] || cp -al node_modules "$wt/node_modules"
  done
  readlink worktrees/pv-w3/node_modules/@aihot/backend   # 预期 ../../packages/backend（相对）
  node -e 'console.log(require.resolve("@aihot/backend/editorial/direction",{paths:["/home/ubuntu/app/FinHot/worktrees/pv-w3/tests"]}))'   # 预期解析到 pv-w3 的 packages/backend
  ```
- [ ] 测试 PG 容器 + 每泳道独立空库（防并行泳道抢同一 schema）：`finhot_w1_test` / `finhot_w2_test` / `finhot_w3_test` / `finhot_main_test`（`createdb -h 127.0.0.1 -p 15432 -U postgres <名>`，各库先 `DATABASE_URL=... node scripts/migrate.ts`）。
- [ ] 每条泳道任务书写死：工作目录、`export PATH=/home/ubuntu/.local/bin:$PATH`（系统 node v12 会挂）、自己的 DATABASE_URL、`git add <具体文件>`（禁止 `git add -A`）、final_answer ≤40 行硬上限、不写开场白/总结段。

## Files

**Create:**
- `worktrees/pv-w3/database/migrations/0042_policy_stage.sql`
- `worktrees/pv-w3/scripts/backfill-policy-stage.ts`
- `worktrees/pv-w3/tests/policy-stage.test.ts`
- `worktrees/pv-w1/doc/specs/w1-source-verification.md`
- `worktrees/finhot-policy-pivot/doc/specs/p3-gold-rerun-sheet.md`

**Modify:**
- `worktrees/pv-w1/industry/sources.json`
- `worktrees/pv-w1/industry/taxonomy.ts`（ENTITIES/IDENTITY_LEXICON/PUBLISHER_DOMAINS 三块）
- `worktrees/pv-w2/industry/prompts/selection-score.md`
- `worktrees/pv-w2/industry/taxonomy.ts`（CATEGORIES/TOPIC_TAGS/CATEGORY_BY_TAG 区）
- `worktrees/pv-w2/industry/prompts/content-understanding.md`
- `worktrees/pv-w2/industry/prompts/structure.md`
- `worktrees/pv-w2/industry/site.ts`
- `worktrees/pv-w2/industry/topics.json`
- `worktrees/pv-w2/tests/category-fallback.test.ts`
- `worktrees/pv-w3/packages/contracts/src/site.ts`
- `worktrees/pv-w3/packages/backend/src/editorial/direction.ts`
- `worktrees/pv-w3/packages/backend/src/editorial/analyze.ts`
- `worktrees/pv-w3/packages/backend/src/publication/`（detail.ts / v1.ts / items.ts / publish.ts 中 direction/scope 出现处）
- `worktrees/pv-w3/industry/prompts/directions.md`
- `worktrees/pv-w3/industry/prompts/group-method.md`
- `worktrees/pv-w3/apps/web/app/routes/item.tsx`
- `worktrees/pv-w3/apps/web/app/features/feed/ReadingGroup.tsx`
- `worktrees/pv-w3/tests/direction.test.ts`
- `worktrees/finhot-policy-pivot/industry/selection.ts`

**Delete:** 无

---

## Wave 1 — 信源 ∥ 口径

Parallel-safe: Task 1 与 Task 2 在不同 worktree（pv-w1 / pv-w2），文件归属互斥；`industry/taxonomy.ts` 的 ENTITIES 区与 CATEGORIES 区相距 >100 行，合入时 git 自动合并。运行资源：各自独立空库（finhot_w1_test / finhot_w2_test），不共享外部服务。

### Task 1: 政策信源验证与配置（W1，泳道 pv-w1，分支 pv/w1-sources）

**TDD scenario:** Trivial change — 配置数据 + 网络验证，判断力用足

**Spec:** doc/specs/2026-10-15-policy-pivot.md § "W1 信源（industry/sources.json + 必要自建 RSSHub）" L39, § "W1 信源（industry/sources.json + 必要自建 RSSHub）" L42, § "W1 信源（industry/sources.json + 必要自建 RSSHub）" L45, § "W1 信源（industry/sources.json + 必要自建 RSSHub）" L46, § "W1 信源（industry/sources.json + 必要自建 RSSHub）" L47, § "5. 验收标准" L110

**Files:**
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w1/industry/sources.json`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w1/industry/taxonomy.ts`
- Create: `/home/ubuntu/app/FinHot/worktrees/pv-w1/doc/specs/w1-source-verification.md`

**Tests:**
- none: config-data

- [ ] **Step 1: 验证国务院政策文件库接口**

  按 spec §2 线索②：curl 读 GitHub `guangxiangdebizi/China-Central-Policy-MCP` 的 README（raw.githubusercontent.com），按其记载的 `sousuo.www.gov.cn` 检索接口实测 `p=1&n=20`：确认 ① 返回 JSON 结构（policy_id/title/level/date/url/summary/issuing_agency/document_number）② 分页可用 ③ 频率限制迹象（连发 5 请求）。同时 curl `https://www.gov.cn/zhengce/zuixin/` 列表页作回退候选。结论写入验证报告：**稳 → json_list 源**（参照 sources.json 里 `json-sse-announcement` 条目的 config 形态：url/itemsPath/titlePaths/summaryPaths/publishedAtPath/urlTemplate）；**不稳 → web_list 列表页**（参照现有 web_list 条目形态）。

- [ ] **Step 2: 拉取部委栏目清单并裁剪**

  curl `https://api.github.com/repos/changwu/china-policy-sites/contents/` 看目录结构，拉取清单文件。按「对 A 股板块/宏观有直接传导」裁剪 ~15 个部委栏目（候选：工信部、科技部、住建部、市场监管总局、能源局、税务总局、生态环境部、商务部、医保局、水利部；与现有 96 源去重；**必须**处理 sources.json 里两处 `[待自建RSSHub]` 占位对应的发改委与金融监管总局——官网栏目可直接抓则直接抓并替换占位，否则保留占位并在报告说明）。

- [ ] **Step 3: 逐个验证候选 URL**

  每个候选：`curl -sIL` + 拉首页，确认 ① 200 无 WAF 拦截 ② 时间序列表（最新在上）③ 条目含可解析的标题/链接/日期。记录格式（RSS / JSON / 列表页）。不可用的剔除并在报告列原因。目标：国务院 1~2 + 部委 ≥10 验证通过。

- [ ] **Step 4: 写 sources.json 条目**

  每个验证通过的源按现有条目完整形态写：`id`（kebab-case，如 `web-gov-ndrc-zc`）、`name`（把握度标注规则同现有）、`kind`（`rss` / `json_list` / `web_list` 按验证结果，参照同类现有条目）、`config`（json_list 必须给 itemsPath/titlePaths/summaryPaths/publishedAtPath，列表页按 web_list 现有形态）、`tier: "T1"`、`first_party: true`、`owner_entity_id`（对应 Step 5 的实体 id）、`participation_mode: "editorial"`、`interval_minutes`（官方栏目 15，日更型文件库 60）、`tags: ["政策"]`、`site_fulltext: false`、`syndicate_fulltext: false`、`enabled: true`。

- [ ] **Step 5: 实体扩充（taxonomy.ts 仅 ENTITIES / IDENTITY_LEXICON / PUBLISHER_DOMAINS 三块，不碰 CATEGORIES/TOPIC_TAGS）**

  新部委逐个加：`ENTITIES`（id 小写 kebab，如 `miit`/`most`/`mohurd`/`samr`/`nea`/`sat`，name 全称，displayTag: null，aliases 含常用简称——参照现有 `ndrc` 条目）、`IDENTITY_LEXICON`（机构简称 + 职务语 pattern，参照 `ndrc` 条目写法 `/发改委主任|发改委(?:新闻发言人|表示|印发)/i`）、`PUBLISHER_DOMAINS`（该部委官网域名，如 `miit.gov.cn`）。

- [ ] **Step 6: 验证报告 + 解析校验 + 测试**

  写 `doc/specs/w1-source-verification.md`（在 pv-w1 泳道内）：表（机构 · 栏目 · URL · 格式 · 频率 · 结论/原因 · owner_entity_id）+ 不可用清单 + 自建 RSSHub 待办（如有）。然后：
  ```bash
  export PATH=/home/ubuntu/.local/bin:$PATH
  cd /home/ubuntu/app/FinHot/worktrees/pv-w1
  node -e 'const s=JSON.parse(require("fs").readFileSync("industry/sources.json","utf8"));console.log("sources:",s.sources.length)'
  DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/finhot_w1_test node --test --test-concurrency=1 --test-timeout=120000 /home/ubuntu/app/FinHot/worktrees/pv-w1/tests/category-fallback.test.ts
  ```
  Expected: 解析通过、count = 96+新增数；测试绿（该测试不引用 sources.json，作解析冒烟）。

- [ ] **Step 7: Commit**

  ```bash
  git add industry/sources.json industry/taxonomy.ts doc/specs/w1-source-verification.md
  git commit -m "feat(industry): 政策信源：国务院文件库+部委栏目（W1 政策化）"
  ```

### Task 2: 政策化评分口径与分类（W1，泳道 pv-w2，分支 pv/w2-scoring）

**TDD scenario:** Trivial change — 提示词/配置内容改写，保留既有骨架与输出契约

**Spec:** doc/specs/2026-10-15-policy-pivot.md § "W2 评分口径（prompts/selection-score.md + industry/taxonomy.ts + selection.ts）" L51, § "W2 评分口径（prompts/selection-score.md + industry/taxonomy.ts + selection.ts）" L52, § "W2 评分口径（prompts/selection-score.md + industry/taxonomy.ts + selection.ts）" L56, § "W2 评分口径（prompts/selection-score.md + industry/taxonomy.ts + selection.ts）" L57, § "W2 评分口径（prompts/selection-score.md + industry/taxonomy.ts + selection.ts）" L58, § "W3 结构：policy_stage 字段 + 日报/首页/主题页" L73, § "W3 结构：policy_stage 字段 + 日报/首页/主题页" L74, § "W3 结构：policy_stage 字段 + 日报/首页/主题页" L75, § "5. 验收标准" L112

**Files:**
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w2/industry/prompts/selection-score.md`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w2/industry/taxonomy.ts`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w2/industry/prompts/content-understanding.md`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w2/industry/prompts/structure.md`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w2/industry/site.ts`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w2/industry/topics.json`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w2/tests/category-fallback.test.ts`
- Test: `/home/ubuntu/app/FinHot/worktrees/pv-w2/tests/category-fallback.test.ts`

**Tests:**
- `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/finhot_w2_test node --test --test-concurrency=1 --test-timeout=120000 /home/ubuntu/app/FinHot/worktrees/pv-w2/tests/category-fallback.test.ts`
- via: `deriveCategory()`（CATEGORIES 变更后兜底链仍成立；命令在 pv-w2 泳道根目录、PATH 含 ~/.local/bin 下执行）

- [ ] **Step 1: 重写 selection-score.md（保骨架换口径）**

  保留：输入安全边界、评估边界、五轴定义、类型权重表（7 行权重不变）、事件口径校正节、输出契约（只返回 attentionScore）。`policy_regulation` 类型升为一等公民，其评分口径在品味规则中重写（三个维度见下）。重写/替换：
  1. 定位段改为：「{{siteName}} 的主轴是**国家政策（国务院与部委）的发布与落地**：先盯政策，再盯政策影响的市场。读者是持续关注 A 股投资机会与趋势、以月/季为单位的**中长线**投资者，注意力有限。」
  2. 品味规则「必须正常评价的价值」把政策条目升为第一组，写入三个维度口径——**政策级别**：国务院/国常会/国办文件 > 多部委联合发文 > 单部委文件 > 司局级；级别越高 sig 上限越高，司局级日常通知 `sig ≤ 4`（有量化细则者除外）。**落地深度**：生效执行（含明确时间表/执行口径）> 配套细则/实施意见（量化指标、适用范围）> 官方解读（发布会/答记者问/权威解读稿）> 正式发布 > 征求意见/草案 > 传闻；纯表态无执行内容（"加强""研究""统筹"类空转）`sig ≤ 4` 且 `nov ≤ 3`。**影响面**：全市场（货币/财政总量）> 多板块（≥3 板块或产业链）> 单板块，进 reson。保留原「政策组合拳与国家队动向」条目（最高档口径不变）。
  3. 「必须压住的噪声」保留全部现有条，**追加**一条（吸收旧降噪分支口径）：「单一公司/个股的涨跌、交易、传闻类新闻，默认不是本读者的关注点，`sig ≤ 4`；例外：① 14 个重点板块龙头且构成板块基本面节点；② 政策落地直接对象（如首批试点企业）；③ 含政策级信号。例外须由正文明确支持。」
  4. 阶段口径条补一句：「政策类事件的阶段同时按 草案/发布/解读/细则/试点/执行 判断（系统另行采集 `policy_stage` 字段），评分只以原文写明的阶段为准。」
  5. 海外政策降为辅助档：「海外政策仅在构成系统性事件或能明确落到 A 股具体板块时按节点评价，日常海外政策 `sig ≤ 5`。」

- [ ] **Step 2: taxonomy.ts 分类反转（仅 CATEGORIES / TOPIC_TAGS / CATEGORY_BY_TAG 区，不碰 ENTITIES 三块）**

  `CATEGORIES` 改为 8 项（key 稳定：新增 `policy`，其余 key 不变；section 顺序即日报分节顺序）：
  ```ts
  export const CATEGORIES = [
    { key: "policy", label: "政策", section: "政策中心", guide: "国家与政府政策：国务院/部委的政策发布、官方解读、配套细则、试点与执行落地，按生命周期阶段归入" },
    { key: "industry", label: "行业", section: "行业动态", guide: "产业与板块基本面：景气、供需与产品价格、产能与技术路线、行业性政策细则；同时兜底归不上其他类别的财经消息" },
    { key: "market", label: "盘面", section: "盘面", guide: "主要市场整体行情：指数涨跌、成交与资金流向、板块涨跌轮动、涨跌停与大幅异动" },
    { key: "macro", label: "宏观数据", section: "宏观数据", guide: "官方统计数据发布与宏观趋势：CPI/PPI/PMI/社融/GDP/进出口/就业等数据及其解读" },
    { key: "a-share", label: "公司", section: "公司动态", guide: "上市公司事件：定期报告与业绩预告、重大公告、停复牌、回购增减持、股权激励、立案调查与处罚" },
    { key: "global", label: "环球", section: "环球", guide: "海外与全球因素：海外央行、外围股指、关税贸易与地缘冲突、汇率与大宗商品变化" },
    { key: "people", label: "人物", section: "人物观点", guide: "重点人物的公开信号：官员、企业家、投资人与经济学家的讲话、访谈、署名文章与公开市场行为" },
    { key: "research", label: "数据研究", section: "数据研究", guide: "统计与数据发布及市场解读；券商研报、经济与行业研究、指数与排行发布" },
  ] as const;
  ```
  `TOPIC_TAGS` 追加：`"货币政策", "财政政策", "产业政策"`。`CATEGORY_BY_TAG["政策/监管"]` 从 `"macro"` 改为 `"policy"`。

- [ ] **Step 3: 同步标签/类别提示词**

  `content-understanding.md`：主题白名单追加「货币政策、财政政策、产业政策」（与 TOPIC_TAGS 一致）。`structure.md`：把其中的类别词表与 guide 文本逐条替换为 Step 2 的新 CATEGORIES（保持该文件其余结构不变）。

- [ ] **Step 4: site.ts 文案 + topics.json 主题**

  `site.ts`：homeTitle = `FinHot — 政策落地 · A股板块影响 · 每日精选`；description = `盯住国务院与部委官方政策信源，跟踪政策从发布、官方解读、配套细则到试点执行的全过程，并判断它利好或利空哪些 A 股板块；行情新闻为辅。`；tagline = `先看政策，再看盘面`；ABOUT.steps.select 改为政策优先措辞：「模型先判是不是国家与政府政策及其落地、有没有实质执行内容与影响板块，再写中文标题、摘要和推荐理由；营销软文和重复转发进不来。」name/subject/mcpPrefix 不变。`topics.json`：按现有条目形态新增 3 个主题（货币政策/财政政策/产业政策，slug 与分组以文件现有结构为准）。

- [ ] **Step 5: 更新引用旧分类的测试 + 运行**

  ```bash
  rg -l "宏观政策|\"macro\"" tests/   # 命中的其他测试文件按 AGENTS.md 要求把样例换成新分类对应项
  # 在 pv-w2 泳道根目录、PATH 含 ~/.local/bin 下跑上方 Tests 命令
  ```
  Expected: 绿。

- [ ] **Step 6: Commit**

  ```bash
  git add industry/prompts/selection-score.md industry/taxonomy.ts industry/prompts/content-understanding.md industry/prompts/structure.md industry/site.ts industry/topics.json tests/
  git commit -m "feat(industry): 政策化评分口径 + 政策中心分类（W2 政策化）"
  ```

## Wave 2 — 结构（policy_stage 全链路 + direction 单次重试）

Solo: Task 3 以 Wave 1 合入后的集成分支为基线（需要最终 taxonomy 与信源实体在位），且代码泳道单独走便于逐层 review。

Depends on Wave 1: Task 3 基线含 Task 1 的 owner_entity_id 实体与 Task 2 的最终 CATEGORIES。

### Task 3: policy_stage 字段全链路 + direction 单次重试（W2，泳道 pv-w3，分支 pv/w3-structure）

**TDD scenario:** New feature — full TDD cycle

**Spec:** doc/specs/2026-10-15-policy-pivot.md § "W3 结构：policy_stage 字段 + 日报/首页/主题页" L67, § "W3 结构：policy_stage 字段 + 日报/首页/主题页" L72, § "W3 结构：policy_stage 字段 + 日报/首页/主题页" L73, § "W2 评分口径（prompts/selection-score.md + industry/taxonomy.ts + selection.ts）" L56, § "W5 恢复生产 + 回测" L94, § "5. 验收标准" L111, § "5. 验收标准" L112

**Files:**
- Create: `/home/ubuntu/app/FinHot/worktrees/pv-w3/database/migrations/0042_policy_stage.sql`
- Create: `/home/ubuntu/app/FinHot/worktrees/pv-w3/scripts/backfill-policy-stage.ts`
- Create: `/home/ubuntu/app/FinHot/worktrees/pv-w3/tests/policy-stage.test.ts`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w3/packages/contracts/src/site.ts`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w3/packages/backend/src/editorial/direction.ts`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w3/packages/backend/src/editorial/analyze.ts`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w3/packages/backend/src/publication/detail.ts`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w3/packages/backend/src/publication/v1.ts`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w3/packages/backend/src/publication/items.ts`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w3/packages/backend/src/publication/publish.ts`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w3/industry/prompts/directions.md`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w3/industry/prompts/group-method.md`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w3/apps/web/app/routes/item.tsx`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w3/apps/web/app/features/feed/ReadingGroup.tsx`
- Modify: `/home/ubuntu/app/FinHot/worktrees/pv-w3/tests/direction.test.ts`
- Test: `/home/ubuntu/app/FinHot/worktrees/pv-w3/tests/direction.test.ts`
- Test: `/home/ubuntu/app/FinHot/worktrees/pv-w3/tests/policy-stage.test.ts`

**Tests:**
- `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/finhot_w3_test node --test --test-concurrency=1 --test-timeout=120000 /home/ubuntu/app/FinHot/worktrees/pv-w3/tests/direction.test.ts /home/ubuntu/app/FinHot/worktrees/pv-w3/tests/policy-stage.test.ts`
- via: `judgeDirection()` 的 policy_stage 解析与重试（命令在 pv-w3 泳道根目录、PATH 含 ~/.local/bin 下执行；跑前先在同库执行 `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/finhot_w3_test node scripts/migrate.ts`）

- [ ] **Step 1: 失败测试**

  `tests/policy-stage.test.ts`（参照 tests/direction.test.ts 现有风格与 fixture）：
  - policy_regulation 输入 + 模型输出含 `"policy_stage":"details"` → 解析结果 policy_stage = "details"
  - 模型输出非法值（如 `"已落地"`）→ policy_stage = null（不抛错）
  - 非政策类输入（itemType=company_filing）→ policy_stage 恒 null
  - 迁移后 analyses/publications 含 policy_stage 列且 CHECK 约束拒绝非法值
  `tests/direction.test.ts` 追加：directions.md 输出契约样例含 policy_stage 字段；重试逻辑测试（mock 模型调用：首次失败第二次成功 → 返回有效结果；两次失败 → 结果保持 null 不抛错）。

- [ ] **Step 2: 运行确认失败**

  Run: 上述 Tests 命令。Expected: FAIL（policy_stage 未实现 / 列不存在）。

- [ ] **Step 3: 迁移 0042**

  `database/migrations/0042_policy_stage.sql`（参照 0041 的注释风格）：
  ```sql
  -- 0042：政策生命周期阶段（政策化改造 W3）。纯增量；旧行保持 NULL。
  -- policy_stage ∈ draft/release/interpretation/details/pilot/execution，仅 policy_regulation 事件有值；
  -- 拿不准为 NULL（与 direction=none 纪律一致）。
  ALTER TABLE analyses
    ADD COLUMN policy_stage text CHECK (policy_stage IN ('draft','release','interpretation','details','pilot','execution'));
  ALTER TABLE publications
    ADD COLUMN policy_stage text CHECK (policy_stage IN ('draft','release','interpretation','details','pilot','execution'));
  ```

- [ ] **Step 4: contracts + direction.ts 解析与重试**

  `packages/contracts/src/site.ts`：定义 `export type PolicyStage = "draft" | "release" | "interpretation" | "details" | "pilot" | "execution";`，`ItemDetail` 在 direction/scope 旁加 `policy_stage: PolicyStage | null`（注释：仅 policy_regulation 事件，null = 非政策或未判定，不渲染徽章）。
  `packages/backend/src/editorial/direction.ts`：返回类型加 `policy_stage: PolicyStage | null`；解析模型 JSON 时白名单校验（非法→null）；非 policy_regulation 事件强制 null。**T4.3 单次重试**：direction 调用解析失败（非法 JSON 或契约字段缺失）时用现有 attemptTag 机制（analyze.ts:434 已传 attemptTag）重调一次（第二次 attemptTag 加后缀，如 `r2`，使回执为新调用）；仍失败则结果保持 null 并记日志。

- [ ] **Step 5: directions.md 提示词加字段**

  「输出格式」JSON 加 `"policy_stage":"draft|release|interpretation|details|pilot|execution 之一，或 null"`；判断规则加第 8 条：「policy_stage 仅当事件是政策/监管动作（材料主体是政策文件）时输出，表示该政策当前所处的生命周期阶段：draft=征求意见/草案，release=正式发布，interpretation=官方解读（发布会/答记者问/权威解读稿），details=配套细则/实施意见，pilot=试点/先行先试，execution=生效执行（含明确执行时间表）；按材料写明的阶段判，拿不准输出 null，不猜。非政策事件恒 null。」

- [ ] **Step 6: analyze.ts 落库 + publication 透传**

  `analyze.ts`：direction 步的 INSERT（~L473-479）加 policy_stage 列（先 rg 确认 analyses 表 direction 列的读写写法对齐）；direction 结果类型加字段。`publication/` 中把 direction/scope 从 analyses 读出组装 ItemDetail 的文件（rg `"scope"` packages/backend/src/publication -g '*.ts'）同步加 policy_stage。**不绕回执**：policy_stage 与 direction 同一次模型调用、同一 prompt_version 回执（directions prompt 变更 → promptVersion 自动 bump → 旧回执自然失效，这正是回填依据）。

- [ ] **Step 7: 聚簇纪律（group-method.md）**

  读 group-method.md / group-definitions.md，在「后续进展归同一事件」的既有规则处追加一条：「同一政策文件的后续落地（官方解读、配套细则、试点、执行）与该政策的发布归同一事件；事件的阶段以最新一条材料写明的阶段为准。」只加规则，不改其他聚簇逻辑。

- [ ] **Step 8: web 阶段徽章**

  `apps/web/app/routes/item.tsx` 与 `apps/web/app/features/feed/ReadingGroup.tsx` 中渲染 direction/scope 的位置，在方向行旁渲染阶段徽章（映射：draft=草案 release=发布 interpretation=解读 details=细则 pilot=试点 execution=执行；null 不渲染）。样式复用现有角标/徽章 class。

- [ ] **Step 9: 回填脚本**

  `scripts/backfill-policy-stage.ts`（照 `scripts/backfill-direction.ts` 的结构照抄改写）：对已打分且 analyses.policy_stage IS NULL 的文章按批（--batch 20）重跑 judgeDirection（新 prompt_version 使回执全部为新调用）；单线程、断点可续（每批落库）、`--limit N`、`--dry-run` 只计数不跑。头部注释写明：一次性回填 ~1830+ 行，白天执行，预计 1-3 小时网关时间。

- [ ] **Step 10: 测试绿 + typecheck**

  Run: Tests 命令 + 在 pv-w3 泳道根目录跑 npm run typecheck。Expected: 全绿。

- [ ] **Step 11: 全量测试（本泳道）**

  Run: 在 pv-w3 泳道根目录跑 `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/finhot_w3_test npm test`。Expected: 全绿；失败且由本任务引入则修复。

- [ ] **Step 12: Commit**

  ```bash
  git add database/migrations/0042_policy_stage.sql packages/contracts/src/site.ts packages/backend/src/editorial/direction.ts packages/backend/src/editorial/analyze.ts packages/backend/src/publication/ industry/prompts/directions.md industry/prompts/group-method.md apps/web/app/routes/item.tsx apps/web/app/features/feed/ReadingGroup.tsx scripts/backfill-policy-stage.ts tests/policy-stage.test.ts tests/direction.test.ts
  git commit -m "feat(pipeline): policy_stage 生命周期字段全链路 + direction 单次重试（W3 政策化）"
  ```

## Wave 3 — 集成验证

Solo: 依赖 Task 1、Task 2、Task 3 全部完成并各自提交。

### Task 4: 合入 + 全量验证（W3，orchestrator 直接执行，集成分支 finhot-policy-pivot）

**TDD scenario:** Trivial change — 合并与验证

**Spec:** doc/specs/2026-10-15-policy-pivot.md § "5. 验收标准" L115

**Files:**
- Modify: `/home/ubuntu/app/FinHot/worktrees/finhot-policy-pivot/industry/taxonomy.ts`
- Modify: `/home/ubuntu/app/FinHot/worktrees/finhot-policy-pivot/industry/sources.json`
- Modify: `/home/ubuntu/app/FinHot/worktrees/finhot-policy-pivot/industry/prompts/selection-score.md`

**Tests:**
- none: integration

- [ ] **Step 1: 顺序合入**

  ```bash
  cd /home/ubuntu/app/FinHot/worktrees/finhot-policy-pivot
  git merge pv/w1-sources && git merge pv/w2-scoring
  git -C /home/ubuntu/app/FinHot/worktrees/pv-w3 merge finhot-policy-pivot   # T3 基线同步到 W1/W2 结果
  git merge pv/w3-structure
  ```
  预期无冲突（文件互斥 + taxonomy.ts 区域不重叠）。有冲突则手工解，保持两边语义。

- [ ] **Step 2: 全量 Verification**

  按顶部 Verification 命令集在集成分支 + finhot_main_test 跑：migrate（含 0042）→ typecheck → npm test（全量）→ web build + web tests。Expected: 全绿。

- [ ] **Step 3: 针对性检查**

  ```bash
  node -e 'const s=JSON.parse(require("fs").readFileSync("industry/sources.json","utf8"));console.log("T1 enabled:",s.sources.filter(x=>x.tier==="T1"&&x.enabled).length)'   # ≥ 原 T1 数 + 12
  grep -c "policy_stage" packages/backend/src/editorial/analyze.ts industry/prompts/directions.md   # 均 ≥1
  git log --oneline finhot-policy-pivot ^main   # 3 条泳道提交 + merge 在位
  ```

- [ ] **Step 4: Commit 合并结果**

  `git commit --no-edit`（merge commit），确认工作区干净。

## Wave 4 — 恢复生产

Solo: 依赖 Task 4 全量验证通过；生产栈（compose project aihot）是独占运行时资源，且镜像重建为重活（VPS 3.4GB，白天执行避开 pi-web 高峰）。

### Task 5: 重建镜像 + 恢复 + 3 天观察（W4，orchestrator 直接执行）

**TDD scenario:** Trivial change — 运维操作

**Spec:** doc/specs/2026-10-15-policy-pivot.md § "W5 恢复生产 + 回测" L90, § "W5 恢复生产 + 回测" L91, § "W5 恢复生产 + 回测" L92, § "W1 信源（industry/sources.json + 必要自建 RSSHub）" L47, § "5. 验收标准" L110, § "5. 验收标准" L111, § "5. 验收标准" L112

**Files:**
- Create: `/home/ubuntu/app/FinHot/worktrees/finhot-policy-pivot/doc/specs/p2-observation.md`

**Tests:**
- none: ops

- [ ] **Step 1: 恢复检查单**

  按 `.agents/plans/FinHot-推演飞轮升级方案.md` 恢复节：核对 worker 镜像来源（暂停时 image=sha256:ab34009e 是 main 5caa4ed 构建的；本次代码已变，必须重建）；确认数据卷 aihot_data 在位。

- [ ] **Step 2: 重建镜像 + 启动（白天执行，盯内存）**

  ```bash
  cd /home/ubuntu/app/FinHot/worktrees/finhot-policy-pivot
  sudo docker compose build worker api   # 若 compose 指向主 checkout 代码则先合回 main 或临时指向本分支（以 compose 文件实际 context 为准）
  sudo docker compose up -d
  sudo docker compose ps   # 全 healthy
  ```
  注意：compose 的 build context 若指向 `/home/ubuntu/app/FinHot`（main），需先把 finhot-policy-pivot 合回 main 再重建（决策点：P1 验收绿后合 main）。

- [ ] **Step 3: 跑一次性回填**

  白天单线程：`node scripts/backfill-policy-stage.ts --batch 20`（断点可续；预计 1-3 小时网关时间；期间观察网关失败率，劣化则暂停等闲时）。

- [ ] **Step 4: 3 天观察（每天一次）**

  每天查：① 新增政策源采集成功率（目标 ≥90%）② 精选率与政策类（policy 类别）占比 ③ policy_stage 覆盖率（selected 的 policy_regulation，目标 ≥90%）④ direction 失败率（重试后目标 <3%）⑤ token 成本（对照 spec 预算 +40~80 条/天，超则源级停用低收益源）。第 3 天出观察小结写入 `doc/specs/p2-observation.md`（集成分支）。

- [ ] **Step 5: Commit 观察小结**

  `git add doc/specs/p2-observation.md && git commit -m "docs(obs): P2 三天观察小结（政策化改造）"`

## Wave 5 — gold 重标准备

Solo: 依赖 Task 5 的 3 天真实产出；含人工门禁（用户重标，STOP 直到用户交回标注）。

### Task 6: gold 重标工作表（W5，orchestrator 直接执行 + 用户标注）

**TDD scenario:** Trivial change — 数据准备

**Spec:** doc/specs/2026-10-15-policy-pivot.md § "W4 Eval 与 gold（前置：W1 信源已上线 1~2 周有真实产出）" L83

**Files:**
- Create: `/home/ubuntu/app/FinHot/worktrees/finhot-policy-pivot/doc/specs/p3-gold-rerun-sheet.md`

**Tests:**
- none: data-prep

- [ ] **Step 1: 导出样本**

  生产库导出：旧 gold 200 条（`.data/gold.jsonl` 对应条目）+ 3 天观察期内新增政策类条目 100~200 条（policy 类别 + policy_regulation 类型，按分数分层抽样），`scripts/export-gold.ts` 现成则用，否则写一次性查询。每条含：item id、标题、摘要、信源与 tier、模型两次分数、旧 gold 标签（如有）。

- [ ] **Step 2: 生成重标工作表**

  写 `doc/specs/p3-gold-rerun-sheet.md`：每行一个 case（id · 标题 · 摘要 2 行内 · 分数 · 建议标签）。建议标签按新口径预填（政策级别 × 落地深度 × 影响面 → 应入选/不应入选），供用户复核提速。**人工门禁：提交给用户重标/复核，STOP 直到用户交回。**

- [ ] **Step 3: 落盘新 gold**

  用户标注回来后，按 docs/selection.md 的 gold 格式写入 `.data/gold.jsonl`（不提交 .data；工作表文件提交）。

- [ ] **Step 4: Commit 工作表**

  `git add doc/specs/p3-gold-rerun-sheet.md && git commit -m "docs(gold): P3 重标工作表（政策化口径）"`

## Wave 6 — 回测报告

Solo: Task 8 依赖 Task 5（生产恢复 + 3 天观察数据是 T1.4 回测的输入）。

### Task 8: T1.4 首份方向回测报告（W6，orchestrator 直接执行）

**TDD scenario:** Trivial change — 跑现有回测脚本并解读

**Spec:** doc/specs/2026-10-15-policy-pivot.md § "W5 恢复生产 + 回测" L93, § "5. 验收标准" L114

**Files:**
- Create: `/home/ubuntu/app/FinHot/worktrees/finhot-policy-pivot/doc/specs/p4-backtest-report.md`

**Tests:**
- none: report

- [ ] **Step 1: 跑回测**

  `node --env-file=.env scripts/backtest.ts`（在集成分支；脚本参数以文件头部注释为准；用恢复后的 production 库）。等待完成（含 T+5 窗口的历史数据 + 恢复后新数据）。

- [ ] **Step 2: 解读 + 出报告**

  产出首份回测报告：整体方向命中率、按 horizon（t1/t3/t5）切片、**policy_regulation 条目的方向准确率基线**（本次改造的核心量化验证）、与基率先验的对照（如 base_rate_priors 有 active 版本）。写入 `doc/specs/p4-backtest-report.md`。

- [ ] **Step 3: Commit**

  `git add doc/specs/p4-backtest-report.md && git commit -m "docs(backtest): T1.4 首份方向回测报告（含政策条目基线）"`

## Wave 7 — eval 定门槛

Solo: 依赖 Task 6 的用户标注（新 gold）完成；eval 会打真实模型调用，须在网关闲时跑。

### Task 7: eval + 门槛定案（W7，orchestrator 直接执行）

**TDD scenario:** Trivial change — 校准决策

**Spec:** doc/specs/2026-10-15-policy-pivot.md § "W2 评分口径（prompts/selection-score.md + industry/taxonomy.ts + selection.ts）" L63, § "W4 Eval 与 gold（前置：W1 信源已上线 1~2 周有真实产出）" L84, § "W4 Eval 与 gold（前置：W1 信源已上线 1~2 周有真实产出）" L85, § "W4 Eval 与 gold（前置：W1 信源已上线 1~2 周有真实产出）" L86, § "5. 验收标准" L113

**Files:**
- Modify: `/home/ubuntu/app/FinHot/worktrees/finhot-policy-pivot/industry/selection.ts`

**Tests:**
- none: eval

- [ ] **Step 1: 跑 eval（网关闲时）**

  `node --env-file=.env scripts/eval-selection.ts --gold .data/gold.jsonl --concurrency 2 --attempts 3 --label "policy-pivot-v1"`（在集成分支）。读校准报告：总体 AUC、政策子集 AUC、阈值扫描。

- [ ] **Step 2: 门槛定案**

  目标：总体 AUC ≥ 0.80 且政策子集 AUC ≥ 0.80。达标 → 按阈值扫描定 T1/T1_5/T2（现值 42/48/55 作参考，官方源可更低）；不达标 → 与用户对齐是回到 Task 2 调口径还是接受现状（人工门禁）。改 `industry/selection.ts` 的 thresholds 并更新其注释（写清 eval 依据与日期）。

- [ ] **Step 3: 提交 + 记录**

  `git add industry/selection.ts && git commit -m "feat(industry): 政策化口径 eval 定门槛（P3）"`，并把结论追加进 `doc/specs/p2-observation.md` 或新开 `doc/specs/p3-eval.md` 后提交。

---

## Spec coverage

| anchor | requirement (short) | owner |
|---|---|---|
| § "W1 信源（industry/sources.json + 必要自建 RSSHub）" L39 | 国务院文件库验证与采用（json 检索或列表页回退） | Task 1 |
| § "W1 信源（industry/sources.json + 必要自建 RSSHub）" L42 | 部委栏目 +12~18（含补两处 RSSHub 占位） | Task 1 |
| § "W1 信源（industry/sources.json + 必要自建 RSSHub）" L45 | 新部委实体进 ENTITIES/IDENTITY_LEXICON/PUBLISHER_DOMAINS | Task 1 |
| § "W1 信源（industry/sources.json + 必要自建 RSSHub）" L46 | 采集频率（15min/1h）与时间序验证 | Task 1 |
| § "W1 信源（industry/sources.json + 必要自建 RSSHub）" L47 | 成本预算 +40~80 条/天、源级可停用 | Task 1, Task 5 |
| § "W2 评分口径（prompts/selection-score.md + industry/taxonomy.ts + selection.ts）" L51 | 定位重写（政策主轴，读者不变） | Task 2 |
| § "W2 评分口径（prompts/selection-score.md + industry/taxonomy.ts + selection.ts）" L52 | 保留五轴 + 三政策维度（级别/落地深度/影响面） | Task 2 |
| § "W2 评分口径（prompts/selection-score.md + industry/taxonomy.ts + selection.ts）" L56 | 阶段口径管 cred、与 policy_stage 对齐 | Task 2, Task 3 |
| § "W2 评分口径（prompts/selection-score.md + industry/taxonomy.ts + selection.ts）" L57 | 其余 6 类噪声规则保留 + 吸收个股压制口径 | Task 2 |
| § "W2 评分口径（prompts/selection-score.md + industry/taxonomy.ts + selection.ts）" L58 | CATEGORIES 8 项 + 分节顺序 + TOPIC_TAGS +3 + 政策/监管映射改 policy | Task 2 |
| § "W2 评分口径（prompts/selection-score.md + industry/taxonomy.ts + selection.ts）" L63 | 门槛不预设，eval 后重校准 | Task 7 |
| § "W3 结构：policy_stage 字段 + 日报/首页/主题页" L67 | policy_stage 6 值 + null 纪律 + direction 步同调用输出；迁移 0042 + 回执 + 回填脚本 | Task 3 |
| § "W3 结构：policy_stage 字段 + 日报/首页/主题页" L72 | 聚簇：同一政策后续落地归同一事件 | Task 3 |
| § "W3 结构：policy_stage 字段 + 日报/首页/主题页" L73 | 日报政策中心第一分节 + 卡片阶段徽章 + 影响方向 | Task 2, Task 3 |
| § "W3 结构：policy_stage 字段 + 日报/首页/主题页" L74 | 主题页 3 个政策主题 | Task 2 |
| § "W3 结构：policy_stage 字段 + 日报/首页/主题页" L75 | site.ts 文案 | Task 2 |
| § "W4 Eval 与 gold（前置：W1 信源已上线 1~2 周有真实产出）" L83 | gold 重标（旧 200 条 + 新增 100~200 政策样本） | Task 6 |
| § "W4 Eval 与 gold（前置：W1 信源已上线 1~2 周有真实产出）" L84 | eval AUC ≥ 0.80（总体 + 政策子集） | Task 7 |
| § "W4 Eval 与 gold（前置：W1 信源已上线 1~2 周有真实产出）" L85 | 门槛由 eval 数据定 | Task 7 |
| § "W4 Eval 与 gold（前置：W1 信源已上线 1~2 周有真实产出）" L86 | 门禁：eval 通过才定案 | Task 7 |
| § "W5 恢复生产 + 回测" L90 | 重建 worker 镜像（白天执行、盯内存） | Task 5 |
| § "W5 恢复生产 + 回测" L91 | compose up + 恢复检查单 | Task 5 |
| § "W5 恢复生产 + 回测" L92 | 3 天观察指标（精选率/政策占比/阶段覆盖/失败率） | Task 5 |
| § "W5 恢复生产 + 回测" L93 | T1.4 首份回测报告 | Task 8 |
| § "W5 恢复生产 + 回测" L94 | T4.3 direction 单次重试 | Task 3 |
| § "5. 验收标准" L110 | 新增信源 ≥12 上线 + 3 天采集成功率 ≥90% | Task 1, Task 5 |
| § "5. 验收标准" L111 | policy_stage 覆盖率 ≥90% | Task 3, Task 5 |
| § "5. 验收标准" L112 | 日报政策中心第一分节，卡片带阶段徽章与影响方向 | Task 2, Task 3, Task 5 |
| § "5. 验收标准" L113 | 总体与政策子集 AUC ≥ 0.80，门槛定案 | Task 7 |
| § "5. 验收标准" L114 | T1.4 首份回测报告产出（政策条目方向准确率基线） | Task 8 |
| § "5. 验收标准" L115 | 无回归（盘面/热度/飞书/Bark/MCP 行为不变，leaderboard/codexReset 保持 off） | Task 4 |
| § "1. 背景与已定决策" L22 | 不做：政策文库 / 地方政府信源 / 新增海外信源 | waived: spec §1 明确本轮不做，排除工作 |

## Open Questions

无（4 个开放问题已由用户 2026-10-15 按默认值批准：policy_stage 6 值命名、3 个政策主题标签、site.ts 文案草案、部委清单以验证结果裁剪）。执行中的新决策点：Task 5 Step 2 的 compose build context 指向（合回 main vs 临时指向分支）。
