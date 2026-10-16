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
1. ~~更新 key~~ → 实际解决（2026-10-16 10:30）：key 本身可用，是 step-5-preview 订阅失效。按用户指示切 **LLM_MODEL=deepseek-v4.1-flash**（实测：直连 https、response_format json_object 兼容、reasoning 无法关闭但 max_tokens 给足后 content 正常）；删 LLM_EXTRA_JSON（thinking flag 对该模型无效）；direction maxTokens 300→1024 / timeout 30s→60s（commit 0761881，reasoning 会先吃预算）；镜像重建 + force-recreate

## Day 1（2026-10-16 上午，模型切换后）

- 采集：10-15 14:57 UTC 恢复起连续无断流（每 15 分钟一波，含 659 条首轮）
- 评分：切换后恢复——recreate 后 10 分钟 5 条新 analyses；此前 10 小时分析为空是旧 worker 在坏 key 400 上卡住（head-of-line），非采集问题
- 回填：ps-backfill 运行中，40/2534，failed=0（~2-3 条/分钟，预计 15h 跑完；前 20 条非政策类 stage=null 正常）
- 待观察：policy_stage 实际覆盖（等回填跑到政策类文章）、deepseek 在长提示词评分下的延迟/质量（对比旧模型分数分布）


