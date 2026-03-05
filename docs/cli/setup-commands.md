---
title: Setup Commands
summary: Onboard, run, doctor, and configure
---

Instance setup and diagnostics commands.

## `wisechef-ai run`

One-command bootstrap and start:

```sh
pnpm wisechef-ai run
```

Does:

1. Auto-onboards if config is missing
2. Runs `wisechef-ai doctor` with repair enabled
3. Starts the server when checks pass

Choose a specific instance:

```sh
pnpm wisechef-ai run --instance dev
```

## `wisechef-ai onboard`

Interactive first-time setup:

```sh
pnpm wisechef-ai onboard
```

First prompt:

1. `Quickstart` (recommended): local defaults (embedded database, no LLM provider, local disk storage, default secrets)
2. `Advanced setup`: full interactive configuration

Start immediately after onboarding:

```sh
pnpm wisechef-ai onboard --run
```

Non-interactive defaults + immediate start (opens browser on server listen):

```sh
pnpm wisechef-ai onboard --yes
```

## `wisechef-ai doctor`

Health checks with optional auto-repair:

```sh
pnpm wisechef-ai doctor
pnpm wisechef-ai doctor --repair
```

Validates:

- Server configuration
- Database connectivity
- Secrets adapter configuration
- Storage configuration
- Missing key files

## `wisechef-ai configure`

Update configuration sections:

```sh
pnpm wisechef-ai configure --section server
pnpm wisechef-ai configure --section secrets
pnpm wisechef-ai configure --section storage
```

## `wisechef-ai env`

Show resolved environment configuration:

```sh
pnpm wisechef-ai env
```

## `wisechef-ai allowed-hostname`

Allow a private hostname for authenticated/private mode:

```sh
pnpm wisechef-ai allowed-hostname my-tailscale-host
```

## Local Storage Paths

| Data | Default Path |
|------|-------------|
| Config | `~/.paperclip/instances/default/config.json` |
| Database | `~/.paperclip/instances/default/db` |
| Logs | `~/.paperclip/instances/default/logs` |
| Storage | `~/.paperclip/instances/default/data/storage` |
| Secrets key | `~/.paperclip/instances/default/secrets/master.key` |

Override with:

```sh
PAPERCLIP_HOME=/custom/home PAPERCLIP_INSTANCE_ID=dev pnpm wisechef-ai run
```

Or pass `--data-dir` directly on any command:

```sh
pnpm wisechef-ai run --data-dir ./tmp/paperclip-dev
pnpm wisechef-ai doctor --data-dir ./tmp/paperclip-dev
```
