import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { activityLog, companies, agents as agentsTable } from "@paperclipai/db";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

const execAsync = promisify(execCb);

const deploymentPlanSchema = z.enum(["starter", "pro", "enterprise"]);

const deployCompanySchema = z.object({
  companyId: z.string().uuid(),
  companySlug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  companyName: z.string().min(1),
  companyDescription: z.string().default(""),
  plan: deploymentPlanSchema,
  agents: z.array(
    z.object({
      id: z.string().min(1),
      role: z.string().min(1),
      name: z.string().min(1),
    }),
  ),
  botTokens: z.record(z.string(), z.string()).optional(),
});

type DeployCompanyInput = z.infer<typeof deployCompanySchema>;

type DeploymentStatus = "deploying" | "ready" | "error" | "archived";

type DeploymentRecord = {
  companySlug: string;
  companyName: string;
  companyDescription: string;
  plan: z.infer<typeof deploymentPlanSchema>;
  agents: Array<{ id: string; role: string; name: string }>;
  botTokens?: Record<string, string>;
  hostname: string;
  containerName: string;
  status: DeploymentStatus;
  updatedAt: string;
};

type CommandResult = {
  stdout: string;
  stderr: string;
};

type ProvisioningStore = {
  getCompanyById: (companyId: string) => Promise<{ id: string } | null>;
  updateCompanyStatus: (companyId: string, status: string) => Promise<void>;
  saveDeployment: (companyId: string, deployment: DeploymentRecord) => Promise<void>;
  loadDeployment: (companyId: string) => Promise<DeploymentRecord | null>;
};

function shellEscapeSingleQuoted(value: string) {
  return value.replace(/'/g, `'"'"'`);
}

function defaultContainerName(slug: string) {
  return `wisechef-${slug}`;
}

function defaultHostname(slug: string) {
  return `${slug}.wisechef.ai`;
}

const DOCKER_SCRIPTS_DIR = process.env.WISECHEF_DOCKER_SCRIPTS_DIR ?? "/home/wisechef/companies/wisechef/wisechef-docker";
const DOCKER_HOST = process.env.WISECHEF_DOCKER_HOST ?? "89.167.102.128";
const DOCKER_SSH_KEY = process.env.WISECHEF_DOCKER_SSH_KEY ?? "/home/wisechef/clawd/wisechef/credentials/wisechef-provisioner-pem";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? "ba11aeeeafa20f32096559c37aa367b2";
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? "tFVkKl_lNWudXEpxDxZBXH1daAKkevLtgq2fymJb";
const CF_ZONE_ID = process.env.CF_ZONE_ID ?? "f8b7859f5939bb3ef50165ab5edcd749";

function buildDeployCommand(payload: DeployCompanyInput) {
  const escapedSlug = shellEscapeSingleQuoted(payload.companySlug);
  const escapedName = shellEscapeSingleQuoted(payload.companyName);
  const escapedDescription = shellEscapeSingleQuoted(payload.companyDescription);
  const escapedAgents = shellEscapeSingleQuoted(JSON.stringify(payload.agents));
  const tokenFlag = payload.botTokens && Object.keys(payload.botTokens).length > 0
    ? ` --bot-tokens-json '${shellEscapeSingleQuoted(JSON.stringify(payload.botTokens))}'`
    : "";
  const openrouterFlag = OPENROUTER_API_KEY
    ? ` --openrouter-key '${shellEscapeSingleQuoted(OPENROUTER_API_KEY)}'`
    : "";
  const cfFlags = ` --cf-account-id '${CF_ACCOUNT_ID}' --cf-api-token '${CF_API_TOKEN}' --cf-zone-id '${CF_ZONE_ID}'`;

  return `cd '${DOCKER_SCRIPTS_DIR}' && SSH_KEY_PATH='${DOCKER_SSH_KEY}' ./deploy-company.sh --force --company-uuid '${payload.companyId}' --slug '${escapedSlug}' --name '${escapedName}' --description '${escapedDescription}' --agents-json '${escapedAgents}' --plan ${payload.plan}${tokenFlag}${openrouterFlag}${cfFlags}`;
}

function buildStatusCommand(containerName: string) {
  const escapedContainer = shellEscapeSingleQuoted(containerName);
  return `ssh -i '${DOCKER_SSH_KEY}' -o StrictHostKeyChecking=no root@${DOCKER_HOST} "docker inspect '${escapedContainer}' --format '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'"`;
}

function buildDecommissionCommand(slug: string) {
  const escapedSlug = shellEscapeSingleQuoted(slug);
  return `cd '${DOCKER_SCRIPTS_DIR}' && DOCKER_HOST='${DOCKER_HOST}' SSH_KEY_PATH='${DOCKER_SSH_KEY}' ./decommission-company.sh --slug '${escapedSlug}'`;
}

async function defaultRunCommand(command: string): Promise<CommandResult> {
  const result = await execAsync(command, { maxBuffer: 10 * 1024 * 1024, timeout: 300_000 });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function isDeploymentRecord(value: unknown): value is DeploymentRecord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DeploymentRecord>;
  return typeof candidate.companySlug === "string"
    && typeof candidate.companyName === "string"
    && typeof candidate.companyDescription === "string"
    && (candidate.plan === "starter" || candidate.plan === "pro" || candidate.plan === "enterprise")
    && Array.isArray(candidate.agents)
    && typeof candidate.hostname === "string"
    && typeof candidate.containerName === "string"
    && ["deploying", "ready", "error", "archived"].includes(String(candidate.status))
    && typeof candidate.updatedAt === "string";
}

function createDefaultStore(db: Db): ProvisioningStore {
  return {
    async getCompanyById(companyId: string) {
      const company = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);
      return company;
    },
    async updateCompanyStatus(companyId: string, status: string) {
      await db.update(companies).set({ status, updatedAt: new Date() }).where(eq(companies.id, companyId));
    },
    async saveDeployment(companyId: string, deployment: DeploymentRecord) {
      await db.insert(activityLog).values({
        companyId,
        actorType: "system",
        actorId: "provisioning",
        action: "company.provisioning.updated",
        entityType: "company",
        entityId: companyId,
        details: deployment as unknown as Record<string, unknown>,
      });
    },
    async loadDeployment(companyId: string) {
      const row = await db
        .select({ details: activityLog.details })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.companyId, companyId),
            eq(activityLog.action, "company.provisioning.updated"),
          ),
        )
        .orderBy(desc(activityLog.createdAt))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!row || !isDeploymentRecord(row.details)) {
        return null;
      }

      return row.details;
    },
  };
}

export function provisioningRoutes(
  db: Db,
  opts?: {
    runCommand?: (command: string) => Promise<CommandResult>;
    store?: ProvisioningStore;
  },
) {
  const router = Router();
  const runCommand = opts?.runCommand ?? defaultRunCommand;
  const store = opts?.store ?? createDefaultStore(db);

  router.post("/provisioning/deploy-company", validate(deployCompanySchema), async (req, res) => {
    assertBoard(req);
    const payload = req.body as DeployCompanyInput;
    assertCompanyAccess(req, payload.companyId);

    const company = await store.getCompanyById(payload.companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const command = buildDeployCommand(payload);
    const hostname = defaultHostname(payload.companySlug);

    try {
      const result = await runCommand(command);
      console.log(`[provisioning] deploy stdout (last 500): ${result.stdout.slice(-500)}`);
      if (result.stderr) console.warn(`[provisioning] deploy stderr (last 500): ${result.stderr.slice(-500)}`);

      const deployment: DeploymentRecord = {
        companySlug: payload.companySlug,
        companyName: payload.companyName,
        companyDescription: payload.companyDescription,
        plan: payload.plan,
        agents: payload.agents,
        botTokens: payload.botTokens,
        hostname,
        containerName: defaultContainerName(payload.companySlug),
        status: "deploying",
        updatedAt: new Date().toISOString(),
      };
      await store.saveDeployment(payload.companyId, deployment);

      // Update agent adapter URLs and auth to use the deployed container's hooks endpoint
      const gatewayUrl = `https://${hostname}/hooks/paperclip`;
      try {
        // Read hooks token from the deployed openclaw.json
        const readTokenCmd = `ssh -i '${DOCKER_SSH_KEY}' -o StrictHostKeyChecking=accept-new root@${DOCKER_HOST} "cat /opt/wisechef/clients/${payload.companySlug}/data/openclaw/openclaw.json" 2>/dev/null`;
        let hooksToken = "";
        try {
          const tokenResult = await runCommand(readTokenCmd);
          const ocConfig = JSON.parse(tokenResult.stdout);
          hooksToken = ocConfig?.hooks?.token ?? "";
        } catch { /* fallback: use the default secret */ }

        const authHeader = hooksToken ? `Bearer ${hooksToken}` : "Bearer wisechef-hooks-secret-2026";

        const agentRows = await db
          .select()
          .from(agentsTable)
          .where(eq(agentsTable.companyId, payload.companyId));
        for (const agent of agentRows) {
          const cfg = (agent.adapterConfig as Record<string, unknown>) ?? {};
          await db
            .update(agentsTable)
            .set({ adapterConfig: { ...cfg, url: gatewayUrl, webhookAuthHeader: authHeader } })
            .where(eq(agentsTable.id, agent.id));
        }
        console.log(`[provisioning] Updated ${agentRows.length} agent adapter URLs to ${gatewayUrl} with hooks auth`);
      } catch (urlErr) {
        console.warn(`[provisioning] Failed to update agent URLs: ${urlErr}`);
      }

      res.json({
        hostname: deployment.hostname,
        containerName: deployment.containerName,
        status: deployment.status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[provisioning] deploy failed: ${message}`);
      res.status(500).json({ status: "error", error: message });
    }
  });

  router.get("/provisioning/company/:companyId/status", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const company = await store.getCompanyById(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const deployment = await store.loadDeployment(companyId);
    if (!deployment) {
      res.status(404).json({ error: "Deployment record not found" });
      return;
    }

    const command = buildStatusCommand(deployment.containerName);
    try {
      const { stdout } = await runCommand(command);
      const [runningRaw, healthRaw] = stdout.trim().split(/\s+/, 2);
      const running = runningRaw === "true";
      const healthy = healthRaw === "healthy";
      res.json({
        running,
        healthy,
        agentCount: deployment.agents.length,
        hostname: deployment.hostname,
      });
    } catch {
      res.json({
        running: false,
        healthy: false,
        agentCount: deployment.agents.length,
        hostname: deployment.hostname,
      });
    }
  });

  router.delete("/provisioning/company/:companyId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const company = await store.getCompanyById(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const deployment = await store.loadDeployment(companyId);
    if (!deployment) {
      res.status(404).json({ error: "Deployment record not found" });
      return;
    }

    const command = buildDecommissionCommand(deployment.companySlug);

    try {
      await runCommand(command);
      const archivedDeployment: DeploymentRecord = {
        ...deployment,
        status: "archived",
        updatedAt: new Date().toISOString(),
      };
      await store.saveDeployment(companyId, archivedDeployment);
      await store.updateCompanyStatus(companyId, "archived");
      res.json({ status: "archived" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ status: "error", error: message });
    }
  });

  return router;
}
