import "node:module";
import pg from "pg";

/**
 * Sync industry/sources.json into the `sources` table.
 *
 * `scripts/seed.ts` is insert-only, so runtime drift happens whenever a source
 * is enabled/disabled or re-tiered in the config after seeding (the framework's
 * seed does not delete or update rows). Run this from the setup container:
 *
 *   docker compose run --rm --no-deps --entrypoint node setup scripts/sync-sources.ts
 *
 * Only the config-owned columns are rewritten: enabled, tier, interval_minutes.
 * `next_fetch_at` is pulled forward so an enable/disable takes effect at once.
 */
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const cfg = (await import("../industry/sources.json", { with: { type: "json" } })).default as {
  sources: {
    id: string;
    enabled?: boolean;
    tier?: string;
    interval_minutes?: number;
  }[];
};

if (!Array.isArray(cfg.sources)) throw new Error("industry/sources.json: sources must be an array");

const enabled = cfg.sources.filter((s) => s.enabled !== false);
const disabled = cfg.sources.filter((s) => s.enabled === false);

console.log(`sources.json: ${cfg.sources.length} total, ${enabled.length} enabled, ${disabled.length} disabled`);

const result = await client.query(
  `UPDATE sources s SET
     enabled = c.enabled,
     tier = c.tier::source_tier,
     interval_minutes = c.interval_minutes,
     next_fetch_at = CASE WHEN c.enabled THEN now() ELSE next_fetch_at END
   FROM (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
        id text, enabled boolean, tier text, interval_minutes integer)) AS c
   WHERE s.id = c.id`,
  [JSON.stringify(cfg.sources.map((s) => ({
    id: s.id,
    enabled: s.enabled !== false,
    tier: s.tier ?? "T1_5",
    interval_minutes: s.interval_minutes ?? 30,
  })))],
);

console.log(`sources synced: ${result.rowCount}`);

const orphans = await client.query(
  `SELECT id FROM sources WHERE id NOT IN (SELECT jsonb_array_elements_text($1::jsonb))`,
  [JSON.stringify(cfg.sources.map((s) => s.id))],
);
if (orphans.rows.length > 0) console.log(`in DB but not in config (left untouched): ${orphans.rows.map((r) => r.id).join(", ")}`);

const missing = await client.query(
  `SELECT c.id FROM jsonb_to_recordset($1::jsonb) AS x(id text) c
   WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.id = c.id)`,
  [JSON.stringify(cfg.sources.map((s) => ({ id: s.id })))],
);
if (missing.rows.length > 0) console.log(`in config but not seeded (run seed.ts): ${missing.rows.map((r) => r.id).join(", ")}`);

const counts = await client.query(`SELECT enabled, count(*) FROM sources GROUP BY enabled ORDER BY enabled`);
for (const row of counts.rows) console.log(`  ${row.enabled ? "enabled" : "disabled"}: ${row.count}`);

await client.end();
