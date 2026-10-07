# FinHot 行情模块改造 — 开发交接（Handoff）

**日期**：2026-10-07
**状态**：✅ 已完成并部署（commit `a058488` + `aa766a8`，已推 origin/main，镜像重建、worker/api 已重启）。两项待办见 §5。
**前序**：旧行情数据源（东财 push2 ulist）对宿主 502、节假日返回空，`market_daily` 历史 0 行，模块从未写成功；`sectors.ts` 18 个 BK 代码 14 个错配。

---

## 0. 一句话现状

行情主源换成**腾讯财经**（免费、无鉴权、按板块名匹配），东财降为限速回退；`market_daily` 自 07-02 起 146 行（09-30 的 20 行 + 指数 60 日回补 128 行）。10-08（周四）15:35 是新代码首次生产真实跑，**跑完要验证**（§5-2）。

## 1. 环境（先做这些）

```bash
# node 必须用 v22（系统默认是 v12）
export PATH=/home/ubuntu/.nvm/versions/node/v22.23.2/bin:$PATH

# ⚠️ 宿主重启过，db 容器 IP 会变（10-07：172.20.0.4 → 172.20.0.5）
# 宿主侧连接前先取当前 IP：
sudo docker inspect aihot-db-1 | grep IPAddress
# 容器内永远用 compose 主机名 db:5432（不受影响）

# 全量测试（共享测试库 finhot_ci）
DATABASE_URL=postgres://aihot:aihot@<当前IP>:5432/finhot_ci npm test
# 当前基线：166/169 pass。3 个失败为存量（非行情）：
#   - analyze "a selected item..." / "a near-selected item..."（评分阈值漂移）
#   - alerts "an outage is announced once..."（recovery 分支）
#   已在 HEAD（stash 验证）上同样红，排查时别误归因行情改动。
```

**关键路径**：
- 主 checkout：`/home/ubuntu/app/FinHot`（所有行情代码都在 main，无 worktree）
- 行情模块：`packages/backend/src/market/`（tencent.ts 新主源 / daily.ts 编排 / eastmoney.ts 回退）
- 板块配置：`industry/sectors.ts`（18 板块 × indexKey，每个有核对注释）
- 测试：`tests/tencent.test.ts`（解析/匹配/DI）、`tests/market.test.ts`（ulist + indexKey 唯一性不变式）
- 脚本：`scripts/backfill-market.ts`、`scripts/verify-market-xiaoshi.py`

## 2. 数据流（生产）

```
ops.market-daily cron（每日 15:35 北京）
  └─ syncMarketDaily()                    packages/backend/src/market/daily.ts
       ├─ ① tencent（主源，4 请求/日）      market/tencent.ts
       │    proxy.finance.qq.com getRank board_type=hy（31 申万一级）
       │    + board_type=gn（200+ 概念）+ web.ifzq.gtimg.cn 日K（sh000300/sh000001 各 65 根）
       │    按板块【名字】匹配（rank 列表 pt 代码不对外，别存代码）
       ├─ ② eastmoney-kline 回退           market/eastmoney.ts（push2his，3.5s/请求限速）
       └─  eastmoney-ulist 回退           push2 ulist（当前 502，待 10-08 观察）
       → writeMarketRows() 幂等 upsert → market_daily(trade_date, index_key)
       → lastWritten >= tradeDate 则 skip（节假日/重复跑）
```

**映射取舍（owner 已确认，别改）**：
- 白酒/食品饮料 → BK0438 食品饮料一级板（非二级 BK0896，中长线口径稳）
- 券商/非银 → BK1203 非银金融一级板（非证券Ⅱ BK0473，与主源腾讯非银金融同口径）
- 腾讯侧 3 个用概念板（比申万一级细）：半导体/算力→芯片概念、AI 应用→人工智能、贵金属→黄金概念；其余 15 个用申万一级

## 3. 脚本用法

```bash
# 手动同步一次（= cron 干的事；休市日会 skipped=true）
DATABASE_URL=postgres://aihot:aihot@<IP>:5432/aihot node scripts/backfill-market.ts --sync

# 回补近 60 交易日（20 序列 × 3.5s 限速 ≈ 3 分钟，幂等可重跑）
DATABASE_URL=... node scripts/backfill-market.ts --days 60

# xiaoshi 等权收益交叉校验（先 pip install pyarrow；CSV 从生产库导出）
sudo docker exec aihot-db-1 psql -U aihot -d aihot -Atc \
  "select trade_date, index_key, pct from market_daily order by 1,2" > /tmp/market_daily.csv
python3 scripts/verify-market-xiaoshi.py /tmp/market_daily.csv
# 验收线：中位|偏差| < 0.8pp 且 >1.5pp 占比 < 50%。10-07 实测中位 0.39pp PASS
```

## 4. 验收结果（10-07 休市日实测）

| 项 | 结果 | 验收线 |
|---|---|---|
| 链一致性（5d/20d 复利 vs 首尾价） | 最大偏差 0.014 / 0.032pp | <0.3pp |
| 双端点比对（qt 实时快照 vs 库内 09-30 收盘） | 0 偏差 | <0.01% |
| xiaoshi 交叉（18 板块全命中） | 中位 0.39pp，max 1.33pp，0 组超 1.5pp | PASS |
| 容器内端到端 | 新镜像 `--sync` 正确识别休市 skip，1.9s | — |
| 测试 | 166/169（3 存量红，见 §1） | 行情相关全绿 |

## 5. 待办（下次开工先看这里）

1. **板块 60 日历史回补**：`push2his.eastmoney.com` 对本机 IP 是 **TLS 层硬封**（握手后 EOF，换 UA/Referer/HTTP2 均无效，10-07 实测）。限流通常几小时~1 天解除。先探：`curl -s "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=90.BK0438&klt=101&fqt=0&end=20500101&lmt=5&fields1=f3&fields2=f51,f53"` 返回 JSON 即解除 → 跑 §3 的 `--days 60`。
2. **10-08（周四）15:35 首次生产真实跑验证**：
   - `job_runs` 当日 market.daily `status=ok`、summary `written=20`、`source=tencent`
   - `market_daily` 新增 2026-10-08 共 20 行
   - push2 ulist 502 是否恢复（决定回退源可用性；不恢复也不影响主链路）
   - `market.daily-missing` 告警应自动 close

## 6. 踩坑记录（硬知识）

- **postgres.js 把 date 列解成 Date 对象**：`"2026-09-30" <= Date` 走 Number 强转 = NaN，条件静默失效（曾致 skip 永不触发、同一天反复重写）。比较前先归一：`typeof d === "string" ? d.slice(0,10) : new Date(d).toISOString().slice(0,10)`（`syncMarketDaily` 的 lastWritten 已做）。
- **池 idle_timeout=600000**：一次性脚本主路径结束必须 `process.exit(0)`，否则挂 10 分钟才退；且 `timeout N node x.ts | tail` 管道会掩盖挂起（tail 提前退 0）。
- **改 `sectors.ts` 的 indexKey 必须先用东财 searchapi 复核**：`curl "https://searchapi.eastmoney.com/api/suggest/get?input=BKxxxx&type=14"` 看返回 Name。当初 18 个码 14 个错（凭记忆写）。
- **腾讯按名匹配**：板块名必须与 rank API 返回的 `name` 完全一致；改 `SECTOR_TENCENT` 映射后先跑 `--sync` 看 `missing` 数组。
- 东财 push2his 对同 IP 限流激进：成功 1 次后可能整段 TLS 封（非 HTTP 错误码）；代码里 3.5s 限速是针对"活着"的限流，封了会静默失败走下一级回退。
- `market_daily` 的 `pct` 单位是 %（两位小数），不是小数。
- xiaoshi 交叉校验的 parquet 字段是 `symbol`（不是 stock_code），taxonomy_id 可能是 `THS` 或 `xiaoshi-sector-legacy`（脚本两边都认）。
