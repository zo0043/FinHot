// 一次性回补脚本：market_daily 历史从未写过（表长期 0 行），这里回补最近 N 个交易日（默认 60）× 20 个序列
// （18 板块 + 2 大盘指数）。数据源：东财 push2his K 线（lmt=N+2，3.5s 间隔防同 IP 限流断连）。
// 写入走 writeMarketRows（与每日 job 同一个幂等 upsert）。
//
// 用法（推荐容器内跑，DATABASE_URL 自动解析；宿主 IP 可能被 push2his 限流）：
//   docker compose run --rm --no-deps --entrypoint node setup scripts/backfill-market.ts --days 60
// 手动触发一次每日同步（走 腾讯→push2his→push2 三级回退，与 job 同逻辑）：
//   docker compose run --rm --no-deps --entrypoint node setup scripts/backfill-market.ts --sync
// 宿主直接跑（需显式给 DATABASE_URL）：
//   DATABASE_URL=postgres://aihot:***@172.20.0.4:5432/aihot node scripts/backfill-market.ts --days 60
//
// 每次运行都会打印"代码→板块名"核对表（push2his 返回的 data.name），改动 indexKey 后先跑这个再回补。

import { SECTORS } from "../industry/sectors.ts";
import { guardedFetch } from "../packages/backend/src/lib/http-fetch.ts";
import { syncMarketDaily, writeMarketRows, type MarketRow } from "../packages/backend/src/market/daily.ts";
import { toSecid } from "../packages/backend/src/market/eastmoney.ts";

const KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get";
const INTERVAL_MS = 3500; // push2his 同 IP 限流激进，必须限速

function arg(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return dflt;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v) || v <= 0) throw new Error(`--${name} 需要正整数，收到: ${process.argv[i + 1]}`);
  return v;
}

interface Bar {
  date: string;
  close: number;
}

async function fetchKline(secid: string, lmt: number): Promise<{ name: string | null; bars: Bar[] }> {
  const url = `${KLINE_URL}?secid=${encodeURIComponent(secid)}&klt=101&fqt=0&end=20500101&lmt=${lmt}&fields1=f3&fields2=f51,f53`;
  const res = await guardedFetch(url, { timeoutMs: 15000, route: "egress" });
  const payload = JSON.parse(await res.text()) as { data?: { name?: unknown; klines?: unknown } };
  const klines = payload.data?.klines;
  const bars: Bar[] = [];
  if (Array.isArray(klines)) {
    for (const line of klines) {
      if (typeof line !== "string") continue;
      const [date, close] = line.split(",");
      const c = Number(close);
      if (!date || !Number.isFinite(c) || c <= 0) continue;
      bars.push({ date, close: c });
    }
  }
  return { name: typeof payload.data?.name === "string" ? payload.data.name : null, bars };
}

async function backfill(days: number): Promise<void> {
  const now = new Date();
  const allRows: MarketRow[] = [];
  const nameCheck: Array<{ key: string; secid: string; name: string | null; bars: number; range: string }> = [];
  let failed = 0;

  for (const sector of SECTORS) {
    const secid = toSecid(sector.indexKey);
    const rowKey = sector.indexKey; // market_daily.index_key 统一存 indexKey（BK 代码 / sh 代码）
    try {
      const { name, bars } = await fetchKline(secid, days + 2);
      // 第一根 bar 没有昨收，从第二根开始
      for (let i = 1; i < bars.length; i++) {
        allRows.push({
          index_key: rowKey,
          trade_date: bars[i].date,
          close: Math.round(bars[i].close * 100) / 100,
          prev_close: Math.round(bars[i - 1].close * 100) / 100,
          pct: Math.round((bars[i].close / bars[i - 1].close - 1) * 10000) / 100,
        });
      }
      nameCheck.push({
        key: sector.key,
        secid,
        name,
        bars: bars.length,
        range: bars.length ? `${bars[0].date} ~ ${bars[bars.length - 1].date}` : "无数据",
      });
    } catch (err) {
      failed++;
      console.warn(`[backfill] ${sector.key} (${secid}) 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (sector.key !== SECTORS.at(-1)?.key) await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  // 核对表（验收项：BK 代码 name 与预期一致；改过 indexKey 后先看这张表）
  console.log("\n== 代码→板块名 核对表 ==");
  for (const c of nameCheck) {
    const sector = SECTORS.find((s) => s.key === c.key)!;
    console.log(`  ${c.key.padEnd(14)} ${c.secid.padEnd(12)} ${String(c.name ?? "?").padEnd(12)} 预期: ${sector.label}  bars=${c.bars} (${c.range})`);
  }

  if (failed > 3) throw new Error(`${failed}/20 个序列抓取失败，放弃回补（先解决限流/网络再跑）`);
  if (!allRows.length) throw new Error("没有任何可写行");

  allRows.sort((a, b) => (a.trade_date < b.trade_date ? -1 : a.trade_date > b.trade_date ? 1 : a.index_key.localeCompare(b.index_key)));
  const written = await writeMarketRows(allRows, now);
  const dates = [...new Set(allRows.map((r) => r.trade_date))].sort();
  console.log(`\n[backfill] 写入 ${written} 行（${failed} 个序列失败）；交易日 ${dates.length} 天: ${dates[0]} ~ ${dates.at(-1)}`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--sync")) {
    const summary = await syncMarketDaily(new Date());
    console.log("[sync]", JSON.stringify(summary));
    // postgres 池 idle_timeout=600s 会把事件循环挂住 10 分钟才自然退出，一次性脚本显式退出
    process.exit(0);
  }
  await backfill(arg("days", 60));
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] 失败:", err);
  process.exit(1);
});
