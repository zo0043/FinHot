// 一次性回补脚本（curl 变体）：与 scripts/backfill-market.ts 完全同逻辑，仅把 fetch 换成 curl 子进程。
// 背景：2026-10-09 实测东财 push2his 的 WAF 会按 TLS 指纹掐掉 node/undici 客户端（"other side closed"），
// curl 正常——所以这个变体用 curl 取 K 线，宿主直跑。
//
// 用法（宿主，Node 22）：
//   DATABASE_URL=postgres://aihot:***@172.20.0.5:5432/aihot node scripts/backfill-market-curl.ts --days 60
// 幂等：writeMarketRows 与每日 job 同一个 upsert，重跑安全。

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SECTORS } from "../industry/sectors.ts";
import { writeMarketRows, type MarketRow } from "../packages/backend/src/market/daily.ts";
import { toSecid } from "../packages/backend/src/market/eastmoney.ts";

const pExecFile = promisify(execFile);
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
  const { stdout } = await pExecFile("curl", ["-s", "--max-time", "15", url], { maxBuffer: 4 * 1024 * 1024 });
  const payload = JSON.parse(stdout) as { data?: { name?: unknown; klines?: unknown } };
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
    const rowKey = sector.indexKey;
    try {
      const { name, bars } = await fetchKline(secid, days + 2);
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

backfill(arg("days", 60)).then(() => process.exit(0)).catch((err) => {
  console.error("[backfill] 失败:", err);
  process.exit(1);
});
