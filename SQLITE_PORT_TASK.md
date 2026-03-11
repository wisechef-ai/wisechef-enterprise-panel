# TASK: Port Paperclip Enterprise Panel from Postgres to SQLite (better-sqlite3)

## Goal
Make the Paperclip enterprise panel fully self-contained per Docker container.
Currently uses `drizzle-orm/pg-core` + `postgres` package connecting to a central Postgres.
Port to `drizzle-orm/better-sqlite3` + `better-sqlite3` so each container has its own `.sqlite` file.

## What Needs to Change

### 1. Schema Port (`packages/db/src/schema/*.ts`)

All 34 schema files use `pgTable` from `drizzle-orm/pg-core`. Port every file to use `sqliteTable` from `drizzle-orm/sqlite-core`.

**Type mapping:**
| Postgres (current) | SQLite (target) |
|---|---|
| `pgTable` | `sqliteTable` |
| `uuid("col").primaryKey().defaultRandom()` | `text("col").primaryKey().$defaultFn(() => crypto.randomUUID())` |
| `text("col")` | `text("col")` (same) |
| `integer("col")` | `integer("col")` (same) |
| `boolean("col")` | `integer("col", { mode: "boolean" })` |
| `timestamp("col", { withTimezone: true }).defaultNow()` | `text("col").$defaultFn(() => new Date().toISOString())` |
| `timestamp("col", { withTimezone: true })` | `text("col")` |
| `jsonb("col").$type<T>().default({})` | `text("col", { mode: "json" }).$type<T>().default({})` |
| `bigint("col", { mode: "number" })` | `integer("col")` |
| `bigserial("col", { mode: "number" })` | `integer("col").primaryKey({ autoIncrement: true })` |
| `uniqueIndex("name").on(col)` | `uniqueIndex("name").on(col)` (same import from sqlite-core) |
| `index("name").on(col1, col2)` | `index("name").on(col1, col2)` (same import from sqlite-core) |
| `pgEnum` | Remove - use text with application-level validation |

**Import change in every schema file:**
```typescript
// FROM:
import { pgTable, uuid, text, integer, timestamp, boolean, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
// TO:
import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";
```

**CRITICAL:** `references()` work the same in sqlite-core. Keep all foreign key references.

### 2. DB Client (`packages/db/src/client.ts` and `packages/db/src/index.ts`)

Replace:
```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
```
With:
```typescript
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
```

The `createDb` function should accept a file path (string) instead of a connection URL:
```typescript
export function createDb(dbPath: string) {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}
```

### 3. Package.json (`packages/db/package.json`)

Replace dependency:
```json
- "postgres": "^3.4.5"
+ "better-sqlite3": "^11.0.0"
```

Add to devDependencies:
```json
"@types/better-sqlite3": "^7.6.0"
```

### 4. Server SQL Fixes (`server/src/`)

There are a few raw SQL queries that use Postgres-specific syntax. Fix these:

**`server/src/services/costs.ts` line 121:**
```sql
-- FROM: coalesce(sum(${costEvents.costCents}), 0)::int
-- TO: cast(coalesce(sum(${costEvents.costCents}), 0) as integer)
```

**`server/src/routes/agents.ts` lines 1311, 1437 (JSONB `->>` operator):**
SQLite supports `json_extract()` instead. Replace:
```sql
-- FROM: ${heartbeatRuns.contextSnapshot} ->> 'issueId'
-- TO: json_extract(${heartbeatRuns.contextSnapshot}, '$.issueId')
```

**`server/src/services/costs.ts` (multiple `->>` and `::int` casts):**
Replace all `col ->> 'key'` with `json_extract(col, '$.key')` and all `::int` / `::numeric` casts with `cast(... as integer)` / `cast(... as real)`.

**`server/src/services/activity.ts` line 81:**
Same `->>` to `json_extract()` fix.

### 5. Migrations

Delete all existing migration files in `packages/db/src/migrations/`.
Create a single fresh migration that creates all tables for SQLite.
Or better: use `drizzle-orm`'s `migrate()` with `{ migrationsFolder }` to auto-create tables.

Simplest approach: Use `db.run(sql)` to create tables from schema on first boot if they don't exist.
Even simpler: drizzle-kit can push schema directly. But for container use, just use:
```typescript
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
migrate(db, { migrationsFolder: "./migrations" });
```

### 6. Server Entry (`server/src/index.ts`)

Change DB initialization from:
```typescript
const db = createDb(process.env.DATABASE_URL);
```
To:
```typescript
const dbPath = process.env.DATABASE_PATH || "/opt/wisechef/data/enterprise.sqlite";
const db = createDb(dbPath);
```

### 7. Auth Middleware (`server/src/middleware/auth.ts`)

Keep `local_trusted` mode — it's perfect for per-container use (no login needed, single-tenant).

### 8. Bootstrap Script

Create `server/src/bootstrap.ts` that runs on first container start:
- Creates the company from manifest.json
- Creates agents matching the board's agent-type selection
- Sets sensible defaults (issue prefix from slug, etc.)

```typescript
export async function bootstrapFromManifest(db, manifestPath: string) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  
  // Skip if company already exists
  const existing = await db.select().from(companies).limit(1);
  if (existing.length > 0) return;
  
  // Create company
  const company = await db.insert(companies).values({
    name: manifest.companyName || manifest.name || "My Company",
    issuePrefix: (manifest.slug || "WC").toUpperCase().slice(0, 4),
  }).returning();
  
  // Create CEO agent
  await db.insert(agents).values({
    companyId: company[0].id,
    name: "CEO",
    role: "orchestrator",
    status: "active",
    adapterType: "openclaw",
    adapterConfig: { gatewayToken: manifest.gatewayToken },
  });
}
```

## What NOT to Change
- `ui/` — the frontend uses the REST API, which stays the same. No UI changes needed.
- API route signatures — all endpoints keep same paths and request/response shapes.
- `server/src/routes/*.ts` — these use drizzle query builder which abstracts the DB. Only fix raw SQL.

## Testing

After porting, verify:
1. `cd packages/db && npm run build` compiles
2. `cd server && npm run build` compiles  
3. Basic smoke test: create DB, insert company, insert agent, query back

## Files to Change (priority order)

1. `packages/db/package.json` — swap postgres → better-sqlite3
2. `packages/db/src/schema/*.ts` (all 34 files) — pgTable → sqliteTable
3. `packages/db/src/schema/index.ts` — keep as-is (just re-exports)
4. `packages/db/src/client.ts` — new SQLite createDb
5. `packages/db/src/index.ts` — update exports
6. `server/src/index.ts` — DATABASE_PATH instead of DATABASE_URL
7. `server/src/services/costs.ts` — fix raw SQL
8. `server/src/routes/agents.ts` — fix raw SQL
9. `server/src/services/activity.ts` — fix raw SQL  
10. Create `server/src/bootstrap.ts` — auto-seed from manifest
11. Delete `packages/db/src/migrations/*.sql` — fresh start for SQLite

When completely finished, run this command to notify me:
openclaw system event --text "Done: SQLite port complete - all schema files ported, client swapped, raw SQL fixed, bootstrap created" --mode now
