#!/usr/bin/env node
/**
 * Run all SQL migrations from backend/db/migrations and backend/migrations.
 * Uses the same DB pool as the app (from src/config/db).
 * Migrations run in filename order; each file runs as a single batch.
 *
 * Skipped: 2026-02-tier-names-consistency — renames Nova→Beacon, Luminar→Crest, Valiant→Ascend.
 * Canonical names are Ather, Nova, Luminar, Valiant, Echelon (see db/TIER_SYSTEM_TRUTH.md).
 */
const path = require('path');
const fs = require('fs');

const backendRoot = path.join(__dirname, '..');
const pool = require(path.join(backendRoot, 'src/config/db')).getPool();

const dirs = [
  path.join(backendRoot, 'db/migrations'),
  path.join(backendRoot, 'migrations'),
];

async function run() {
  const files = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const names = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
    for (const name of names) {
      files.push({ dir, name });
    }
  }
  files.sort((a, b) => {
    const pathA = path.join(a.dir, a.name);
    const pathB = path.join(b.dir, b.name);
    return pathA.localeCompare(pathB);
  });

  console.log(`Found ${files.length} migration file(s).`);
  let ok = 0;
  let fail = 0;
  const SKIP_PATTERN = 'tier-names-consistency'; // Never run: overwrites Nova/Luminar/Valiant with Beacon/Crest/Ascend
  for (const { dir, name } of files) {
    const filePath = path.join(dir, name);
    if (name.includes(SKIP_PATTERN)) {
      console.log(`  SKIP ${path.relative(backendRoot, filePath)} (excluded: wrong tier names)`);
      continue;
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(backendRoot, filePath);
    try {
      await pool.query(sql);
      console.log(`  OK   ${relPath}`);
      ok++;
    } catch (err) {
      console.error(`  SKIP ${relPath} (${err.message})`);
      fail++;
    }
  }
  console.log(`\nDone: ${ok} applied, ${fail} skipped (already applied or schema mismatch).`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
