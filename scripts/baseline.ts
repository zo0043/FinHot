// 现状快照：category 覆盖率、按信源分级的分数分布、摘要长度分位、各源最近 N 天采集成功率。
// 只读：不写库、不调模型。P1 改动的"改前"基线就看它，改完再跑一次对比。
// Usage: node --env-file=.env scripts/baseline.ts [--days 7]
import { writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { SELECTION } from "@aihot/industry/selection";
import { beijingDate } from "@aihot/contracts/time";

const { values } = parseArgs({ options: { days: { type: "string", default: "7" } } });
const days = Number(values.days);

interface CoverageRow {
  total: number;
  with_category: number;
  with_summary: number;
  selected: number;
}
const [coverage] = await sql<CoverageRow[]>`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE category IS NOT NULL)::int AS with_category,
         count(*) FILTER (WHERE summary_zh IS NOT NULL AND summary_zh <> '')::int AS with_summary,
         count(*) FILTER (WHERE selected)::int AS selected
  FROM analyses WHERE created_at > now() - ${days} * interval '1 day'`;

interface TierScoreRow { tier: string; scores: (number | null)[] }
const tierScores = await sql<TierScoreRow[]>`
  SELECT s.tier, array_agg(a.score ORDER BY a.score) AS scores
  FROM analyses a JOIN articles ar ON ar.id = a.article_id JOIN sources s ON s.id = ar.source_id
  WHERE a.created_at > now() - ${days} * interval '1 day' AND a.score IS NOT NULL
  GROUP BY s.tier`;

interface SummaryLenRow { p25: number | null; p50: number | null; p75: number | null }
const [len] = await sql<SummaryLenRow[]>`
  SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY length(summary_zh)) AS p25,
         percentile_cont(0.50) WITHIN GROUP (ORDER BY length(summary_zh)) AS p50,
         percentile_cont(0.75) WITHIN GROUP (ORDER BY length(summary_zh)) AS p75
  FROM analyses
  WHERE created_at > now() - ${days} * interval '1 day' AND summary_zh IS NOT NULL AND summary_zh <> ''`;

interface SourceHealthRow { name: string; ok: number; failed: number; last_ok: Date | null }
const sourceHealth = await sql<SourceHealthRow[]>`
  SELECT s.name, count(*) FILTER (WHERE f.status = 'ok')::int AS ok, count(*) FILTER (WHERE f.status = 'failed')::int AS failed, max(f.started_at) FILTER (WHERE f.status = 'ok') AS last_ok
  FROM fetch_runs f JOIN sources s ON s.id = f.source_id
  WHERE f.started_at > now() - ${days} * interval '1 day' AND s.enabled
  GROUP BY s.name ORDER BY s.name`;

const pct = (a: number, b: number) => (b === 0 ? "—" : `${((a / b) * 100).toFixed(1)}%`);
const lines: string[] = [
  `# FinHot 现状快照（${beijingDate(Date.now())}，最近 ${days} 天）`,
  "",
  `有分析记录 ${coverage.total} 条，其中入选 ${coverage.selected} 条。`,
  "",
  `## category 覆盖率：${pct(coverage.with_category, coverage.total)}（${coverage.with_category}/${coverage.total}）`,
  "",
  "## 分数分布（按信源分级的门槛分档）",
  "",
  "| 分级 | 门槛 | 条数 | 低于门槛 | 门槛附近 | 超过门槛 +10 |",
  "|---|---|---|---|---|---|",
];
for (const { tier, scores } of tierScores) {
  const thr = SELECTION.thresholds[tier];
  const vals = scores.filter((s): s is number => s != null);
  const near = vals.filter((s) => s >= thr && s < thr + 10).length;
  const above = vals.filter((s) => s >= thr + 10).length;
  const below = vals.length - near - above;
  lines.push(`| ${tier} | ${thr} | ${vals.length} | ${below} | ${near} | ${above} |`);
}
const quartiles = len ? [len.p25, len.p50, len.p75].map((v) => (v == null ? "—" : Math.round(v))) : null;
lines.push(
  "",
  `## 摘要长度分位（字符）：p25=${quartiles?.[0] ?? "—"}，p50=${quartiles?.[1] ?? "—"}，p75=${quartiles?.[2] ?? "—"}（共 ${coverage.with_summary} 条有摘要）`,
  "",
  "## 采集成功率（启用源，同一源失败次数为 0 时不列出）",
  "",
  "| 信源 | 成功 | 失败 |",
  "|---|---|---|",
);
for (const s of sourceHealth) {
  if (s.ok || s.failed) lines.push(`| ${s.name} | ${s.ok} | ${s.failed} |`);
}
const doc = `${lines.join("\n")}\n`;
const out = path.join(REPO_ROOT, "docs", `baseline-${beijingDate(Date.now())}.md`);
writeFileSync(out, doc);
console.log(doc);
console.log(`已写入 ${out}`);
await closeDb();
