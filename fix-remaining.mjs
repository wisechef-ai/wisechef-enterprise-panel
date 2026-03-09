#!/usr/bin/env node
// Fix remaining SQLite port issues:
// 1. Date assignments that my regex missed (conditional assignments, ternaries)
// 2. selectDistinctOn → selectDistinct
// 3. .execute() → .run() / .all()
// 4. Date type annotations in interfaces
// 5. .getTime() on now-string fields
// 6. .toISOString() on already-string fields (remove double conversion)
import fs from 'fs';
import path from 'path';

const SERVER_SRC = '/tmp/wisechef-sqlite-port/server/src';

function readFile(rel) {
  return fs.readFileSync(path.join(SERVER_SRC, rel), 'utf8');
}
function writeFile(rel, content) {
  fs.writeFileSync(path.join(SERVER_SRC, rel), content);
}

// ============ bootstrap.ts: @wisechef/db → @paperclipai/db ============
{
  let c = readFile('bootstrap.ts');
  c = c.replace(/@wisechef\/db/g, '@paperclipai/db');
  writeFile('bootstrap.ts', c);
  console.log('✅ bootstrap.ts — fixed imports');
}

// ============ index.ts: remove old PG exports, simplify migration logic ============
{
  let c = readFile('index.ts');
  // Remove missing imports
  c = c.replace(/\s*ensurePostgresDatabase,?\n?/g, '\n');
  c = c.replace(/\s*reconcilePendingMigrationHistory,?\n?/g, '\n');
  c = c.replace(/\s*formatDatabaseBackupResult,?\n?/g, '\n');
  c = c.replace(/\s*runDatabaseBackup,?\n?/g, '\n');
  c = c.replace(/\s*type MigrationHistoryReconcileResult,?\n?/g, '\n');
  c = c.replace(/\s*type MigrationBootstrapResult,?\n?/g, '\n');
  c = c.replace(/\s*type RunDatabaseBackupOptions,?\n?/g, '\n');
  c = c.replace(/\s*type RunDatabaseBackupResult,?\n?/g, '\n');
  writeFile('index.ts', c);
  console.log('✅ index.ts — removed old PG imports');
}

// ============ selectDistinctOn → selectDistinct (PG-only API) ============
for (const rel of ['services/activity.ts', 'services/costs.ts', 'services/sidebar-badges.ts']) {
  let c = readFile(rel);
  // selectDistinctOn(fields, selector) → selectDistinct(selector)
  // Pattern: .selectDistinctOn([fields], { ... })  →  .selectDistinct({ ... })
  c = c.replace(/\.selectDistinctOn\(\[([^\]]*)\],/g, '.selectDistinct(');
  writeFile(rel, c);
  console.log(`✅ ${rel} — selectDistinctOn → selectDistinct`);
}

// ============ .execute() → direct call (SQLite transactions are sync) ============
for (const rel of ['services/heartbeat.ts']) {
  let c = readFile(rel);
  // tx.execute(sql`...`) → tx.run(sql`...`)
  c = c.replace(/\.execute\(sql`/g, '.run(sql`');
  writeFile(rel, c);
  console.log(`✅ ${rel} — .execute() → .run()`);
}

// ============ Remaining Date issues: comprehensive fix ============
// Find every .ts file with Date assignment errors
const allTsFiles = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) allTsFiles.push(p);
  }
}
walk(SERVER_SRC);

let totalDateFixes = 0;
for (const fp of allTsFiles) {
  let c = fs.readFileSync(fp, 'utf8');
  const orig = c;

  // Fix: someField: someDate (where someDate is new Date(...) but not caught by first pass)
  // Pattern: decidedAt: new Date(), etc. — already-ISO fields getting re-wrapped
  // Fix `.toISOString()` called on string values (double conversion from first pass)
  // e.g. `someField.toISOString()` where someField is now string
  // These show as: "Property 'toISOString' does not exist on type 'string'"
  
  // Fix: someVar.getTime() where someVar is now string → new Date(someVar).getTime()
  // Too context-dependent, handle per-file below

  // General: assignment `= new Date(xxx)` not followed by .toISOString()
  // where it feeds into a db .set() or .values() call
  c = c.replace(/(\w+(?:At|_at))\s*:\s*new Date\(\)(?!\.)/g, '$1: new Date().toISOString()');
  c = c.replace(/(\w+(?:At|_at))\s*:\s*new Date\(([^)]+)\)(?!\.)/g, '$1: new Date($2).toISOString()');

  if (c !== orig) {
    fs.writeFileSync(fp, c);
    totalDateFixes++;
  }
}
console.log(`✅ Additional Date fixes in ${totalDateFixes} files`);

console.log('\nDone — run tsc to check remaining errors');
