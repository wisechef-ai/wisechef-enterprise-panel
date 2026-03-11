#!/usr/bin/env node
// Fix all `new Date()` assignments to timestamp columns → `new Date().toISOString()`
// Also fix Date comparisons and Date method calls on now-string fields
import fs from 'fs';
import path from 'path';

const SERVER_SRC = 'server/src';

function walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) results.push(full);
  }
  return results;
}

let totalFixed = 0;

for (const filePath of walkDir(SERVER_SRC)) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Pattern 1: `fieldName: new Date()` → `fieldName: new Date().toISOString()`
  // Matches assignments like: createdAt: new Date(), updatedAt: new Date(), etc.
  // But NOT: new Date().toISOString() (already fixed)
  content = content.replace(
    /(\w+(?:At|_at|Date|_date))\s*:\s*new Date\(\)(?!\.toISOString)/g,
    '$1: new Date().toISOString()'
  );

  // Pattern 2: `new Date(someVar)` in assignments to timestamp fields
  content = content.replace(
    /(\w+(?:At|_at|Date|_date))\s*:\s*new Date\(([^)]+)\)(?!\.toISOString)/g,
    '$1: new Date($2).toISOString()'
  );

  // Pattern 3: `.getTime()` on values that are now strings → wrap in `new Date()`
  // This is tricky, skip for manual fix

  // Pattern 4: `field: new Date()` where field name doesn't match pattern but context is clear
  // Cover common names: decidedAt, startedAt, endedAt, processedAt, acceptedAt, lastUsedAt
  // These should already be caught by the At pattern above

  // Pattern 5: Date objects compared via < > operators (leave for manual)

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    const count = (content.match(/\.toISOString\(\)/g) || []).length - (original.match(/\.toISOString\(\)/g) || []).length;
    console.log(`✅ ${filePath.replace(SERVER_SRC + '/', '')} (+${count} toISOString)`);
    totalFixed += count;
  }
}

console.log(`\nFixed ${totalFixed} Date→string conversions`);
