# P2 生产恢复观察记录（政策化改造）

## Day 0（2026-10-15 23:00-23:30，恢复当晚）

**恢复操作**
- main 合入 finhot-policy-pivot（FF → 031e1bf）：政策信源 14 条 + 政策化评分口径 + policy_stage 全链路
- 镜像重建：aihot-app = sha256:451d3f6a5baa8e7f6d13d71dd9b06eb46678ae86b2dade2b426af21dd72c1c71（build 210s，内存峰值 1995MB 无换页压力）
- `sudo docker compose up -d`：api/worker/web/db 全 Up；setup 应用 0042 迁移、topics 69、sources +14
- 站点 127.0.0.1:3000 → 200（finhot.zero43.top 走 cloudflared 隧道）

**Day 0 指标**
- 采集：恢复后 15 分钟入库 659 条（含全源首轮），latest published_at 与当前同步
- 新政策源首轮采集：60 分钟间隔的国务院/部委源预计第二个采集周期出现（Day 1 统计）

**⚠ 阻塞（Day 0 23:25 发现）**
- gpt-load 代理（api.zero43.top/v1）拒绝当前 LLM_API_KEY：`{"code":"invalid_access_key","message":"Invalid access key."}`
- 现象链：backfill-policy-stage 全部 400（`you have no active step plan subscription`，step-5-preview 模型）→ GET /v1/models 也报 invalid_access_key
- FinHot/.env 与 harness-demo/.env 的 key 相同且都失效
- 影响：LLM 步骤（两次评分、direction/policy_stage、写稿）全部失败；采集不受影响；worker 持续入库但精选为空
- 已停：ps-backfill 容器（避免 400 空转），key 修复后补跑 `scripts/backfill-policy-stage.ts --batch 20`

**待 key 修复后的动作**
1. 更新 FinHot/.env 的 LLM_API_KEY（必要时换 LLM_MODEL 为代理当前可用模型，先 GET /v1/models 核实）
2. `sudo docker compose up -d --force-recreate worker api`（重新读 env）
3. 重启回填：`sudo docker compose run -d --name ps-backfill --no-deps setup node scripts/backfill-policy-stage.ts --batch 20`（~1830+ 行，1-3 小时，白天单线程）
4. 进入 3 天观察（Day 1/2/3 每日一次）：新源采集成功率（≥90%）、政策类占比、policy_stage 覆盖率（selected 的 policy_regulation，≥90%）、direction 失败率（重试后 <3%）、token 成本（预算 +40~80 条/天，超则源级停用）
5. 观察达标后进入 Task 6（gold 重标工作表，含人工门禁）
