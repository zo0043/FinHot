/**
 * 一次性回填（T0.5）：为历史上已打分的文章计算方向（反事实台账），v2 口径（0041：horizon + confidence）。
 *
 * 目标总体：每个 article_id 的最新 analyses 行，其中 score IS NOT NULL 且尚无台账行
 *（含 v1 时代 analyses.direction 有值的入选行——台账是方向数据的正典存储，用 v2 统一重判）。
 * t0 = 该 analyses 行的 created_at（历史 t0）；当时不存在市场上下文，input_snapshot 如实记 market_ctx=null。
 * 失败不中断：单行 catch 后照常插入 direction_status='failed' 行（与 analyze.ts 口径一致）。
 * 写入幂等：prediction_ledger.analyses_id UNIQUE，ON CONFLICT DO NOTHING。
 *
 * 用法（setup 容器内带 .env 凭据，Node 22）：
 *   docker compose run --rm --no-deps --entrypoint node setup scripts/backfill-direction.ts --dry-run
 *   docker compose run --rm --no-deps --entrypoint node setup scripts/backfill-direction.ts --limit 50
 *   docker compose run --rm --no-deps --entrypoint node setup scripts/backfill-direction.ts
 * 限速 ~0.5 rps（每条 +2s 延迟，含调用时长实际更慢）。
 */
import { sql, closeDb } from "@aihot/backend/db"
import { judgeDirection } from "@aihot/backend/editorial/direction"
import { PROMPT_VERSIONS } from "@aihot/backend/editorial/analyze"
import { modelFor } from "@aihot/backend/editorial/models"

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const limitIdx = args.indexOf("--limit")
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 10_000_000

const targets = await sql`
  SELECT a.id AS analyses_id, a.article_id, s.name AS source, a.category, a.title_zh, a.summary_zh,
         a.tags, a.selected, a.created_at,
         COALESCE(NULLIF(a.title_zh, ''), ar.title) AS title
  FROM analyses a
  JOIN (
    SELECT article_id, max(id) AS max_id
    FROM analyses
    WHERE score IS NOT NULL
    GROUP BY article_id
  ) latest ON latest.max_id = a.id
  LEFT JOIN articles ar ON ar.id = a.article_id
  LEFT JOIN sources s ON s.id = ar.source_id
  WHERE NOT EXISTS (SELECT 1 FROM prediction_ledger l WHERE l.analyses_id = a.id)
  ORDER BY a.created_at
  LIMIT ${limit}
`

if (dryRun) {
  console.error(`[backfill-dry] targets=${targets.length}`)
  for (const t of targets.slice(0, 5)) {
    const d = t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at)
    console.error(`  ${d} ${t.article_id} ${String(t.title ?? "").slice(0, 40)}`)
  }
  await closeDb()
  process.exit(0)
}

const fallbackModel = await modelFor("direction")
let done = 0
let failed = 0
let nullFields = 0
for (const t of targets) {
  const t0 = t.created_at as Date
  const input = {
    title: String(t.title ?? ""),
    summary: String(t.summary_zh ?? ""),
    category: (t.category as string | null) ?? null,
    tags: (t.tags as string[]) ?? [],
    sourceName: t.source as string,
  }
  let d = null as Awaited<ReturnType<typeof judgeDirection>> | null
  try {
    d = await judgeDirection(input, { promptVersion: PROMPT_VERSIONS.directions, subject: "direction:backfill" })
  } catch (error) {
    console.log(JSON.stringify({ level: "warn", msg: "backfill 方向判断失败（照常记 failed）", articleId: t.article_id, error: String(error) }))
  }
  await sql`
    INSERT INTO prediction_ledger (
      analyses_id, article_id, t0, prompt_version, model, direction, direction_status, scope, horizon, confidence, published, input_snapshot
    ) VALUES (
      ${t.analyses_id}, ${t.article_id}, ${t0}, ${PROMPT_VERSIONS.directions}, ${d ? d.model : fallbackModel},
      ${d?.direction ?? "none"}, ${d ? "ok" : "failed"},
      ${d ? d.scope : []}, ${d?.horizon ?? null}, ${d?.confidence ?? null},
      ${t.selected}, ${JSON.stringify({
        title_zh: t.title_zh,
        summary_zh: t.summary_zh ? String(t.summary_zh).slice(0, 400) : null,
        category: t.category,
        tags: t.tags,
        source: t.source,
        prompt_version: PROMPT_VERSIONS.directions,
        model: d ? d.model : fallbackModel,
        market_ctx: null,
        prior_ctx: null,
      })}
    )
    ON CONFLICT (analyses_id) DO NOTHING
  `
  done++
  if (d === null) failed++
  if (d !== null && (d.horizon === null || d.confidence === null)) nullFields++
  if (done % 25 === 0) console.error(`[backfill] ${done}/${targets.length} (failed=${failed}, null_horizon_or_conf=${nullFields})`)
  await new Promise((r) => setTimeout(r, 2000))
}
console.error(`[backfill] done=${done} failed=${failed} null_horizon_or_conf=${nullFields} total=${targets.length}`)
await closeDb()
process.exit(0)
