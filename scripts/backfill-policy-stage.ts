/**
 * 一次性回填（W3 政策化，0042）：为历史上已打分的文章补 policy_stage（政策生命周期阶段）。
 *
 * 目标总体：每个 article_id 的最新 analyses 行，score IS NOT NULL 且 policy_stage IS NULL。
 * direction 步的 prompt 已加 policy_stage 字段（directions.md 变更 → 新 prompt_version），
 * 历史回执全部失效 → 每条都是新调用；itemType 从 analyses.output.detail 读出（非 policy_regulation
 * 事件恒 null）。重跑断点可续：已收到回答的行按回执复用（不再产生新调用），失败的保持 NULL 下次续跑。
 * 单线程、断点可续（逐行落库，每批打印进度）；失败不中断：单行 catch 后跳过。
 *
 * 用法（setup 容器内带 .env 凭据，Node 24）：
 *   docker compose run --rm --no-deps --entrypoint node setup scripts/backfill-policy-stage.ts --dry-run
 *   docker compose run --rm --no-deps --entrypoint node setup scripts/backfill-policy-stage.ts --limit 50
 *   docker compose run --rm --no-deps --entrypoint node setup scripts/backfill-policy-stage.ts --batch 20
 * 一次性回填 ~1830+ 行，白天执行，预计 1-3 小时网关时间。限速 ~0.5 rps（每条 +2s 延迟，含调用时长实际更慢）。
 */
import { sql, closeDb } from "@aihot/backend/db"
import { judgeDirection } from "@aihot/backend/editorial/direction"
import { PROMPT_VERSIONS } from "@aihot/backend/editorial/analyze"

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const limitIdx = args.indexOf("--limit")
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 10_000_000
const batchIdx = args.indexOf("--batch")
const batch = batchIdx >= 0 ? Number(args[batchIdx + 1]) : 20

const targets = await sql`
  SELECT a.id AS analyses_id, a.article_id, s.name AS source, a.category, a.title_zh, a.summary_zh,
         a.tags, a.created_at, a.output->'detail'->>'itemType' AS item_type,
         COALESCE(NULLIF(a.title_zh, ''), ar.title) AS title
  FROM analyses a
  JOIN (
    SELECT article_id, max(id) AS max_id
    FROM analyses
    WHERE score IS NOT NULL AND policy_stage IS NULL
    GROUP BY article_id
  ) latest ON latest.max_id = a.id
  LEFT JOIN articles ar ON ar.id = a.article_id
  LEFT JOIN sources s ON s.id = ar.source_id
  ORDER BY a.created_at
  LIMIT ${limit}
`

if (dryRun) {
  console.error(`[backfill-dry] targets=${targets.length} batch=${batch}`)
  for (const t of targets.slice(0, 5)) {
    const d = t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at)
    console.error(`  ${d} ${t.article_id} ${String(t.title ?? "").slice(0, 40)}`)
  }
  await closeDb()
  process.exit(0)
}

let done = 0
let failed = 0
let staged = 0
for (let start = 0; start < targets.length; start += batch) {
  const chunk = targets.slice(start, start + batch)
  for (const t of chunk) {
    const input = {
      title: String(t.title ?? ""),
      summary: String(t.summary_zh ?? ""),
      category: (t.category as string | null) ?? null,
      tags: (t.tags as string[]) ?? [],
      sourceName: t.source as string,
      itemType: (t.item_type as string | null) ?? null,
    }
    let d = null as Awaited<ReturnType<typeof judgeDirection>>
    try {
      d = await judgeDirection(input, { promptVersion: PROMPT_VERSIONS.directions, subject: "policy-stage:backfill" })
    } catch (error) {
      console.log(JSON.stringify({ level: "warn", msg: "backfill 方向判断失败（policy_stage 保持 NULL，下次续跑）", articleId: t.article_id, error: String(error) }))
    }
    // 逐行落库（断点可续）：模型成功才写（失败/不可用保持 NULL）；非政策行写 NULL 是同一口径。
    if (d !== null) {
      await sql`UPDATE analyses SET policy_stage = ${d.policy_stage} WHERE id = ${t.analyses_id}`
      if (d.policy_stage !== null) staged++
    }
    done++
    if (d === null) failed++
    if (done % 25 === 0) console.error(`[backfill] ${done}/${targets.length} (failed=${failed}, staged=${staged})`)
    await new Promise((r) => setTimeout(r, 2000))
  }
  console.error(`[backfill] batch ${Math.floor(start / batch) + 1} 落库 done=${done}/${targets.length} (failed=${failed}, staged=${staged})`)
}
console.error(`[backfill] done=${done} failed=${failed} staged=${staged} total=${targets.length}`)
await closeDb()
process.exit(0)
