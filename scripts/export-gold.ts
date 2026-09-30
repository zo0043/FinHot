// gold 候选导出：从最近 N 天的真实料池分层抽样，产出 .data/gold-candidates.jsonl，供人工标注
// "该选/不该选"（格式见 docs/selection.md）。分层 = 信源分级 × 分数段（低于门槛/门槛附近/超过+10）
// × category 前 5 大类，尽量均匀——gold 的偏差会让阈值校准跟着偏。
//
// 注意：gold.decision 预填的是当前系统的判断（analyses.selected），不是人工标注！标注时逐条核对。
// 标好的文件另存为 .data/gold.jsonl，跑 scripts/eval-selection.ts 对比新旧门槛。
// Usage: node --env-file=.env scripts/export-gold.ts [--n 200] [--days 30] [--seed 7] [--out .data/gold-candidates.jsonl]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { SELECTION } from "@aihot/industry/selection";

const { values } = parseArgs({
  options: {
    n: { type: "string", default: "200" },
    days: { type: "string", default: "30" },
    seed: { type: "string", default: "7" },
    out: { type: "string", default: ".data/gold-candidates.jsonl" },
  },
});
const target = Number(values.n);

interface Row {
  article_id: string;
  title: string;
  title_zh: string | null;
  published_at: Date | null;
  source_name: string;
  source_kind: string;
  source_tier: string;
  first_party: boolean;
  language: string | null;
  body_text: string | null;
  score: number;
  category: string | null;
  selected: boolean;
}
const rows = await sql<Row[]>`
  SELECT ar.id AS article_id, ar.title, a.title_zh, ar.published_at, s.name AS source_name, s.kind AS source_kind,
         s.tier AS source_tier, s.first_party AS first_party, ar.language, ar.body_text, a.score, a.category, a.selected
  FROM analyses a JOIN articles ar ON ar.id = a.article_id JOIN sources s ON s.id = ar.source_id
  WHERE a.created_at > now() - ${Number(values.days)} * interval '1 day'
    AND a.relevance = 'pass' AND a.score IS NOT NULL AND ar.body_text IS NOT NULL AND length(trim(ar.body_text)) >= 80
  ORDER BY ar.discovered_at DESC LIMIT 2000`;

// 分数段：低于门槛 / 门槛~门槛+10（校准最吃劲的一段）/ 超过门槛+10。分层名写进 samplingStratum。
function stratum(r: Row): string {
  const thr = SELECTION.thresholds[r.source_tier] ?? 0;
  const band = r.score < thr ? "below" : r.score < thr + 10 ? "near" : "above";
  const cat = r.category ?? "none";
  return `${r.source_tier}/${band}/${cat}`;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904221) >>> 0) / 2 ** 32);
}
const rand = rng(Number(values.seed));

const strata = new Map<string, Row[]>();
for (const r of rows) {
  const key = stratum(r);
  if (!strata.has(key)) strata.set(key, []);
  strata.get(key)!.push(r);
}
for (const bucket of strata.values()) bucket.sort((a, b) => rand() - 0.5);

// Round-robin：每层轮一张，层多时先让层内最接近代表性的走，直到凑满 target。
const picked: Row[] = [];
const order = [...strata.keys()].sort((a, b) => (strata.get(b)!.length - strata.get(a)!.length) || a.localeCompare(b));
const cursors = order.map(() => 0);
while (picked.length < target) {
  let took = false;
  for (let i = 0; i < order.length && picked.length < target; i++) {
    const bucket = strata.get(order[i]!)!;
    if (cursors[i]! < bucket.length) {
      picked.push(bucket[cursors[i]++]!);
      took = true;
    }
  }
  if (!took) break;
}

const lines = picked.map((r, i) => JSON.stringify({
  caseId: `export-${String(i + 1).padStart(3, "0")}`,
  material: {
    title: r.title_zh ?? r.title,
    originalTitle: r.title,
    publishedAt: r.published_at?.toISOString() ?? null,
    sourceName: r.source_name,
    bodyZh: null,
    bodyOriginal: r.body_text,
  },
  sourceFacts: { sourceKind: r.source_kind, sourceTier: r.source_tier, firstParty: r.first_party, language: r.language },
  samplingContext: {
    benchmarkSplit: "development",
    samplingStratum: `${stratum(r)}|score=${r.score}|system=${r.selected ? "select" : "reject"}`,
  },
  // 预填的是系统当前判断：人工标注时请把 decision 改成自己的结论（select / reject / either 两可）
  gold: { decision: r.selected ? "select" : "reject" },
}));

const header = [
  "// gold 候选：由 scripts/export-gold.ts 从真实料池分层导出，逐条把 gold.decision 改成你自己的结论。",
  "// decision: select 该选 / reject 不该选 / either 两可（不计入准确率）。字段说明见 docs/selection.md。",
  "// 标完另存 .data/gold.jsonl，跑 node --env-file=.env scripts/eval-selection.ts --gold .data/gold.jsonl。",
];
const out = path.resolve(REPO_ROOT, values.out!);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, [...header, ...lines].join("\n") + "\n");
console.log(`候选 ${lines.length} 条（料池 ${rows.length} 条，${strata.size} 层）→ ${out}`);
const byTier = new Map<string, number>();
for (const r of picked) byTier.set(r.source_tier, (byTier.get(r.source_tier) ?? 0) + 1);
console.log(`分级分布：${[...byTier].map(([t, n]) => `${t}=${n}`).join("，")}`);
await closeDb();
