# FinHot 运维手册

> 改造自 AIHOT（MIT，© 数字生命卡兹ac）。本文件记录 Deploy 环境特有的拓扑、
> 配置生效路径、故障模式与恢复命令，目标是**任何人照着能做对操作**。

## 1. 架构与网络拓扑

Deploy 机器（43.130.7.121）上共存三套系统，来源各不相同：

| 组件 | 位置 | 作用 |
|---|---|---|
| `aihot-db-1` | docker compose 栈（`/home/ubuntu/app/FinHot`） | PostgreSQL，schema `_aihot` |
| `aihot-api-1` | 同栈 | Fastify API，容器内 3000 |
| `aihot-web-1` | 同栈 | React Router SSR，容器内 3000 |
| `aihot-worker-1` | 同栈 | 流水线（pg-boss 调度 + LLM 调用） |
| `aihot-setup-1` | 同栈 | 迁移 + seed + smoke（按需 run，不常驻） |
| `1Panel-openresty-vVkk` | 1Panel | 宿主 80/443，站点配置 `/opt/1panel/www/conf.d/*.conf` |
| `litellm-a` + `litellm-tunnel` | `/opt/litellm` | 自有 LLM 网关 + Cloudflare Tunnel 出口 |

**公网两条独立通路**（互不影响，任一条挂了站点仍可达）：

1. **Cloudflare Tunnel**（生产主路径）
   - 配置 `/opt/litellm/cloudflared/config.yml`（改动前自动备份 `.bak`）
   - ingress：`finhot.zero43.top → http://web:3000`
   - 容器已接入 FinHot 网络：`docker network connect aihot_default litellm-tunnel`
2. **openresty 80 反代**（备用/回源）
   - `/opt/1panel/www/conf.d/finhot.zero43.top.conf` → `proxy_pass http://127.0.0.1:3000`

域名 `zero43.top` 在 Cloudflare，DNS 记录用 API 管理（token 在 `/root/.secrets/cloudflare.ini`，
脚本 `/usr/local/bin/cf-dns.py`）：
`finhot` CNAME → `b5352c39-7610-45cb-a50c-57008f9416bc.cfargotunnel.com`，橙云代理。

## 2. 日常操作

```bash
cd /home/ubuntu/app/FinHot

# 启停（任何配置/代码改动后必须重建对应容器，否则改动不生效！）
sudo docker compose up -d --build api worker web

# 只看某个服务日志
sudo docker logs -f aihot-worker-1
sudo docker logs --since 10m aihot-worker-1

# 进入 DB
sudo docker exec -it aihot-db-1 psql -U aihot -d aihot

# 跑迁移/种子/冒烟（镜像内代码为构建时快照，改了 scripts/ 也要 --build）
sudo docker compose up --no-deps --force-recreate setup
```

**冷启动构建约 10-15 分钟**（`npm install` 全 workspace），改动只重编单服务快得多。
引擎要求 Node ≥ 24.11；宿主机操作 Node 需先
`export PATH=/home/ubuntu/.nvm/versions/node/v22.23.2/bin:$PATH`。

### 必填环境变量（缺失会导致容器启动即退出）

`.env` 里这些没有值 worker/api 会拒绝启动：
`LLM_BASE_URL`、`LLM_API_KEY`、`IMG_PROXY_SIGN_SECRET`（32 位 hex）、
`ADMIN_PASSWORD`、`SESSION_SECRET`（32 位 hex）、`MCP_ALLOWED_HOSTS=web`
（不配则 `scripts/smoke.ts` 的 MCP 探测失败）。

## 3. 配置生效路径（最容易踩的坑）

| 改了什么 | 怎么生效 | 不做的后果 |
|---|---|---|
| `industry/**`（sources/taxonomy/prompts/selection…） | `sudo docker compose up -d --build api worker web` | 容器里是旧快照，改了像没改 |
| `industry/sources.json` 的 enabled/tier/interval | 上述重建 **＋** 见下 | seed 只插不更新，DB 漂移 |
| `packages/**`、`apps/**` | `--build` 对应服务 | 同上 |
| `scripts/**` | `sudo docker compose up --no-deps --force-recreate setup` | setup 用旧脚本 |

**`seed.ts` 只插不更新**。改了 `sources.json` 的开关/tier/间隔后必须同步：

```bash
sudo docker compose run --rm --no-deps --entrypoint node setup scripts/sync-sources.ts
```

同步脚本会报告「配置里有但 DB 没有」（跑 seed）、「DB 有但配置没有」（保持不动）。

另外：`industry/sources.json` 的信源总数（当前 96）必须与
`.github/workflows/check.yml` 的 `sources` 断言数字一致，否则 CI 红。

## 4. LLM 网关

### 当前生产配置（默认，用自有网关）

```
LLM_BASE_URL=https://litellm.zero43.top/v1      # 自有 litellm 网关
LLM_API_KEY=<master key>                         # 从 litellm-a 容器 LITELLM_MASTER_KEY 读
<所有步骤>_MODEL=zero-flash                     # 预筛/评分/理解/写作/结构/聚集/digest
ANALYZE_CONCURRENCY=6
```

网关模型族：

| 组 | 定位 | 备注 |
|---|---|---|
| `zero-flash` | **主力**，10K prompt 稳定 | 多上游池，偶发 429/502，整体最稳 |
| `zero-fast` | 只适合短 prompt | 组内部分上游窗口仅 ~4K，长 prompt 必 413，**别用** |
| `zero-pro` | 备用 | 曾出现整组不可用，仅大 prompt 走它 |

### 备用网关（gpt-load，认证头不同）

```
LLM_BASE_URL=https://api.zero43.top/v1
LLM_API_KEY=sk-gl-...
```
**注意：这个网关用 `X-Api-Key` 头，不是标准的 `Authorization: Bearer`**。
`packages/backend/src/providers/llm.ts` 已同时支持两种头（Bearer 缺失时补 X-Api-Key）。
可用模型：`step-5-preview`、`deepseek-v4-flash`、`DeepSeek-V4-Pro-0813`。

### 切换模型/网关流程

```bash
# 1) 先验证目标可用（10K 长 prompt 也要过，流水线 prompt 很长）
curl -s -m 60 -X POST <base>/chat/completions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"<模型>","messages":[{"role":"user","content":"<'长文本"'}],"max_tokens":16}'

# 2) 改 .env 后重建 worker
sudo docker compose up -d worker

# 3) 重置被网关失败拖死的文章（可选，恢复到待处理）
sudo docker exec aihot-db-1 psql -U aihot -d aihot -c "UPDATE articles SET processing_state='new', processing_attempts=0, processing_retry_at=NULL, processing_error=NULL WHERE processing_state='failed'"
```

### 代码层已打的补丁（`packages/backend/src/providers/llm.ts`）

1. **双认证头**：同时发 `Authorization: Bearer` 和 `X-Api-Key`，兼容自有 litellm 与 api.zero43.top（gpt-load）。
2. **reasoning token 预算**：推理模型会把 `reasoning_content` 算进 `max_tokens`，把正文 JSON 挤没（报 `No JSON object` / finish_reason=length）。默认 spec 已 +6000，结构化短任务不再截断。
3. **解析兜底**：模型输出被双重转义（`{"label":...}` 字面量）或只输出 reasoning 时，自动解转义/回落再解析一次。

## 5. 采集失败模式与恢复

### 失败退避会自我强化（重点）

`packages/backend/src/sources/collect.ts:202`：抓取失败时
`next_fetch_at = now + LEAST(interval_minutes * (fail_count + 2), 360) 分钟`，
且 `fail_count` 不清零就不会恢复——**网关抖一次，采集可能慢 10 倍并持续多天**。
`adaptIntervals`（每天 04:20）还会把空转源的间隔拉到 6 小时。

判断采集是否健康：

```sql
-- 每个源近 1 小时抓取情况（应每分钟都有 success + found_count>0）
SELECT source_id, status, count(*), to_char(max(created_at),'MM-DD HH24:MI') last
FROM fetch_runs WHERE created_at > now() - interval '60 minutes'
GROUP BY 1,2 ORDER BY 4 DESC;

-- 失败堆积的源
SELECT source_id, fail_count, to_char(next_fetch_at,'MM-DD HH24:MI') next
FROM sources WHERE fail_count > 5 AND enabled ORDER BY fail_count DESC;
```

恢复动作（按序）：

```bash
# 1. 修上游（通常是 LLM 网关，见 §4）
# 2. 清零失败计数、立即重试
sudo docker exec aihot-db-1 psql -U aihot -d aihot -c \
  "UPDATE sources SET fail_count=0, next_fetch_at=now() WHERE enabled"
# 3. 单个源手动触发：admin 后台 Sources → Run now，或重启 worker
```

### Jina

未购买 Jina key，`.env` 里 `JINA_BODY_FALLBACK=false`。
开启前不要配——没有 key 时正文兜底会刷 `jina api key is not configured` 失败，
把源拖进退避。

### 公告类源的取不到正文

交易所公告 PDF 直链有 WAF（返回 HTML 而非 PDF），且 Readability 不解 PDF。
当前所有公告源 `detail.maxFetches=0`，走"标题+摘要+跳转原文"，**这是有意的取舍**。

## 6. 页面口径（排查"噪音"时先分清）

| 口径 | 含义 | 谁看见 |
|---|---|---|
| `eligibility` | **全部动态流**闸门：editorial 源 + 预筛 pass，**与分数无关** | `/all`、`/feed.xml` |
| `selected` | **精选**：selectivity ≥ 2×region 最低阈值 | 首页、日报、hot 榜 |
| `hot_signal` | 只佐证热度，无详情页、不建 story、**全站不可见** | 只贡献 participants |

所以"`/all` 里很多低分内容"不是 bug，是设计；真正要治的是
**预筛标准**（`industry/prompts/prefilter.md`）和**信源质量**。降噪三板斧：
停用低信噪源 → 调 prefilter 的 BLOCK 规则（需可引用措辞）→ 调 tier/阈值。

## 7. 巡检 SQL（随手可用）

```sql
-- 内容产量总览
SELECT processing_state, count(*) FROM articles GROUP BY 1 ORDER BY 2 DESC;

-- 精选池按源（评估信源质量：有 elig 无 sel 的源就是噪音源）
SELECT s.id, s.tier, count(*) FILTER (WHERE p.eligible) elig,
       count(*) FILTER (WHERE p.selected) sel
FROM publications p JOIN sources s ON s.id=p.source_id
WHERE p.published_at > now() - interval '7 days'
GROUP BY s.id, s.tier ORDER BY sel DESC, elig DESC;

-- LLM 调用成功率（近 1 小时）
SELECT purpose, status, count(*) FROM receipts
WHERE created_at > now() - interval '60 minutes' GROUP BY 1,2 ORDER BY 3 DESC;

-- 网关失败的具体错误
SELECT purpose, left(coalesce(error,''),120) FROM receipts
WHERE status='failed' ORDER BY id DESC LIMIT 5;
```

## 8. 测试与发布检查

```bash
export PATH=/home/ubuntu/.nvm/versions/node/v22.23.2/bin:$PATH
npm run typecheck

# 全量测试（容器内跑，挂宿主 tests/ 免得重建）
sudo docker compose run --rm --no-deps -e DATABASE_URL=postgres://aihot:aihot@db:5432/finhot_ci \
  -v "$PWD/tests:/app/tests" api npm test

# 冒烟（MCP_ALLOWED_HOSTS=web 已写入 .env）
sudo docker compose run --rm --no-deps --entrypoint node setup scripts/smoke.ts --base http://web:3000
```

注意：`tests/signals.test.ts` 的成批相似度判定没有 mock LLM，
本地直连真实网关；CI 有 mock 不受影响。**本地失败不代表代码坏**。

## 9. 报头字/品牌素材

```bash
node scripts/nameplates.ts /tmp/notopack/package   # 指向含 @fontsource/noto-sans-sc 的目录
```
`industry/brand/nameplates/*.svg` 是矢量路径，改 `industry/site.ts` 的
`subject` 后重跑即可（如"财经日报"）。图标/logo 属 P5 品牌工作，
`brand/logos/README.md` 说明了 AIHOT 名称与 logo 不随 MIT 授权、须自建品牌。

## 10. 已知问题与后续事项

| 事项 | 状态 | 说明 |
|---|---|---|
| 公告漏报风险 | **待办** | `json_list` 无分页/游标，每次只取页头 N 条；爆发日超量静默丢失。影子测试 >5% 才上游 PR |
| gold 校准 | **待办** | 当前阈值 {60,65,76} 沿用 AI 语料校准值；财经语料需 100-200 条标注样本 + `scripts/eval-selection.ts` 重校 |
| RSSHub | **未部署** | sources.json 里 13 条标 `[待自建RSSHub]` 的源处于停用；部署后逐条启用 |
| 人物线 | **弱** | X 分片 17 账号 / 公众号 8 个依赖 SocialData/极致了 key，未开 |
| P5 合规 | **待办** | terms.md 投资免责声明、ICP 备案、站点图标 |
| 静默契约 | 已明示 | 日报"个新模型"指标因无"模型发布"分节恒 0，自动隐身，勿为点亮指标造假分节 |

## 11. 常见故障速查

| 症状 | 先查哪里 | 大概率原因 |
|---|---|---|
| 站点打不开 | `dig finhot.zero43.top`、`curl -H 'Host: finhot.zero43.top' 127.0.0.1:3000` | CF DNS 记录没了 / tunnel 挂了 / 源站容器挂了 |
| `隧道连不上 web:3000` | `docker network inspect aihot_default` | tunnel 容器被移出 FinHot 网络，重新 `docker network connect` |
| worker 启动即退出 | `docker logs aihot-worker-1` | `.env` 缺 `IMG_PROXY_SIGN_SECRET` / `SESSION_SECRET` / `ADMIN_PASSWORD` |
| 采集全停 | §7 的 fetch_runs 查询 | 网关 429/403 触发失败退避，`fail_count` 雪滚；见 §5 |
| 改了配置没效果 | — | 忘了 `--build` / 忘了跑 sync-sources.ts |
| 满屏 `No JSON object` | receipts 表 | 推理模型 max_tokens 截断（已打补丁，确认 step 类模型） |
| 403 无额度 | 直连网关测模型组 | 换模型组或网关 |
| `jina api key is not configured` | `.env` | `JINA_BODY_FALLBACK=false` |
