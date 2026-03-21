import type { CreateConfigValues } from @paperclipai/adapter-utils;

/**
 * Default config for WiseChef containers.
 *
 * We route through the local Agent Bridge so the Panel does not need to know
 * the OpenClaw hooks token. The bridge holds the secret and forwards to
 * /hooks/agent internally.
 */
export function buildOpenClawConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};

  // Prefer bridge (no secrets in the Panel)
  ac.bridgeUrl = http://127.0.0.1:3200;

  // Backward-compatible fields
  ac.url = v.url || http://127.0.0.1:18789/hooks/agent;
  ac.method = POST;
  ac.timeoutSec = 120;

  return ac;
}
