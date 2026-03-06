# COORDINATION.md — WiseChef Multi-Agent Coordination Protocol

*Adapted from Agency Agents' NEXUS orchestration patterns for WiseChef's enterprise agent teams.*

---

## Overview

When {{COMPANY_NAME}}'s AI agent team works on multi-step tasks, coordination failures are the most common source of lost work, duplicated effort, and incorrect outputs. This document defines the handoff protocol that all agents must follow when passing work between roles.

---

## The Handoff Standard

Every handoff between agents must include four elements:

```
## HANDOFF: [FROM AGENT] → [TO AGENT]
**Task**: [What needs to be done — specific and unambiguous]
**Context**: [What the receiving agent needs to know that isn't obvious from the task]
**Input**: [Links, files, or data being handed over]
**Definition of Done**: [Exactly what "complete" looks like for the receiving agent]
**Return to**: [Who gets the output and what format they expect]
**Deadline**: [When is this needed]
```

---

## Standard Handoff Templates by Role Pair

### Product → Engineer

```
## HANDOFF: Product → Engineer
**Task**: Implement [feature name] per the attached spec.
**Context**: This affects [user flow]. Key design decision: we chose [X] over [Y] because [reason]. Legal reviewed the data handling on [date] — see notes.
**Input**: [Link to spec] | [Link to design mockups] | [Link to any API docs]
**Definition of Done**:
  - Feature works per all user stories in spec
  - All edge cases from spec section 4 are handled
  - Tests written for core business logic
  - QA agent has been notified for review
**Return to**: QA agent, then Product agent for sign-off
**Deadline**: [Date]
```

### Engineer → QA

```
## HANDOFF: Engineer → QA
**Task**: Review and test [feature name] implementation.
**Context**: [What was tricky about this implementation]. Known limitation: [X] is out of scope per spec. [Y] was changed from the original spec because [reason] — Product signed off.
**Input**: [Branch/PR link] | [Staging URL] | [Test credentials] | [Spec link]
**Definition of Done**:
  - All spec requirements tested with evidence (screenshots or logs)
  - Bug report filed for any failures with reproduction steps
  - QA sign-off issued or conditional pass with explicit list of blockers
**Return to**: Engineer (if failures found) | Product agent (for release decision)
**Deadline**: [Date]
```

### Sales → Product (Field Insight)

```
## HANDOFF: Sales → Product
**Task**: Field insight report — [topic/pattern observed].
**Context**: Heard this from [N] prospects/customers over the last [time period]. This is blocking deals or causing churn, not just a nice-to-have.
**Input**: 
  - Prospect/customer quotes (anonymized): [quotes]
  - Deal impact: [number of deals affected, estimated revenue at risk]
  - Current workaround customers use: [if any]
**Definition of Done**: Product agent acknowledges, logs to opportunity register, and provides a rough timeline or explicit deprioritization with rationale.
**Return to**: Sales agent (for prospect communication)
**Deadline**: Please respond within 5 business days.
```

### Support → Engineering (Bug Report)

```
## HANDOFF: Support → Engineering
**Task**: Bug confirmed — [brief description].
**Context**: First reported [date]. [N] customers affected. Severity: [Critical/High/Medium/Low].
**Input**:
  - Reproduction steps: [numbered steps]
  - Expected behavior: [what should happen]
  - Actual behavior: [what does happen]
  - Screenshot/evidence: [link]
  - Affected accounts: [anonymized if needed]
**Definition of Done**: Bug acknowledged with ticket number. ETA for fix communicated back to Support within [24h for Critical, 48h for High, 1 week for Medium].
**Return to**: Support agent (to communicate with affected customers)
**Deadline**: [Based on severity SLA]
```

### Growth → Product (Experiment Result)

```
## HANDOFF: Growth → Product
**Task**: Experiment result — [experiment name] — [POSITIVE/NEGATIVE/INCONCLUSIVE].
**Context**: [Hypothesis that was tested]. Ran from [date] to [date]. [N] users in each group.
**Input**:
  - Result: [Metric moved from X to Y, or no significant movement]
  - Statistical confidence: [%]
  - Key observation: [what surprised us or confirmed the hypothesis]
  - Recommended action: [scale / iterate / kill / wait for more data]
**Definition of Done**: Product agent confirms whether this changes any planned roadmap items.
**Return to**: Growth agent + CEO for weekly metrics review
**Deadline**: Decision needed by [date] to inform next sprint.
```

### CEO → All Agents (Priority Directive)

```
## PRIORITY DIRECTIVE: CEO → [All Agents | Specific Agents]
**Date**: [Date]
**Context**: [Brief reason for this directive — market change, customer event, strategic shift]
**New Priority**: [What is now the most important thing]
**Impact on current work**: 
  - [Agent A]: Pause [X], focus on [Y]
  - [Agent B]: Continue as planned
  - [Agent C]: Deprioritize [Z] until further notice
**Dependencies**: [What needs to happen in what order]
**Check-in**: [Date] — all agents report status on this priority.
```

---

## Quality Gates

Before any agent passes work to the next, they must confirm:

| Gate | Question | Required Answer |
|------|----------|-----------------|
| **Complete** | Is the deliverable fully done, or just started? | Fully done |
| **Evidence** | Can you point to proof that it works/is correct? | Yes, with link or attachment |
| **Spec-checked** | Does it match what was asked for? | Yes, or deviations documented |
| **Blocker-free** | Are there open blockers the receiving agent will hit? | Named explicitly if yes |
| **Owner** | Does the receiving agent know this is coming? | Yes (notified) |

If any gate fails, the handoff doesn't happen — the sending agent resolves the gap first.

---

## Escalation Protocol

When an agent is blocked for more than **24 hours**, the following chain triggers:

1. **Agent** → flags blocker in the handoff document with specific ask
2. **Receiving agent** → acknowledges or passes to relevant agent within 4 hours
3. **If unresolved after 24h** → Operations agent is notified
4. **If unresolved after 48h** → CEO agent receives an escalation with: what's blocked, what's needed, what it's costing the company

Blocked doesn't mean silent. An agent that is blocked communicates immediately.

---

## Anti-Patterns to Avoid

❌ **The Invisible Handoff**: Work is done and silently put somewhere. The next agent doesn't know it's their turn.

❌ **The Vague Pass**: "Here's the thing, take a look." No context, no definition of done, no deadline.

❌ **The Fantasy Sign-Off**: "Looks good to me" without checking against the spec or testing the thing.

❌ **The Orphaned Task**: A task that was handed off but has no owner because the receiving agent didn't acknowledge.

❌ **The Broken Loop**: A bug or quality issue is found but never makes it back to the agent who needs to fix it.

---

## Task State Definitions

All tasks in {{COMPANY_NAME}}'s agent system must be in one of these states:

| State | Meaning |
|-------|---------|
| `PENDING` | Assigned but work hasn't started |
| `IN_PROGRESS` | Actively being worked on |
| `BLOCKED` | Waiting on something external — must state what |
| `IN_REVIEW` | Work done, waiting for another agent to review/approve |
| `NEEDS_REVISION` | Review complete, returned with specific changes needed |
| `COMPLETE` | Done and verified by the receiving agent |
| `CANCELLED` | No longer needed — reason documented |

Tasks without a clear state are treated as `PENDING` by default.

---

*This protocol ensures that {{COMPANY_NAME}}'s agent team functions as a coordinated system, not a collection of isolated specialists. When in doubt: communicate explicitly, document the handoff, and confirm receipt.*
