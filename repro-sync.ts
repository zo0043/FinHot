import { syncMarketDaily } from "./packages/backend/src/market/daily"
import { tencentSource } from "./packages/backend/src/market/tencent"
import { ok, fail, stub } from "./packages/backend/src/test/http-stub"
import { tencentRank } from "./packages/backend/tests/fixtures/tencent"
import { env } from "./packages/backend/tests/helpers/env"
import { sql, close } from "./packages/backend/src/database"

const stubUrl = await stub()
env({
  TENCENT_BASE_URL: stubUrl,
  IFZQ_BASE_URL: stubUrl,
  QT_BASE_URL: stubUrl,
  EASTMONEY_BASE_URL: await fail("t2 限流"),
  EM_PUSH2_BASE_URL: await fail("t3 断连"),
  BACKFILL_DAYS: "60",
})
stub(ok(tencentRank()))
try {
  const { rows, errors } = await syncMarketDaily(tencentSource((u) => fetch(u), (u) => fetch(u), (u) => fetch(u)), { backfill: true })
  console.log("OK rows=", rows, "errors=", JSON.stringify(errors).slice(0, 300))
} catch (e: any) {
  console.log("THREW:", e.message.slice(0, 400))
  console.log(e.stack?.split("\n").slice(0, 14).join("\n"))
}
await close()
process.exit(0)
