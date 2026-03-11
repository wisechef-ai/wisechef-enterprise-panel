#!/usr/bin/env node
// Port all Paperclip schema files from Postgres to SQLite
// Run: node port-schemas.mjs

import fs from 'fs';
import path from 'path';

const SCHEMA_DIR = 'packages/db/src/schema';

// Process each .ts file in schema dir
const files = fs.readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.ts') && f !== 'index.ts');

for (const file of files) {
  const filePath = path.join(SCHEMA_DIR, file);
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Track what types we need
  const needsText = content.includes('text(') || content.includes('uuid(') || content.includes('timestamp(') || content.includes('jsonb(');
  const needsInteger = content.includes('integer(') || content.includes('boolean(') || content.includes('bigint(') || content.includes('bigserial(');
  const needsUniqueIndex = content.includes('uniqueIndex');
  const needsIndex = /\bindex\(/.test(content);
  const hasJsonb = content.includes('jsonb(');
  const hasUuid = content.includes('uuid(');
  const hasTimestamp = content.includes('timestamp(');
  const hasBoolean = /\bboolean\(/.test(content);
  const hasBigserial = content.includes('bigserial(');
  const hasBigint = content.includes('bigint(');

  // 1. Replace import line
  // Build new import
  const sqliteImports = ['sqliteTable'];
  if (needsText) sqliteImports.push('text');
  if (needsInteger) sqliteImports.push('integer');
  if (needsUniqueIndex) sqliteImports.push('uniqueIndex');
  if (needsIndex) sqliteImports.push('index');

  // Replace the entire import block from drizzle-orm/pg-core
  content = content.replace(
    /import\s*\{[^}]*\}\s*from\s*["']drizzle-orm\/pg-core["'];?/s,
    `import { ${[...new Set(sqliteImports)].join(', ')} } from "drizzle-orm/sqlite-core";`
  );

  // Also handle AnyPgColumn → just remove it (self-references use a different pattern)
  if (content.includes('AnyPgColumn')) {
    content = content.replace(/,?\s*type\s+AnyPgColumn\s*,?/g, '');
    // For self-references like .references((): AnyPgColumn => ...), change to (): any =>
    content = content.replace(/\(\):\s*AnyPgColumn\s*=>/g, '(): any =>');
  }

  // 2. pgTable → sqliteTable
  content = content.replace(/pgTable\(/g, 'sqliteTable(');

  // 3. uuid("col").primaryKey().defaultRandom() → text("col").primaryKey().$defaultFn(() => crypto.randomUUID())
  content = content.replace(
    /uuid\("([^"]+)"\)\.primaryKey\(\)\.defaultRandom\(\)/g,
    'text("$1").primaryKey().$defaultFn(() => crypto.randomUUID())'
  );

  // 4. uuid("col").notNull().defaultRandom() (non-PK) → text("col").notNull().$defaultFn(...)
  content = content.replace(
    /uuid\("([^"]+)"\)\.notNull\(\)\.defaultRandom\(\)/g,
    'text("$1").notNull().$defaultFn(() => crypto.randomUUID())'
  );

  // 5. uuid("col") (FK references, no defaultRandom) → text("col")
  content = content.replace(/uuid\("([^"]+)"\)/g, 'text("$1")');

  // 6. timestamp("col", { withTimezone: true }).notNull().defaultNow()
  content = content.replace(
    /timestamp\("([^"]+)",\s*\{[^}]*\}\)\.notNull\(\)\.defaultNow\(\)/g,
    'text("$1").notNull().$defaultFn(() => new Date().toISOString())'
  );

  // 7. timestamp("col", { withTimezone: true }).defaultNow()
  content = content.replace(
    /timestamp\("([^"]+)",\s*\{[^}]*\}\)\.defaultNow\(\)/g,
    'text("$1").$defaultFn(() => new Date().toISOString())'
  );

  // 8. timestamp("col", { withTimezone: true }) (nullable, no default)
  content = content.replace(
    /timestamp\("([^"]+)",\s*\{[^}]*\}\)/g,
    'text("$1")'
  );

  // 9. timestamp("col") with no options
  content = content.replace(
    /timestamp\("([^"]+)"\)/g,
    'text("$1")'
  );

  // 10. jsonb("col").$type<T>().notNull().default({}) → text("col", { mode: "json" }).$type<T>().notNull().default({})
  content = content.replace(
    /jsonb\("([^"]+)"\)\.\$type<([^>]+)>\(\)\.notNull\(\)\.default\((\{[^}]*\})\)/g,
    'text("$1", { mode: "json" }).$type<$2>().notNull().default($3)'
  );

  // 11. jsonb("col").$type<T>().default({})
  content = content.replace(
    /jsonb\("([^"]+)"\)\.\$type<([^>]+)>\(\)\.default\((\{[^}]*\})\)/g,
    'text("$1", { mode: "json" }).$type<$2>().default($3)'
  );

  // 12. jsonb("col").$type<T>() (no default)
  content = content.replace(
    /jsonb\("([^"]+)"\)\.\$type<([^>]+)>\(\)/g,
    'text("$1", { mode: "json" }).$type<$2>()'
  );

  // 13. jsonb("col") without $type
  content = content.replace(
    /jsonb\("([^"]+)"\)/g,
    'text("$1", { mode: "json" })'
  );

  // 14. boolean("col") → integer("col", { mode: "boolean" })
  content = content.replace(
    /boolean\("([^"]+)"\)/g,
    'integer("$1", { mode: "boolean" })'
  );

  // 15. bigserial("col", { mode: "number" }) → integer("col").primaryKey({ autoIncrement: true })
  content = content.replace(
    /bigserial\("([^"]+)",\s*\{[^}]*\}\)/g,
    'integer("$1").primaryKey({ autoIncrement: true })'
  );

  // 16. bigint("col", { mode: "number" }) → integer("col")
  content = content.replace(
    /bigint\("([^"]+)",\s*\{[^}]*\}\)/g,
    'integer("$1")'
  );

  // 17. Add crypto import if we use randomUUID
  if (content.includes('crypto.randomUUID()') && !content.includes('import') || 
      (content.includes('crypto.randomUUID()') && !content.includes("from 'crypto'") && !content.includes('from "crypto"'))) {
    // Add after the drizzle import
    content = content.replace(
      /(import \{[^}]*\} from "drizzle-orm\/sqlite-core";)/,
      '$1\nimport crypto from "crypto";'
    );
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ ${file}`);
  } else {
    console.log(`⏭️  ${file} (no changes needed)`);
  }
}

console.log(`\nProcessed ${files.length} schema files`);
