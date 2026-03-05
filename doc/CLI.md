# CLI Reference

WiseChef Panel CLI now supports both:

- instance setup/diagnostics (`onboard`, `doctor`, `configure`, `env`, `allowed-hostname`)
- control-plane client operations (issues, approvals, agents, activity, dashboard)

## Base Usage

Use repo script in development:

```sh
pnpm wisechef-ai --help
```

First-time local bootstrap + run:

```sh
pnpm wisechef-ai run
```

Choose local instance:

```sh
pnpm wisechef-ai run --instance dev
```

## Deployment Modes

Mode taxonomy and design intent are documented in `doc/DEPLOYMENT-MODES.md`.

Current CLI behavior:

- `wisechef-ai onboard` and `wisechef-ai configure --section server` set deployment mode in config
- runtime can override mode with `PAPERCLIP_DEPLOYMENT_MODE`
- `wisechef-ai run` and `wisechef-ai doctor` do not yet expose a direct `--mode` flag

Target behavior (planned) is documented in `doc/DEPLOYMENT-MODES.md` section 5.

Allow an authenticated/private hostname (for example custom Tailscale DNS):

```sh
pnpm wisechef-ai allowed-hostname dotta-macbook-pro
```

All client commands support:

- `--data-dir <path>`
- `--api-base <url>`
- `--api-key <token>`
- `--context <path>`
- `--profile <name>`
- `--json`

Company-scoped commands also support `--company-id <id>`.

Use `--data-dir` on any CLI command to isolate all default local state (config/context/db/logs/storage/secrets) away from `~/.paperclip`:

```sh
pnpm wisechef-ai run --data-dir ./tmp/paperclip-dev
pnpm wisechef-ai issue list --data-dir ./tmp/paperclip-dev
```

## Context Profiles

Store local defaults in `~/.paperclip/context.json`:

```sh
pnpm wisechef-ai context set --api-base http://localhost:3100 --company-id <company-id>
pnpm wisechef-ai context show
pnpm wisechef-ai context list
pnpm wisechef-ai context use default
```

To avoid storing secrets in context, set `apiKeyEnvVarName` and keep the key in env:

```sh
pnpm wisechef-ai context set --api-key-env-var-name PAPERCLIP_API_KEY
export PAPERCLIP_API_KEY=...
```

## Company Commands

```sh
pnpm wisechef-ai company list
pnpm wisechef-ai company get <company-id>
pnpm wisechef-ai company delete <company-id-or-prefix> --yes --confirm <same-id-or-prefix>
```

Examples:

```sh
pnpm wisechef-ai company delete PAP --yes --confirm PAP
pnpm wisechef-ai company delete 5cbe79ee-acb3-4597-896e-7662742593cd --yes --confirm 5cbe79ee-acb3-4597-896e-7662742593cd
```

Notes:

- Deletion is server-gated by `PAPERCLIP_ENABLE_COMPANY_DELETION`.
- With agent authentication, company deletion is company-scoped. Use the current company ID/prefix (for example via `--company-id` or `PAPERCLIP_COMPANY_ID`), not another company.

## Issue Commands

```sh
pnpm wisechef-ai issue list --company-id <company-id> [--status todo,in_progress] [--assignee-agent-id <agent-id>] [--match text]
pnpm wisechef-ai issue get <issue-id-or-identifier>
pnpm wisechef-ai issue create --company-id <company-id> --title "..." [--description "..."] [--status todo] [--priority high]
pnpm wisechef-ai issue update <issue-id> [--status in_progress] [--comment "..."]
pnpm wisechef-ai issue comment <issue-id> --body "..." [--reopen]
pnpm wisechef-ai issue checkout <issue-id> --agent-id <agent-id> [--expected-statuses todo,backlog,blocked]
pnpm wisechef-ai issue release <issue-id>
```

## Agent Commands

```sh
pnpm wisechef-ai agent list --company-id <company-id>
pnpm wisechef-ai agent get <agent-id>
```

## Approval Commands

```sh
pnpm wisechef-ai approval list --company-id <company-id> [--status pending]
pnpm wisechef-ai approval get <approval-id>
pnpm wisechef-ai approval create --company-id <company-id> --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]
pnpm wisechef-ai approval approve <approval-id> [--decision-note "..."]
pnpm wisechef-ai approval reject <approval-id> [--decision-note "..."]
pnpm wisechef-ai approval request-revision <approval-id> [--decision-note "..."]
pnpm wisechef-ai approval resubmit <approval-id> [--payload '{"...":"..."}']
pnpm wisechef-ai approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm wisechef-ai activity list --company-id <company-id> [--agent-id <agent-id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard Commands

```sh
pnpm wisechef-ai dashboard get --company-id <company-id>
```

## Heartbeat Command

`heartbeat run` now also supports context/api-key options and uses the shared client stack:

```sh
pnpm wisechef-ai heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100] [--api-key <token>]
```

## Local Storage Defaults

Default local instance root is `~/.paperclip/instances/default`:

- config: `~/.paperclip/instances/default/config.json`
- embedded db: `~/.paperclip/instances/default/db`
- logs: `~/.paperclip/instances/default/logs`
- storage: `~/.paperclip/instances/default/data/storage`
- secrets key: `~/.paperclip/instances/default/secrets/master.key`

Override base home or instance with env vars:

```sh
PAPERCLIP_HOME=/custom/home PAPERCLIP_INSTANCE_ID=dev pnpm wisechef-ai run
```

## Storage Configuration

Configure storage provider and settings:

```sh
pnpm wisechef-ai configure --section storage
```

Supported providers:

- `local_disk` (default; local single-user installs)
- `s3` (S3-compatible object storage)
