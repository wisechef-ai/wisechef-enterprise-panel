import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { Db } from "@paperclipai/db";
import { provisioningRoutes } from "../routes/provisioning.js";
import { errorHandler } from "../middleware/error-handler.js";

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock("../services/agents.js", () => ({
  agentService: vi.fn(),
}));

const { agentService } = await import("../services/agents.js");

// ── Constants ──────────────────────────────────────────────────────────

const TEST_COMPANY_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TEST_COMPANY_SLUG = "test-corp";

// ── Helpers ────────────────────────────────────────────────────────────

interface CommandResult {
  stdout: string;
  stderr: string;
}

/**
 * A minimal ProvisioningStore for tests — no real DB needed.
 */
function createMockStore(options?: {
  companyExists?: boolean;
  deployment?: Record<string, unknown> | null;
}) {
  const { companyExists = true, deployment = null } = options ?? {};

  let savedDeployment: Record<string, unknown> | null = deployment;

  return {
    getCompanyById: vi.fn().mockImplementation(async () =>
      companyExists ? { id: TEST_COMPANY_ID } : null,
    ),
    updateCompanyStatus: vi.fn().mockResolvedValue(undefined),
    saveDeployment: vi.fn().mockImplementation(async (_companyId: string, d: Record<string, unknown>) => {
      savedDeployment = d;
    }),
    loadDeployment: vi.fn().mockImplementation(async () => savedDeployment),
    _getSavedDeployment: () => savedDeployment,
  };
}

/**
 * A fake Db with just enough to make the adapter-config patching + CEO key creation work.
 * The provisioning route does two DB queries after deploy:
 *   1. db.select().from(agentsTable).where(...) → get agents for adapter config patch
 *   2. db.select().from(agentsTable).where(role=ceo) → find CEO for API key
 * And one db.update for each agent's adapter config.
 */
function createFakeDb(agents: Array<{
  id: string;
  companyId: string;
  role: string;
  adapterConfig: Record<string, unknown>;
}>) {
  const updatedAdapterConfigs: Array<{
    agentId: string;
    config: Record<string, unknown>;
  }> = [];

  const fakeDb = {
    select: () => ({
      from: () => ({
        where: (..._args: unknown[]) => {
          // Return all agents — both the full list and CEO-filtered queries
          // The provisioning code filters by role in the query, but we return all and let it work
          return Promise.resolve(agents);
        },
      }),
    }),
    update: () => ({
      set: (data: Record<string, unknown>) => ({
        where: (..._args: unknown[]) => {
          if (data.adapterConfig) {
            updatedAdapterConfigs.push({
              agentId: "captured",
              config: data.adapterConfig as Record<string, unknown>,
            });
          }
          return Promise.resolve();
        },
      }),
    }),
    _updatedAdapterConfigs: updatedAdapterConfigs,
  };

  return fakeDb as unknown as Db & {
    _updatedAdapterConfigs: typeof updatedAdapterConfigs;
  };
}

function createApp(
  db: Db,
  options?: {
    runCommand?: (cmd: string) => Promise<CommandResult>;
    store?: ReturnType<typeof createMockStore>;
  },
) {
  const app = express();
  app.use(express.json());

  // Inject board actor so authz passes
  app.use((req: any, _res: any, next: any) => {
    req.actor = {
      type: "board",
      userId: "test-user",
      source: "local_implicit",
      isInstanceAdmin: true,
      companyIds: [],
    };
    next();
  });

  const runCommand =
    options?.runCommand ??
    (async (cmd: string) => {
      if (cmd.includes("openclaw.json")) {
        return {
          stdout: JSON.stringify({ gateway: { auth: { token: "test-gw-token" } } }),
          stderr: "",
        };
      }
      return { stdout: "ok", stderr: "" };
    });

  const store = options?.store ?? createMockStore();

  app.use("/api", provisioningRoutes(db, { runCommand, store }));
  app.use(errorHandler);

  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/provisioning/deploy-company", () => {
  const validPayload = {
    companyId: TEST_COMPANY_ID,
    companySlug: TEST_COMPANY_SLUG,
    companyName: "Test Corp",
    companyDescription: "A test company",
    plan: "pro",
    agents: [
      { id: "ceo-1", role: "ceo", name: "Alice" },
      { id: "eng-1", role: "engineer", name: "Bob" },
    ],
  };

  it("deploys and returns hostname + container", async () => {
    const commands: string[] = [];
    const mockRun = async (cmd: string) => {
      commands.push(cmd);
      if (cmd.includes("openclaw.json")) {
        return {
          stdout: JSON.stringify({ gateway: { auth: { token: "gw-tok-123" } } }),
          stderr: "",
        };
      }
      return { stdout: "ok", stderr: "" };
    };

    const agents = [
      { id: "agent-uuid-1", companyId: TEST_COMPANY_ID, role: "ceo", adapterConfig: {} },
      { id: "agent-uuid-2", companyId: TEST_COMPANY_ID, role: "engineer", adapterConfig: {} },
    ];
    const db = createFakeDb(agents);
    const store = createMockStore();

    vi.mocked(agentService).mockReturnValue({
      createApiKey: vi.fn().mockResolvedValue({
        id: "key-1",
        name: "provisioned-key",
        token: "pcp_test123456",
        createdAt: new Date().toISOString(),
      }),
    } as any);

    const app = createApp(db, { runCommand: mockRun, store });
    const res = await request(app)
      .post("/api/provisioning/deploy-company")
      .send(validPayload);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      hostname: `${TEST_COMPANY_SLUG}.wisechef.ai`,
      containerName: `wisechef-${TEST_COMPANY_SLUG}`,
      status: "deploying",
    });

    // Deploy-company.sh was called
    expect(commands[0]).toContain("deploy-company.sh");
    expect(commands[0]).toContain(`--slug '${TEST_COMPANY_SLUG}'`);
    expect(commands[0]).toContain("--plan pro");

    // Deployment saved to store
    expect(store.saveDeployment).toHaveBeenCalledWith(
      TEST_COMPANY_ID,
      expect.objectContaining({
        companySlug: TEST_COMPANY_SLUG,
        hostname: `${TEST_COMPANY_SLUG}.wisechef.ai`,
        status: "deploying",
      }),
    );
  });

  it("patches agent adapter configs with paperclipApiUrl and agentId", async () => {
    const agents = [
      { id: "agent-uuid-1", companyId: TEST_COMPANY_ID, role: "ceo", adapterConfig: { existing: "value" } },
      { id: "agent-uuid-2", companyId: TEST_COMPANY_ID, role: "engineer", adapterConfig: {} },
    ];
    const db = createFakeDb(agents);
    const store = createMockStore();

    vi.mocked(agentService).mockReturnValue({
      createApiKey: vi.fn().mockResolvedValue({
        id: "key-1",
        name: "provisioned-key",
        token: "pcp_test123456",
        createdAt: new Date().toISOString(),
      }),
    } as any);

    const app = createApp(db, { store });
    await request(app)
      .post("/api/provisioning/deploy-company")
      .send(validPayload);

    const configs = db._updatedAdapterConfigs;
    expect(configs.length).toBe(2);

    // CEO adapter config
    const ceoConfig = configs[0]!.config;
    expect(ceoConfig.url).toMatch(/^wss:\/\/.*wisechef\.ai\/gateway$/);
    expect(ceoConfig.paperclipApiUrl).toBe("https://dev.wisechef.ai");
    expect(ceoConfig.agentId).toBe(`${TEST_COMPANY_SLUG}-ceo`);
    expect(ceoConfig.autoPairOnFirstConnect).toBe(true);
    expect(ceoConfig.authToken).toBe("test-gw-token");
    expect(ceoConfig.existing).toBe("value"); // preserves existing config

    // Engineer adapter config
    const engConfig = configs[1]!.config;
    expect(engConfig.agentId).toBe(`${TEST_COMPANY_SLUG}-engineer`);
    expect(engConfig.paperclipApiUrl).toBe("https://dev.wisechef.ai");
  });

  it("creates CEO API key and deploys it to container via base64", async () => {
    const commands: string[] = [];
    const mockRun = async (cmd: string) => {
      commands.push(cmd);
      if (cmd.includes("openclaw.json")) {
        return {
          stdout: JSON.stringify({ gateway: { auth: { token: "gw-tok" } } }),
          stderr: "",
        };
      }
      return { stdout: "ok", stderr: "" };
    };

    // Only CEO agent so the role=ceo query works
    const agents = [
      { id: "agent-ceo-uuid", companyId: TEST_COMPANY_ID, role: "ceo", adapterConfig: {} },
    ];
    const db = createFakeDb(agents);
    const store = createMockStore();

    const createApiKeyMock = vi.fn().mockResolvedValue({
      id: "key-1",
      name: "provisioned-key",
      token: "pcp_ceotoken999",
      createdAt: new Date().toISOString(),
    });

    vi.mocked(agentService).mockReturnValue({
      createApiKey: createApiKeyMock,
    } as any);

    const app = createApp(db, { runCommand: mockRun, store });
    await request(app)
      .post("/api/provisioning/deploy-company")
      .send(validPayload);

    // Verify createApiKey called for CEO
    expect(createApiKeyMock).toHaveBeenCalledWith("agent-ceo-uuid", "provisioned-key");

    // Find the docker exec command that writes the key file
    const keyCmd = commands.find((c) => c.includes("paperclip-claimed-api-key.json"));
    expect(keyCmd).toBeDefined();
    expect(keyCmd).toContain(`wisechef-${TEST_COMPANY_SLUG}`);
    expect(keyCmd).toContain("base64 -d");

    // Decode the base64 payload
    const b64Match = keyCmd!.match(/echo ([A-Za-z0-9+/=]+) \| base64/);
    expect(b64Match).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(b64Match![1]!, "base64").toString());
    expect(decoded).toMatchObject({
      agentId: "agent-ceo-uuid",
      apiKey: "pcp_ceotoken999",
      paperclipApiUrl: "https://dev.wisechef.ai",
    });
  });

  it("continues gracefully when CEO API key creation fails", async () => {
    const agents = [
      { id: "agent-ceo-uuid", companyId: TEST_COMPANY_ID, role: "ceo", adapterConfig: {} },
    ];
    const db = createFakeDb(agents);
    const store = createMockStore();

    vi.mocked(agentService).mockReturnValue({
      createApiKey: vi.fn().mockRejectedValue(new Error("key creation failed")),
    } as any);

    const app = createApp(db, { store });
    const res = await request(app)
      .post("/api/provisioning/deploy-company")
      .send(validPayload);

    // Should still succeed — key creation is best-effort
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("deploying");
  });

  it("rejects invalid plan", async () => {
    const db = createFakeDb([]);
    const store = createMockStore();
    vi.mocked(agentService).mockReturnValue({ createApiKey: vi.fn() } as any);

    const app = createApp(db, { store });
    const res = await request(app)
      .post("/api/provisioning/deploy-company")
      .send({ ...validPayload, plan: "mega" });

    expect(res.status).toBe(400);
  });

  it("rejects missing company slug", async () => {
    const db = createFakeDb([]);
    const store = createMockStore();
    vi.mocked(agentService).mockReturnValue({ createApiKey: vi.fn() } as any);

    const app = createApp(db, { store });
    const { companySlug, ...noSlug } = validPayload;
    const res = await request(app)
      .post("/api/provisioning/deploy-company")
      .send(noSlug);

    expect(res.status).toBe(400);
  });

  it("returns 404 when company does not exist", async () => {
    const db = createFakeDb([]);
    const store = createMockStore({ companyExists: false });
    vi.mocked(agentService).mockReturnValue({ createApiKey: vi.fn() } as any);

    const app = createApp(db, { store });
    const res = await request(app)
      .post("/api/provisioning/deploy-company")
      .send(validPayload);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Company not found");
  });
});

describe("GET /api/provisioning/company/:companyId/status", () => {
  it("returns running/healthy status when deployment exists", async () => {
    const db = createFakeDb([]);
    const store = createMockStore({
      deployment: {
        companySlug: TEST_COMPANY_SLUG,
        companyName: "Test Corp",
        companyDescription: "A test company",
        plan: "pro",
        agents: [{ id: "a1", role: "ceo", name: "Alice" }],
        hostname: `${TEST_COMPANY_SLUG}.wisechef.ai`,
        containerName: `wisechef-${TEST_COMPANY_SLUG}`,
        status: "deploying",
        updatedAt: new Date().toISOString(),
      },
    });

    vi.mocked(agentService).mockReturnValue({ createApiKey: vi.fn() } as any);

    const mockRun = async () => ({
      stdout: "true healthy",
      stderr: "",
    });

    const app = createApp(db, { runCommand: mockRun, store });
    const res = await request(app).get(
      `/api/provisioning/company/${TEST_COMPANY_ID}/status`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      running: true,
      healthy: true,
      hostname: `${TEST_COMPANY_SLUG}.wisechef.ai`,
    });
  });

  it("returns 404 when no deployment exists", async () => {
    const db = createFakeDb([]);
    const store = createMockStore({ deployment: null });
    vi.mocked(agentService).mockReturnValue({ createApiKey: vi.fn() } as any);

    const app = createApp(db, { store });
    const res = await request(app).get(
      `/api/provisioning/company/${TEST_COMPANY_ID}/status`,
    );

    expect(res.status).toBe(404);
  });

  it("returns running=false when container is stopped", async () => {
    const db = createFakeDb([]);
    const store = createMockStore({
      deployment: {
        companySlug: TEST_COMPANY_SLUG,
        companyName: "Test Corp",
        companyDescription: "",
        plan: "starter",
        agents: [],
        hostname: `${TEST_COMPANY_SLUG}.wisechef.ai`,
        containerName: `wisechef-${TEST_COMPANY_SLUG}`,
        status: "deploying",
        updatedAt: new Date().toISOString(),
      },
    });

    vi.mocked(agentService).mockReturnValue({ createApiKey: vi.fn() } as any);

    const mockRun = async () => ({
      stdout: "false none",
      stderr: "",
    });

    const app = createApp(db, { runCommand: mockRun, store });
    const res = await request(app).get(
      `/api/provisioning/company/${TEST_COMPANY_ID}/status`,
    );

    expect(res.status).toBe(200);
    expect(res.body.running).toBe(false);
    expect(res.body.healthy).toBe(false);
  });
});
