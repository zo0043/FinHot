/**
 * 一次性回填：为历史上已打分但未判断方向的文章计算 direction（M1 反事实台账）。
 *
 * 目标总体：每个 article_id 的最新 analyses 行，其中 score IS NOT NULL AND direction IS NULL。
 * t0 = 该 analyses 行的 created_at（历史 t0；当时不存在市场上下文，input_snapshot 如实记 market_ctx=null）。
 *
 * 用法（repo root 下，Node 22）：
 *   DATABASE_URL=postgres://aihot:aihot@<ip>:5432/aihot \
 *   LLM_API_KEY=... LLM_BASE_URL=https://api.zero43.top/v1 \
 *     node scripts/backfill-direction.ts --dry-run
 *   ... node scripts/backfill-direction.ts --limit 50
 *   ... node scripts/backfill-direction.ts
 *
 * 限速 ~0.5 rps；写入幂等（prediction_ledger.analyses_id UNIQUE, ON CONFLICT DO NOTHING）。
 */
import { sql, close } from "@aihot/backend/database"
import { judgeDirection } from "@aihot/backend/editorial/direction"
import { DIRECTION_MODEL } from "@aihot/backend/editorial/models"
import { PROMPT_VERSIONS } from "@aihot/backend/editorial/analyze"

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const limitIdx = args.indexOf("--limit")
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 10_000_000

const targets = await sql`
  SELECT a.id AS analyses_id, a.article_id, a.source, a.category, a.title_zh,
         a.summary_zh, a.tags, a.selected, a.created_at
  FROM analyses a
  JOIN (
    SELECT article_id, max(id) AS max_id
    FROM analyses
    WHERE score IS NOT NULL AND direction IS NULL
    GROUP BY article_id
  ) latest ON latest.max_id = a.id
  WHERE NOT EXISTS (SELECT 1 FROM prediction_ledger l WHERE l.analyses_id = a.id)
  ORDER BY a.created_at
  LIMIT ${limit}
`

if (dryRun) {
  console.error(`[backfill-dry] targets=${targets.length}`)
  for (const t of targets.slice(0, 5)) {
    const d = t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at)
    console.error(`  ${d} ${t.article_id} ${String(t.title_zh ?? "").slice(0, 40)}`)
  }
  await close()
  process.exit(0)
}

let done = 0
let failed = 0
for (const t of targets) {
  const d = await judgeDirection(t.title_zh as string, t.summary_zh as string, t.category as string, (t.tags as string[]) ?? [], {
    articleId: t.article_id as string,
    source: t.source as string,
    t0: t.created_at as Date,
  })
  const t0 = t.created_at as Date
  await sql`
    INSERT INTO prediction_ledger (
      analyses_id, article_id, t0, prompt_version, model, direction, direction_status, scope, published, input_snapshot
    ) VALUES (
      ${t.analyses_id}, ${t.article_id}, ${t0}, ${PROMPT_VERSIONS.directions}, ${DIRECTION_MODEL},
      ${d?.direction ?? "none"}, ${d ? "ok" : "failed"},
      ${d ? d.scope.split(",").map((s: string) => s.trim()).filter(Boolean) : []},
      ${t.selected}, ${JSON.stringify({
        title_zh: t.title_zh,
        summary_zh: t.summary_zh ? String(t.summary_zh).slice(0, 400) : null,
        category: t.category,
        tags: t.tags,
        source: t.source,
        prompt_version: PROMPT_VERSIONS.directions,
        model: DIRECTION_MODEL,
        market_ctx: null,
        prior_ctx: null,
      })}
    )
    ON CONFLICT (analyses_id) DO NOTHING
  `
  done++
  if (d === null) failed++
  if (done % 10 === 0) console.error(`[backfill] ${done}/${targets.length} (failed=${failed})`)
  await new Promise((r) => setTimeout(r, 2000))
}
console.error(`[backfill] done=${done} failed=${failed}`)
await close()
process.exit(0)
