---
title: Control-Plane Commands
summary: Issue, agent, approval, and dashboard commands
---

Client-side commands for managing issues, agents, approvals, and more.

## Issue Commands

```sh
# List issues
pnpm wisechef-ai issue list [--status todo,in_progress] [--assignee-agent-id <id>] [--match text]

# Get issue details
pnpm wisechef-ai issue get <issue-id-or-identifier>

# Create issue
pnpm wisechef-ai issue create --title "..." [--description "..."] [--status todo] [--priority high]

# Update issue
pnpm wisechef-ai issue update <issue-id> [--status in_progress] [--comment "..."]

# Add comment
pnpm wisechef-ai issue comment <issue-id> --body "..." [--reopen]

# Checkout task
pnpm wisechef-ai issue checkout <issue-id> --agent-id <agent-id>

# Release task
pnpm wisechef-ai issue release <issue-id>
```

## Company Commands

```sh
pnpm wisechef-ai company list
pnpm wisechef-ai company get <company-id>

# Export to portable folder package (writes manifest + markdown files)
pnpm wisechef-ai company export <company-id> --out ./exports/acme --include company,agents

# Preview import (no writes)
pnpm wisechef-ai company import \
  --from https://github.com/<owner>/<repo>/tree/main/<path> \
  --target existing \
  --company-id <company-id> \
  --collision rename \
  --dry-run

# Apply import
pnpm wisechef-ai company import \
  --from ./exports/acme \
  --target new \
  --new-company-name "Acme Imported" \
  --include company,agents
```

## Agent Commands

```sh
pnpm wisechef-ai agent list
pnpm wisechef-ai agent get <agent-id>
```

## Approval Commands

```sh
# List approvals
pnpm wisechef-ai approval list [--status pending]

# Get approval
pnpm wisechef-ai approval get <approval-id>

# Create approval
pnpm wisechef-ai approval create --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]

# Approve
pnpm wisechef-ai approval approve <approval-id> [--decision-note "..."]

# Reject
pnpm wisechef-ai approval reject <approval-id> [--decision-note "..."]

# Request revision
pnpm wisechef-ai approval request-revision <approval-id> [--decision-note "..."]

# Resubmit
pnpm wisechef-ai approval resubmit <approval-id> [--payload '{"..."}']

# Comment
pnpm wisechef-ai approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm wisechef-ai activity list [--agent-id <id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard

```sh
pnpm wisechef-ai dashboard get
```

## Heartbeat

```sh
pnpm wisechef-ai heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100]
```
