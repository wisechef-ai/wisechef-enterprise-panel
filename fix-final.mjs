#!/usr/bin/env node
// Fix all remaining SQLite type errors: Date→string, .getTime(), .toISOString() on string, .execute()
import fs from 'fs';
import path from 'path';

const BASE = '/tmp/wisechef-sqlite-port/server/src';

function fix(rel, transforms) {
  const fp = path.join(BASE, rel);
  let c = fs.readFileSync(fp, 'utf8');
  const orig = c;
  for (const [from, to] of transforms) {
    if (typeof from === 'string') {
      if (!c.includes(from)) console.log(`  ⚠️  Pattern not found in ${rel}: ${from.slice(0,60)}...`);
      c = c.replaceAll(from, to);
    } else {
      c = c.replace(from, to);
    }
  }
  if (c !== orig) {
    fs.writeFileSync(fp, c);
    console.log(`✅ ${rel}`);
  } else {
    console.log(`⏭️  ${rel} (unchanged)`);
  }
}

// ── board-claim.ts (line 28): .toISOString() on number (Date.now()) ──
fix('board-claim.ts', [
  // Date.now() returns number, was used as timestamp — use ISO string instead
  [/Date\.now\(\)\.toISOString\(\)/g, 'new Date().toISOString()'],
  // Also fix any `const now = new Date()` then `now` used in .set() 
  // The issue is something like: Date.now().toISOString() — number has no toISOString
]);

// ── bootstrap.ts (line 70): .run() overload issue ──
fix('bootstrap.ts', [
  // The .run() call probably has type mismatch — cast to any
  ['.values({\n      id: randomUUID(),\n      companyId,', '.values({\n      id: randomUUID(),\n      companyId,'],
  // Actually, insert values probably has Date objects. Let me check...
]);

// ── routes/access.ts: .toISOString() on already-string, .getTime() on string, Date type ──
fix('routes/access.ts', [
  // .toISOString() on string → just use the string as-is
  [/(\w+)\.toISOString\(\)/g, (match, name) => {
    // If it's 'new Date(...)' we already handled it, if it's a field name, it's already string
    if (name === 'Date') return match; // new Date().toISOString() is fine
    // createdAt.toISOString() → createdAt (already string)
    return name;
  }],
  // .getTime() on string → new Date(field).getTime()
  [/(\w+(?:At|_at))\.getTime\(\)/g, 'new Date($1).getTime()'],
  // Type annotations: Date → string for returned fields  
  [/: Date;/g, ': string;'],
  [/as Date/g, 'as string'],
]);

// ── services/approvals.ts: Date assignments ──
fix('services/approvals.ts', [
  // decidedAt: new Date() patterns already caught but these might be in .set()
  // Pattern: `someField: new Date(),` where no At/at in name
  [/status: new Date\(\)\.toISOString\(\)/g, "status: new Date().toISOString()"],
  // Let me be more surgical — these are typically in .set({}) calls
  // Lines 56,57,122,123,153,154,176 all assign Date to timestamp fields
  // The fix-dates script should have caught these — must be non-standard names
]);

// ── services/costs.ts: TS2769 overload (lines 79-80, 105-106, 124-125, 183-184) ──
// These are likely SQL template literal type issues with gt/lt/gte/lte on text columns
// Need to see the actual code

// ── services/heartbeat.ts: Date, .execute(), string|Date ──
fix('services/heartbeat.ts', [
  // .execute() already fixed to .run() but might have second occurrence
  [/\.execute\(sql`/g, '.run(sql`'],
]);

// ── services/projects.ts (92,93): 'string' not assignable to 'Date' — interface type
// ── services/issues.ts (1367,1368): string not assignable to Date — return type

console.log('\n--- Now fixing Date assignments that my regex missed (using broader approach) ---');

// Broader approach: Replace ALL `new Date()` with `.toISOString()` in .set() and .values() contexts
// Also handle: `const now = new Date();` then `now` used directly
for (const rel of [
  'services/approvals.ts',
  'services/heartbeat.ts',
  'services/issues.ts',
  'services/costs.ts',
  'services/dashboard.ts',
]) {
  const fp = path.join(BASE, rel);
  let c = fs.readFileSync(fp, 'utf8');
  const orig = c;

  // Pattern: `someVar: someExpr` where someExpr is `new Date()` or `new Date(xxx)` not followed by .toISOString
  // Broader: catch ANY field assignment of Date object
  c = c.replace(/:\s*new Date\(\)(?![\.\)])/g, ': new Date().toISOString()');
  c = c.replace(/:\s*new Date\(([^)]+)\)(?!\.toISOString)/g, ': new Date($1).toISOString()');

  // Handle: `endedAt ?? new Date()` → `endedAt ?? new Date().toISOString()`
  c = c.replace(/\?\?\s*new Date\(\)(?!\.)/g, '?? new Date().toISOString()');

  // Handle: `condition ? new Date() : null` → `condition ? new Date().toISOString() : null`
  c = c.replace(/\?\s*new Date\(\)\s*:/g, '? new Date().toISOString() :');

  if (c !== orig) {
    fs.writeFileSync(fp, c);
    console.log(`✅ ${rel} (broad Date fix)`);
  }
}

console.log('\nDone with batch fixes. Remaining need manual attention.');
