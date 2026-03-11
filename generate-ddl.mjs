// Generate CREATE TABLE + INDEX DDL from drizzle schema by pushing to a temp SQLite
// then extracting the DDL from sqlite_master
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as schema from "@paperclipai/db";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const tmpPath = `/tmp/ddl-gen-${Date.now()}.sqlite`;
const sqlite = new Database(tmpPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);

// Gather all table definitions from schema
const schemaDir = "packages/db/src/schema";
const schemaFiles = fs.readdirSync(schemaDir).filter(f => f.endsWith(".ts") && f !== "index.ts");

console.log(`Found ${schemaFiles.length} schema files`);

// We need to use drizzle-kit to push, but let's try another approach:
// Import schema objects and use sqliteTable introspection

// Actually, let's just use drizzle-kit push via CLI
import { execSync } from "child_process";

// Create a drizzle config
const configContent = `
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./packages/db/src/schema/index.ts",
  dialect: "sqlite",
  dbCredentials: { url: "${tmpPath}" },
});
`;
fs.writeFileSync("/tmp/drizzle-gen.config.ts", configContent);

try {
  execSync(`npx drizzle-kit push --config=/tmp/drizzle-gen.config.ts --force`, { 
    cwd: "/tmp/wisechef-sqlite-port",
    stdio: "pipe",
    timeout: 30000
  });
} catch (e) {
  console.error("drizzle-kit push failed:", e.stderr?.toString() || e.message);
  process.exit(1);
}

// Now extract DDL from the populated database
const ddlRows = sqlite.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type DESC, name").all();

const statements = ddlRows.map(r => r.sql.replace(/\n/g, "\n      "));

console.log(`\n=== ${statements.length} DDL statements ===\n`);

// Output as a TypeScript array
let output = "// Auto-generated from drizzle schema — do not edit manually\n";
output += "function generateCreateTableStatements(): string[] {\n";
output += "  return [\n";
for (const stmt of statements) {
  // Add IF NOT EXISTS
  const safe = stmt
    .replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
    .replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
    .replace(/^CREATE UNIQUE INDEX /, "CREATE UNIQUE INDEX IF NOT EXISTS ");
  output += "    `" + safe + "`,\n";
}
output += "  ];\n";
output += "}\n";

fs.writeFileSync("/tmp/generated-ddl.ts", output);
console.log("Written to /tmp/generated-ddl.ts");

sqlite.close();
fs.unlinkSync(tmpPath);
