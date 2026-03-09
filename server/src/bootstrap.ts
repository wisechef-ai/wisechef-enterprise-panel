/**
 * Bootstrap the enterprise panel SQLite DB from the container's manifest.json.
 * Runs on first container start — creates company + agents if DB is empty.
 */
import { randomUUID } from "crypto";
import fs from "fs";
import { type Db } from "@paperclipai/db";
import { companies, agents } from "@paperclipai/db";

const DEFAULT_MANIFEST_PATH = "/opt/wisechef/manifest.json";

interface Manifest {
  companyId?: string;
  companyName?: string;
  name?: string;
  slug?: string;
  plan?: string;
  gatewayToken?: string;
  agents?: Array<{
    name: string;
    role: string;
    title?: string;
    icon?: string;
  }>;
}

function readManifest(manifestPath: string): Manifest {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return {};
  }
}

export async function bootstrapFromManifest(
  db: Db,
  manifestPath: string = DEFAULT_MANIFEST_PATH,
): Promise<{ created: boolean; companyId?: string }> {
  const manifest = readManifest(manifestPath);

  // Skip if company already exists
  const existing = db.select().from(companies).limit(1).all();
  if (existing.length > 0) {
    return { created: false, companyId: existing[0].id };
  }

  const companyId = manifest.companyId || randomUUID();
  const companyName = manifest.companyName || manifest.name || "My Company";
  const slug = manifest.slug || "wc";
  const issuePrefix = slug.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "WC";

  // Create company
  db.insert(companies)
    .values({
      id: companyId,
      name: companyName,
      issuePrefix,
      status: "active",
    })
    .run();

  // Create default agents based on manifest or defaults
  const defaultAgents = manifest.agents || [
    { name: "CEO", role: "orchestrator", title: "Chief Executive", icon: "👔" },
  ];

  for (const agent of defaultAgents) {
    db.insert(agents)
      .values({
        id: randomUUID(),
        companyId,
        name: agent.name,
        role: agent.role || "general",
        title: agent.title || null,
        icon: agent.icon || null,
        status: "active",
        adapterType: "openclaw",
        adapterConfig: { gatewayToken: manifest.gatewayToken || "" },
        runtimeConfig: {},
        permissions: {},
      })
      .run();
  }

  console.log(
    `[bootstrap] Created company "${companyName}" (${companyId}) with ${defaultAgents.length} agent(s)`,
  );
  return { created: true, companyId };
}
