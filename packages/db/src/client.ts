import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "./schema/index.js";
import fs from "node:fs";
import path from "node:path";

export function createDb(dbPath: string) {
  // Ensure parent directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);

  // Performance + integrity pragmas
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema });
  return db;
}

/**
 * Push schema to SQLite — creates all tables if they don't exist.
 * Uses CREATE TABLE IF NOT EXISTS for idempotent bootstrap.
 */
export function ensureSchema(db: Db) {
  // Use drizzle's schema to create tables
  // We generate CREATE TABLE IF NOT EXISTS statements from the schema definitions
  const tableStatements = generateCreateTableStatements();
  for (const stmt of tableStatements) {
    db.run(sql.raw(stmt));
  }
}

function generateCreateTableStatements(): string[] {
  // Instead of hand-writing DDL, we use drizzle-kit push or just define them inline.
  // For robustness, define the core tables as raw SQL.
  return [
    `CREATE TABLE IF NOT EXISTS "companies" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "description" text,
      "status" text NOT NULL DEFAULT 'active',
      "issue_prefix" text NOT NULL DEFAULT 'PAP',
      "issue_counter" integer NOT NULL DEFAULT 0,
      "budget_monthly_cents" integer NOT NULL DEFAULT 0,
      "spent_monthly_cents" integer NOT NULL DEFAULT 0,
      "require_board_approval_for_new_agents" integer NOT NULL DEFAULT 1,
      "brand_color" text,
      "created_at" text NOT NULL DEFAULT (datetime('now')),
      "updated_at" text NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "companies_issue_prefix_idx" ON "companies" ("issue_prefix")`,

    `CREATE TABLE IF NOT EXISTS "user" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text,
      "email" text,
      "email_verified" integer DEFAULT 0,
      "image" text,
      "created_at" text DEFAULT (datetime('now')),
      "updated_at" text DEFAULT (datetime('now'))
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "auth_users_email_idx" ON "user" ("email")`,

    `CREATE TABLE IF NOT EXISTS "session" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL REFERENCES "user"("id"),
      "token" text NOT NULL,
      "expires_at" text NOT NULL,
      "ip_address" text,
      "user_agent" text,
      "created_at" text DEFAULT (datetime('now')),
      "updated_at" text DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "account" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL REFERENCES "user"("id"),
      "account_id" text NOT NULL,
      "provider_id" text NOT NULL,
      "access_token" text,
      "refresh_token" text,
      "access_token_expires_at" text,
      "refresh_token_expires_at" text,
      "scope" text,
      "id_token" text,
      "password" text,
      "created_at" text DEFAULT (datetime('now')),
      "updated_at" text DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "verification" (
      "id" text PRIMARY KEY NOT NULL,
      "identifier" text NOT NULL,
      "value" text NOT NULL,
      "expires_at" text NOT NULL,
      "created_at" text DEFAULT (datetime('now')),
      "updated_at" text DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "instance_user_roles" (
      "user_id" text NOT NULL REFERENCES "user"("id"),
      "role" text NOT NULL DEFAULT 'viewer',
      "assigned_at" text DEFAULT (datetime('now')),
      PRIMARY KEY ("user_id")
    )`,

    `CREATE TABLE IF NOT EXISTS "agents" (
      "id" text PRIMARY KEY NOT NULL,
      "company_id" text NOT NULL REFERENCES "companies"("id"),
      "name" text NOT NULL,
      "role" text NOT NULL DEFAULT 'general',
      "title" text,
      "icon" text,
      "status" text NOT NULL DEFAULT 'idle',
      "reports_to" text REFERENCES "agents"("id"),
      "capabilities" text,
      "adapter_type" text NOT NULL DEFAULT 'process',
      "adapter_config" text NOT NULL DEFAULT '{}',
      "runtime_config" text NOT NULL DEFAULT '{}',
      "budget_monthly_cents" integer NOT NULL DEFAULT 0,
      "spent_monthly_cents" integer NOT NULL DEFAULT 0,
      "permissions" text NOT NULL DEFAULT '{}',
      "last_heartbeat_at" text,
      "metadata" text,
      "created_at" text NOT NULL DEFAULT (datetime('now')),
      "updated_at" text NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS "agents_company_status_idx" ON "agents" ("company_id", "status")`,
    `CREATE INDEX IF NOT EXISTS "agents_company_reports_to_idx" ON "agents" ("company_id", "reports_to")`,

    `CREATE TABLE IF NOT EXISTS "company_memberships" (
      "company_id" text NOT NULL REFERENCES "companies"("id"),
      "user_id" text NOT NULL REFERENCES "user"("id"),
      "role" text NOT NULL DEFAULT 'viewer',
      "joined_at" text DEFAULT (datetime('now')),
      PRIMARY KEY ("company_id", "user_id")
    )`,

    `CREATE TABLE IF NOT EXISTS "principal_permission_grants" (
      "id" text PRIMARY KEY NOT NULL,
      "company_id" text NOT NULL REFERENCES "companies"("id"),
      "principal_type" text NOT NULL,
      "principal_id" text NOT NULL,
      "resource_type" text NOT NULL,
      "resource_id" text,
      "permission" text NOT NULL,
      "granted_at" text DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "invites" (
      "id" text PRIMARY KEY NOT NULL,
      "company_id" text NOT NULL REFERENCES "companies"("id"),
      "email" text,
      "role" text NOT NULL DEFAULT 'viewer',
      "token" text NOT NULL,
      "invited_by" text REFERENCES "user"("id"),
      "accepted_at" text,
      "expires_at" text,
      "onboarding_config" text DEFAULT '{}',
      "created_at" text DEFAULT (datetime('now'))
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "invites_token_idx" ON "invites" ("token")`,

    `CREATE TABLE IF NOT EXISTS "join_requests" (
      "id" text PRIMARY KEY NOT NULL,
      "company_id" text NOT NULL REFERENCES "companies"("id"),
      "user_id" text NOT NULL REFERENCES "user"("id"),
      "status" text NOT NULL DEFAULT 'pending',
      "message" text,
      "decided_by" text REFERENCES "user"("id"),
      "decided_at" text,
      "created_at" text DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "agent_config_revisions" (
      "id" text PRIMARY KEY NOT NULL,
      "agent_id" text NOT NULL REFERENCES "agents"("id"),
      "adapter_config" text NOT NULL DEFAULT '{}',
      "runtime_config" text NOT NULL DEFAULT '{}',
      "reason" text,
      "created_by" text,
      "created_at" text NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "agent_api_keys" (
      "id" text PRIMARY KEY NOT NULL,
      "agent_id" text NOT NULL REFERENCES "agents"("id"),
      "name" text NOT NULL DEFAULT 'default',
      "key_hash" text NOT NULL,
      "key_prefix" text NOT NULL,
      "last_used_at" text,
      "created_at" text NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "agent_api_keys_key_hash_idx" ON "agent_api_keys" ("key_hash")`,

    `CREATE TABLE IF NOT EXISTS "agent_runtime_state" (
      "agent_id" text PRIMARY KEY NOT NULL REFERENCES "agents"("id"),
      "session_id" text,
      "task_key" text,
      "last_error" text,
      "updated_at" text NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "agent_task_sessions" (
      "id" text PRIMARY KEY NOT NULL,
      "agent_id" text NOT NULL REFERENCES "agents"("id"),
      "task_key" text NOT NULL,
      "session_key" text,
      "status" text NOT NULL DEFAULT 'active',
      "started_at" text NOT NULL DEFAULT (datetime('now')),
      "ended_at" text
    )`,

    `CREATE TABLE IF NOT EXISTS "agent_wakeup_requests" (
      "id" integer PRIMARY KEY AUTOINCREMENT,
      "agent_id" text NOT NULL REFERENCES "agents"("id"),
      "issue_id" text,
      "reason" text,
      "status" text NOT NULL DEFAULT 'pending',
      "created_at" text NOT NULL DEFAULT (datetime('now')),
      "processed_at" text
    )`,

    `CREATE TABLE IF NOT EXISTS "projects" (
      "id" text PRIMARY KEY NOT NULL,
      "company_id" text NOT NULL REFERENCES "companies"("id"),
      "name" text NOT NULL,
      "description" text,
      "status" text NOT NULL DEFAULT 'active',
      "color" text,
      "archived" integer DEFAULT 0,
      "created_at" text NOT NULL DEFAULT (datetime('now')),
      "updated_at" text NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS "projects_company_idx" ON "projects" ("company_id")`,

    `CREATE TABLE IF NOT EXISTS "project_workspaces" (
      "id" text PRIMARY KEY NOT NULL,
      "project_id" text NOT NULL REFERENCES "projects"("id"),
      "workspace_id" text NOT NULL,
      "name" text,
      "provider" text NOT NULL DEFAULT 'local',
      "config" text NOT NULL DEFAULT '{}',
      "created_at" text NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "project_goals" (
      "project_id" text NOT NULL REFERENCES "projects"("id"),
      "goal_id" text NOT NULL REFERENCES "goals"("id"),
      PRIMARY KEY ("project_id", "goal_id")
    )`,

    `CREATE TABLE IF NOT EXISTS "goals" (
      "id" text PRIMARY KEY NOT NULL,
      "company_id" text NOT NULL REFERENCES "companies"("id"),
      "title" text NOT NULL,
      "description" text,
      "status" text NOT NULL DEFAULT 'active',
      "target_date" text,
      "created_at" text NOT NULL DEFAULT (datetime('now')),
      "updated_at" text NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "issues" (
      "id" text PRIMARY KEY NOT NULL,
      "company_id" text NOT NULL REFERENCES "companies"("id"),
      "project_id" text REFERENCES "projects"("id"),
      "identifier" text,
      "title" text NOT NULL,
      "body" text NOT NULL DEFAULT '',
      "status" text NOT NULL DEFAULT 'backlog',
      "priority" text NOT NULL DEFAULT 'medium',
      "assigned_agent_id" text REFERENCES "agents"("id"),
      "checked_out_by_agent_id" text REFERENCES "agents"("id"),
      "source" text NOT NULL DEFAULT 'board',
      "external_url" text,
      "metadata" text,
      "sort_order" integer NOT NULL DEFAULT 0,
      "created_by" text,
      "created_at" text NOT NULL DEFAULT (datetime('now')),
      "updated_at" text NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS "issues_company_status_idx" ON "issues" ("company_id", "status")`,
    `CREATE INDEX IF NOT EXISTS "issues_company_project_idx" ON "issues" ("company_id", "project_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "issues_identifier_idx" ON "issues" ("identifier")`,

    `CREATE TABLE IF NOT EXISTS "labels" (
      "id" text PRIMARY KEY NOT NULL,
      "company_id" text NOT NULL REFERENCES "companies"("id"),
      "name" text NOT NULL,
      "color" text NOT NULL DEFAULT '#888888',
      "created_at" text NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "labels_company_name_idx" ON "labels" ("company_id", "name")`,

    `CREATE TABLE IF NOT EXISTS "issue_labels" (
      "issue_id" text NOT NULL REFERENCES "issues"("id"),
      "label_id" text NOT NULL REFERENCES "labels"("id"),
      PRIMARY KEY ("issue_id", "label_id")
    )`,

    `CREATE TABLE IF NOT EXISTS "issue_approvals" (
      "issue_id" text NOT NULL REFERENCES "issues"("id"),
      "approval_id" text NOT NULL REFERENCES "approvals"("id"),
      PRIMARY KEY ("issue_id", "approval_id")
    )`,

    `CREATE TABLE IF NOT EXISTS "issue_comments" (
      "id" text PRIMARY KEY NOT NULL,
      "issue_id" text NOT NULL REFERENCES "issues"("id"),
      "author_type" text NOT NULL DEFAULT 'user',
      "author_id" text,
      "body" text NOT NULL,
      "created_at" text NOT NULL DEFAULT (datetime('now')),
      "updated_at" text NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "issue_read_states" (
      "issue_id" text NOT NULL REFERENCES "issues"("id"),
      "user_id" text NOT NULL,
      "last_read_at" text NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY ("issue_id", "user_id")
    )`,

    `CREATE TABLE IF NOT EXISTS "assets" (
      "id" text PRIMARY KEY NOT NULL,
      "company_id" text NOT NULL REFERENCES "companies"("id"),
      "type" text NOT NULL DEFAULT 'image',
      "filename" text NOT NULL,
      "mime_type" text,
      "size_bytes" integer,
      "storage_path" text NOT NULL,
      "created_at" text NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "issue_attachments" (
      "id" text PRIMARY KEY NOT NULL,
      "issue_id" text NOT NULL REFERENCES "issues"("id"),
      "asset_id" text NOT NULL REFERENCES "assets"("id"),
      "created_at" text NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "heartbeat_runs" (
      "id" text PRIMARY KEY NOT NULL,
      "agent_id" text NOT NULL REFERENCES "agents"("id"),
      "status" text NOT NULL DEFAULT 'running',
      "trigger" text NOT NULL DEFAULT 'scheduled',
      "context_snapshot" text,
      "usage_json" text,
      "error" text,
      "started_at" text NOT NULL DEFAULT (datetime('now')),
      "ended_at" text
    )`,
    `CREATE INDEX IF NOT EXISTS "heartbeat_runs_agent_idx" ON "heartbeat_runs" ("agent_id", "started_at")`,

    `CREATE TABLE IF NOT EXISTS "heartbeat_run_events" (
      "id" text PRIMARY KEY NOT NULL,
      "run_id" text NOT NULL REFERENCES "heartbeat_runs"("id"),
      "kind" text NOT NULL,
      "summary" text,
      "payload" text,
      "created_at" text NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "cost_events" (
      "id" text PRIMARY KEY NOT NULL,
      "company_id" text NOT NULL REFERENCES "companies"("id"),
      "agent_id" text REFERENCES "agents"("id"),
      "project_id" text REFERENCES "projects"("id"),
      "heartbeat_run_id" text REFERENCES "heartbeat_runs"("id"),
      "cost_cents" integer NOT NULL DEFAULT 0,
      "description" text,
      "created_at" text NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "approvals" (
      "id" text PRIMARY KEY NOT NULL,
      "company_id" text NOT NULL REFERENCES "companies"("id"),
      "title" text NOT NULL,
      "description" text,
      "status" text NOT NULL DEFAULT 'pending',
      "type" text NOT NULL DEFAULT 'general',
      "requester_type" text NOT NULL DEFAULT 'agent',
      "requester_id" text,
      "reviewer_type" text,
      "reviewer_id" text,
      "payload" text,
      "decision_note" text,
      "decided_at" text,
      "created_at" text NOT NULL DEFAULT (datetime('now')),
      "updated_at" text NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "approval_comments" (
      "id" text PRIMARY KEY NOT NULL,
      "approval_id" text NOT NULL REFERENCES "approvals"("id"),
      "author_type" text NOT NULL DEFAULT 'user',
      "author_id" text,
      "body" text NOT NULL,
      "created_at" text NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS "activity_log" (
      "id" text PRIMARY KEY NOT NULL,
      "company_id" text NOT NULL REFERENCES "companies"("id"),
      "actor_type" text NOT NULL,
      "actor_id" text,
      "action" text NOT NULL,
      "resource_type" text,
      "resource_id" text,
      "details" text,
      "created_at" text NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS "activity_log_company_idx" ON "activity_log" ("company_id", "created_at")`,

    `CREATE TABLE IF NOT EXISTS "company_secrets" (
      "id" text PRIMARY KEY NOT NULL,
      "company_id" text NOT NULL REFERENCES "companies"("id"),
      "name" text NOT NULL,
      "provider" text NOT NULL DEFAULT 'local',
      "metadata" text DEFAULT '{}',
      "created_at" text NOT NULL DEFAULT (datetime('now')),
      "updated_at" text NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "company_secrets_name_idx" ON "company_secrets" ("company_id", "name")`,

    `CREATE TABLE IF NOT EXISTS "company_secret_versions" (
      "id" text PRIMARY KEY NOT NULL,
      "secret_id" text NOT NULL REFERENCES "company_secrets"("id"),
      "encrypted_value" text NOT NULL,
      "version" integer NOT NULL DEFAULT 1,
      "created_at" text NOT NULL DEFAULT (datetime('now'))
    )`,
  ];
}

export type Db = ReturnType<typeof createDb>;

// Re-export for compatibility with existing imports
export type MigrationState = { status: "upToDate" };
export async function inspectMigrations(_dbPath: string): Promise<MigrationState> {
  return { status: "upToDate" };
}
export async function applyPendingMigrations(_dbPath: string): Promise<void> {}
export async function migratePostgresIfEmpty(_url: string) {
  return { migrated: false, reason: "sqlite-mode" as const, tableCount: 0 };
}
