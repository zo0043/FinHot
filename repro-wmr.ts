import { writeMarketRows } from "./packages/backend/src/market/daily"
const rows = [
  { trade_date: new Date("2026-09-29T16:00:00Z"), index_key: "BKREPRO", close: 100.5, prev_close: 100, pct: 0.5, fetchedAt: new Date() },
]
try {
  await writeMarketRows(rows as any)
  console.log("RESULT: OK (no new fields, no error)")
} catch (e) {
  console.log("RESULT: FAIL ->", (e as Error).message)
  console.log((e as Error).stack?.split("\n").slice(0, 6).join("\n"))
}
process.exit(0)
