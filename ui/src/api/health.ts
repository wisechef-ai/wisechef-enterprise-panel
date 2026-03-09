export type HealthStatus = {
  status: "ok";
  deploymentMode?: "local_trusted" | "authenticated";
  deploymentExposure?: "private" | "public";
  authReady?: boolean;
  bootstrapStatus?: "ready" | "bootstrap_pending";
  features?: {
    companyDeletionEnabled?: boolean;
  };
};

const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export const healthApi = {
  get: async (): Promise<HealthStatus> => {
    const res = await fetch(`${basePath}/api/health`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error ?? `Failed to load health (${res.status})`);
    }
    return res.json();
  },
};
