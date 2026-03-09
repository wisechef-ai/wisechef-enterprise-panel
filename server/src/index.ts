/// <reference path="./types/express.d.ts" />

// Prevent unhandled WS rejections (e.g. openclaw_gateway adapter) from crashing the server
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg.includes("gateway closed") || msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
    console.error(`[server] swallowed unhandledRejection (gateway/ws): ${msg}`);
    return;
  }
  console.error("[server] unhandledRejection:", reason);
});

import { existsSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import type { Request as ExpressRequest, RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import {
  createDb,
  authUsers,
  companies,
  companyMemberships,
  instanceUserRoles,
} from "@paperclipai/db";
import detectPort from "detect-port";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { logger } from "./middleware/logger.js";
import { setupLiveEventsWebSocketServer } from "./realtime/live-events-ws.js";
import { heartbeatService } from "./services/index.js";
import { createStorageServiceFromConfig } from "./storage/index.js";
import { printStartupBanner } from "./startup-banner.js";
import { getBoardClaimWarningUrl, initializeBoardClaimChallenge } from "./board-claim.js";

type BetterAuthSessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

type BetterAuthSessionResult = {
  session: { id: string; userId: string } | null;
  user: BetterAuthSessionUser | null;
};

const config = loadConfig();
if (process.env.PAPERCLIP_SECRETS_PROVIDER === undefined) {
  process.env.PAPERCLIP_SECRETS_PROVIDER = config.secretsProvider;
}
if (process.env.PAPERCLIP_SECRETS_STRICT_MODE === undefined) {
  process.env.PAPERCLIP_SECRETS_STRICT_MODE = config.secretsStrictMode ? "true" : "false";
}
if (process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE === undefined) {
  process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE = config.secretsMasterKeyFilePath;
}


type MigrationSummary = "skipped" | "already applied";

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

const LOCAL_BOARD_USER_ID = "local-board";
const LOCAL_BOARD_USER_EMAIL = "local@paperclip.local";
const LOCAL_BOARD_USER_NAME = "Board";

async function ensureLocalTrustedBoardPrincipal(db: any): Promise<void> {
  const now = new Date();
  const existingUser = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.id, LOCAL_BOARD_USER_ID))
    .then((rows: Array<{ id: string }>) => rows[0] ?? null);

  if (!existingUser) {
    await db.insert(authUsers).values({
      id: LOCAL_BOARD_USER_ID,
      name: LOCAL_BOARD_USER_NAME,
      email: LOCAL_BOARD_USER_EMAIL,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const role = await db
    .select({ id: instanceUserRoles.id })
    .from(instanceUserRoles)
    .where(and(eq(instanceUserRoles.userId, LOCAL_BOARD_USER_ID), eq(instanceUserRoles.role, "instance_admin")))
    .then((rows: Array<{ id: string }>) => rows[0] ?? null);
  if (!role) {
    await db.insert(instanceUserRoles).values({
      userId: LOCAL_BOARD_USER_ID,
      role: "instance_admin",
    });
  }

  const companyRows = await db.select({ id: companies.id }).from(companies);
  for (const company of companyRows) {
    const membership = await db
      .select({ id: companyMemberships.id })
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.companyId, company.id),
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.principalId, LOCAL_BOARD_USER_ID),
        ),
      )
      .then((rows: Array<{ id: string }>) => rows[0] ?? null);
    if (membership) continue;
    await db.insert(companyMemberships).values({
      companyId: company.id,
      principalType: "user",
      principalId: LOCAL_BOARD_USER_ID,
      status: "active",
      membershipRole: "owner",
    });
  }
}

// ── SQLite database initialization ──
const dbPath = process.env.DATABASE_PATH || "./data/enterprise.sqlite";
logger.info({ dbPath }, "Opening SQLite database");
const db = createDb(dbPath);
const migrationSummary: MigrationSummary = "already applied";
const startupDbInfo = { mode: "sqlite" as const, dbPath };

if (config.deploymentMode === "local_trusted" && !isLoopbackHost(config.host)) {
  throw new Error(
    `local_trusted mode requires loopback host binding (received: ${config.host}). ` +
      "Use authenticated mode for non-loopback deployments.",
  );
}

if (config.deploymentMode === "local_trusted" && config.deploymentExposure !== "private") {
  throw new Error("local_trusted mode only supports private exposure");
}

if (config.deploymentMode === "authenticated") {
  if (config.authBaseUrlMode === "explicit" && !config.authPublicBaseUrl) {
    throw new Error("auth.baseUrlMode=explicit requires auth.publicBaseUrl");
  }
  if (config.deploymentExposure === "public") {
    if (config.authBaseUrlMode !== "explicit") {
      throw new Error("authenticated public exposure requires auth.baseUrlMode=explicit");
    }
    if (!config.authPublicBaseUrl) {
      throw new Error("authenticated public exposure requires auth.publicBaseUrl");
    }
  }
}

let authReady = config.deploymentMode === "local_trusted";
let betterAuthHandler: RequestHandler | undefined;
let resolveSession:
  | ((req: ExpressRequest) => Promise<BetterAuthSessionResult | null>)
  | undefined;
let resolveSessionFromHeaders:
  | ((headers: Headers) => Promise<BetterAuthSessionResult | null>)
  | undefined;
if (config.deploymentMode === "local_trusted") {
  await ensureLocalTrustedBoardPrincipal(db as any);
}
if (config.deploymentMode === "authenticated") {
  const {
    createBetterAuthHandler,
    createBetterAuthInstance,
    deriveAuthTrustedOrigins,
    resolveBetterAuthSession,
    resolveBetterAuthSessionFromHeaders,
  } = await import("./auth/better-auth.js");
  const betterAuthSecret =
    process.env.BETTER_AUTH_SECRET?.trim() ?? process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim();
  if (!betterAuthSecret) {
    throw new Error(
      "authenticated mode requires BETTER_AUTH_SECRET (or PAPERCLIP_AGENT_JWT_SECRET) to be set",
    );
  }
  const derivedTrustedOrigins = deriveAuthTrustedOrigins(config);
  const envTrustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const effectiveTrustedOrigins = Array.from(new Set([...derivedTrustedOrigins, ...envTrustedOrigins]));
  logger.info(
    {
      authBaseUrlMode: config.authBaseUrlMode,
      authPublicBaseUrl: config.authPublicBaseUrl ?? null,
      trustedOrigins: effectiveTrustedOrigins,
      trustedOriginsSource: {
        derived: derivedTrustedOrigins.length,
        env: envTrustedOrigins.length,
      },
    },
    "Authenticated mode auth origin configuration",
  );
  const auth = createBetterAuthInstance(db as any, config, effectiveTrustedOrigins);
  betterAuthHandler = createBetterAuthHandler(auth);
  resolveSession = (req) => resolveBetterAuthSession(auth, req);
  resolveSessionFromHeaders = (headers) => resolveBetterAuthSessionFromHeaders(auth, headers);
  await initializeBoardClaimChallenge(db as any, { deploymentMode: config.deploymentMode });
  authReady = true;
}

const uiMode = config.uiDevMiddleware ? "vite-dev" : config.serveUi ? "static" : "none";
const storageService = createStorageServiceFromConfig(config);
const app = await createApp(db as any, {
  uiMode,
  storageService,
  deploymentMode: config.deploymentMode,
  deploymentExposure: config.deploymentExposure,
  allowedHostnames: config.allowedHostnames,
  bindHost: config.host,
  authReady,
  companyDeletionEnabled: config.companyDeletionEnabled,
  betterAuthHandler,
  resolveSession,
});
const server = createServer(app as unknown as Parameters<typeof createServer>[0]);
const listenPort = await detectPort(config.port);

if (listenPort !== config.port) {
  logger.warn(`Requested port is busy; using next free port (requestedPort=${config.port}, selectedPort=${listenPort})`);
}

const runtimeListenHost = config.host;
const runtimeApiHost =
  runtimeListenHost === "0.0.0.0" || runtimeListenHost === "::"
    ? "localhost"
    : runtimeListenHost;
process.env.PAPERCLIP_LISTEN_HOST = runtimeListenHost;
process.env.PAPERCLIP_LISTEN_PORT = String(listenPort);
process.env.PAPERCLIP_API_URL = `http://${runtimeApiHost}:${listenPort}`;

setupLiveEventsWebSocketServer(server, db as any, {
  deploymentMode: config.deploymentMode,
  resolveSessionFromHeaders,
});

if (config.heartbeatSchedulerEnabled) {
  const heartbeat = heartbeatService(db as any);

  // Reap orphaned runs at startup (no threshold -- runningProcesses is empty)
  void heartbeat.reapOrphanedRuns().catch((err) => {
    logger.error({ err }, "startup reap of orphaned heartbeat runs failed");
  });

  setInterval(() => {
    void heartbeat
      .tickTimers(new Date())
      .then((result) => {
        if (result.enqueued > 0) {
          logger.info({ ...result }, "heartbeat timer tick enqueued runs");
        }
      })
      .catch((err) => {
        logger.error({ err }, "heartbeat timer tick failed");
      });

    // Periodically reap orphaned runs (5-min staleness threshold)
    void heartbeat
      .reapOrphanedRuns({ staleThresholdMs: 5 * 60 * 1000 })
      .catch((err) => {
        logger.error({ err }, "periodic reap of orphaned heartbeat runs failed");
      });
  }, config.heartbeatSchedulerIntervalMs);
}

if (config.databaseBackupEnabled) {
  // SQLite backup: simple file copy with VACUUM INTO
  const backupIntervalMs = config.databaseBackupIntervalMinutes * 60 * 1000;
  logger.info({ intervalMinutes: config.databaseBackupIntervalMinutes }, "SQLite backups enabled");
  setInterval(() => {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFile = resolve(config.databaseBackupDir, `paperclip-${ts}.sqlite`);
      const { mkdirSync } = require("node:fs");
      mkdirSync(config.databaseBackupDir, { recursive: true });
      (db as any).$client.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);
      logger.info({ backupFile }, "SQLite backup complete");
    } catch (err) {
      logger.error({ err }, "SQLite backup failed");
    }
  }, backupIntervalMs);
}

server.listen(listenPort, config.host, () => {
  logger.info(`Server listening on ${config.host}:${listenPort}`);
  if (process.env.PAPERCLIP_OPEN_ON_LISTEN === "true") {
    const openHost = config.host === "0.0.0.0" || config.host === "::" ? "127.0.0.1" : config.host;
    const url = `http://${openHost}:${listenPort}`;
    void import("open")
      .then((mod) => mod.default(url))
      .then(() => {
        logger.info(`Opened browser at ${url}`);
      })
      .catch((err) => {
        logger.warn({ err, url }, "Failed to open browser on startup");
      });
  }
  printStartupBanner({
    host: config.host,
    deploymentMode: config.deploymentMode,
    deploymentExposure: config.deploymentExposure,
    authReady,
    requestedPort: config.port,
    listenPort,
    uiMode,
    db: startupDbInfo as any,
    migrationSummary,
    heartbeatSchedulerEnabled: config.heartbeatSchedulerEnabled,
    heartbeatSchedulerIntervalMs: config.heartbeatSchedulerIntervalMs,
    databaseBackupEnabled: config.databaseBackupEnabled,
    databaseBackupIntervalMinutes: config.databaseBackupIntervalMinutes,
    databaseBackupRetentionDays: config.databaseBackupRetentionDays,
    databaseBackupDir: config.databaseBackupDir,
  });

  const boardClaimUrl = getBoardClaimWarningUrl(config.host, listenPort);
  if (boardClaimUrl) {
    const red = "\x1b[41m\x1b[30m";
    const yellow = "\x1b[33m";
    const reset = "\x1b[0m";
    console.log(
      [
        `${red}  BOARD CLAIM REQUIRED  ${reset}`,
        `${yellow}This instance was previously local_trusted and still has local-board as the only admin.${reset}`,
        `${yellow}Sign in with a real user and open this one-time URL to claim ownership:${reset}`,
        `${yellow}${boardClaimUrl}${reset}`,
        `${yellow}If you are connecting over Tailscale, replace the host in this URL with your Tailscale IP/MagicDNS name.${reset}`,
      ].join("\n"),
    );
  }
});

// SQLite: no embedded server to stop on shutdown
