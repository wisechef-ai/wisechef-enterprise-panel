import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { companiesApi } from "../api/companies";
import { goalsApi } from "../api/goals";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import { AsciiArtAnimation } from "./AsciiArtAnimation";
import {
  Building2,
  Bot,
  Check,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Rocket,
  X,
  Crown,
  Code,
  TrendingUp,
  Server,
  ShoppingCart,
  Headphones,
  Users,
  Calculator,
  Scale,
  Package,
  Palette,
  PenTool,
  BarChart3,
  Settings,
  Shield,
  Bug,
  MessageCircle,
  Handshake,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────── */

type Step = 1 | 2 | 3 | 4;

interface AgentRole {
  id: string;
  name: string;
  icon: React.ElementType;
  description: string;
  category: "leadership" | "engineering" | "growth" | "operations" | "support";
}

/* ─── Role Catalog ───────────────────────────────────────────── */

const AGENT_ROLES: AgentRole[] = [
  // Leadership
  { id: "ceo",          name: "CEO",            icon: Crown,         description: "Strategic oversight, company goals, agent coordination & hiring",                            category: "leadership" },
  { id: "product",      name: "Product",        icon: Package,       description: "Product roadmap, feature prioritization, user research synthesis",                            category: "leadership" },

  // Engineering
  { id: "engineer",     name: "Engineer",       icon: Code,          description: "Code implementation, architecture decisions, PR reviews & debugging",                         category: "engineering" },
  { id: "devops",       name: "DevOps",         icon: Server,        description: "Infrastructure, CI/CD pipelines, monitoring, deployments & uptime",                           category: "engineering" },
  { id: "security",     name: "Security",       icon: Shield,        description: "Security audits, vulnerability scanning, access policies & compliance",                       category: "engineering" },
  { id: "qa",           name: "QA",             icon: Bug,           description: "Test planning, automated testing, quality assurance & regression tracking",                    category: "engineering" },

  // Growth & Revenue
  { id: "growth",       name: "Growth",         icon: TrendingUp,    description: "Marketing campaigns, SEO, social media, content strategy & analytics",                        category: "growth" },
  { id: "sales",        name: "Sales",          icon: ShoppingCart,  description: "Lead generation, outreach, pipeline management & deal closing",                                category: "growth" },
  { id: "content",      name: "Content",        icon: PenTool,       description: "Blog posts, documentation, newsletters, copywriting & brand voice",                           category: "growth" },
  { id: "community",    name: "Community",      icon: MessageCircle, description: "Community engagement, Discord/forum moderation, user feedback",                                category: "growth" },
  { id: "partnerships", name: "Partnerships",   icon: Handshake,     description: "Partnership outreach, integration deals, co-marketing & alliances",                           category: "growth" },

  // Operations
  { id: "hr",           name: "HR",             icon: Users,         description: "Hiring pipelines, onboarding, culture & team health",                                         category: "operations" },
  { id: "finance",      name: "Finance",        icon: Calculator,    description: "Budgeting, expense tracking, financial reporting & forecasting",                               category: "operations" },
  { id: "legal",        name: "Legal",          icon: Scale,         description: "Contract review, compliance, privacy policies & terms of service",                             category: "operations" },
  { id: "operations",   name: "Operations",     icon: Settings,      description: "Process optimization, internal tooling, workflow automation",                                  category: "operations" },
  { id: "data",         name: "Data Analyst",   icon: BarChart3,     description: "Data pipelines, dashboards, metrics analysis & business intelligence",                         category: "operations" },

  // Support
  { id: "support",      name: "Support",        icon: Headphones,    description: "Customer support, ticket triage, knowledge base & SLA management",                            category: "support" },
  { id: "design",       name: "Design",         icon: Palette,       description: "UI/UX design, brand assets, prototyping & design system maintenance",                         category: "support" },
];

const CATEGORY_LABELS: Record<string, string> = {
  leadership: "Leadership",
  engineering: "Engineering",
  growth: "Growth & Revenue",
  operations: "Operations",
  support: "Support & Design",
};

const CATEGORY_ORDER = ["leadership", "engineering", "growth", "operations", "support"];

/* ─── Component ──────────────────────────────────────────────── */

export function OnboardingWizard() {
  const { onboardingOpen, onboardingOptions, closeOnboarding } = useDialog();
  const { selectedCompanyId, companies, setSelectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const initialStep = onboardingOptions.initialStep ?? 1;
  const existingCompanyId = onboardingOptions.companyId;

  const [step, setStep] = useState<Step>(initialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — Company
  const [companyName, setCompanyName] = useState("");
  const [companyGoal, setCompanyGoal] = useState("");
  const [companyIndustry, setCompanyIndustry] = useState("");

  // Step 2 — Role selection (Pro tier: max 4 agents)
  const PRO_MAX_AGENTS = 4;
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set(["ceo"]));
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [roleDescriptions, setRoleDescriptions] = useState<Record<string, string>>({});

  // Created entity IDs
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(existingCompanyId ?? null);
  const [createdCompanyPrefix, setCreatedCompanyPrefix] = useState<string | null>(null);
  const [createdAgentIds, setCreatedAgentIds] = useState<string[]>([]);

  // Sync when dialog opens
  useEffect(() => {
    if (!onboardingOpen) return;
    const cId = onboardingOptions.companyId ?? null;
    setStep(onboardingOptions.initialStep ?? 1);
    setCreatedCompanyId(cId);
    setCreatedCompanyPrefix(null);
  }, [onboardingOpen, onboardingOptions.companyId, onboardingOptions.initialStep]);

  useEffect(() => {
    if (!onboardingOpen || !createdCompanyId || createdCompanyPrefix) return;
    const company = companies.find((c) => c.id === createdCompanyId);
    if (company) setCreatedCompanyPrefix(company.issuePrefix);
  }, [onboardingOpen, createdCompanyId, createdCompanyPrefix, companies]);

  /* ─── Role helpers ─── */

  const toggleRole = useCallback((roleId: string) => {
    setSelectedRoles(prev => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        if (roleId === "ceo") return prev; // CEO always selected
        next.delete(roleId);
      } else {
        if (next.size >= PRO_MAX_AGENTS) return prev; // Enforce max
        next.add(roleId);
      }
      return next;
    });
  }, []);

  const selectAllRoles = useCallback(() => {
    // Select first PRO_MAX_AGENTS roles (CEO + next 3)
    const selected = new Set<string>();
    for (const r of AGENT_ROLES) {
      if (selected.size >= PRO_MAX_AGENTS) break;
      selected.add(r.id);
    }
    setSelectedRoles(selected);
  }, []);

  const selectCeoOnly = useCallback(() => {
    setSelectedRoles(new Set(["ceo"]));
  }, []);

  const getCustomDescription = useCallback((roleId: string) => {
    return roleDescriptions[roleId] ?? AGENT_ROLES.find(r => r.id === roleId)?.description ?? "";
  }, [roleDescriptions]);

  const setCustomDescription = useCallback((roleId: string, desc: string) => {
    setRoleDescriptions(prev => ({ ...prev, [roleId]: desc }));
  }, []);

  /* ─── Navigation handlers ─── */

  function reset() {
    setStep(1);
    setLoading(false);
    setError(null);
    setCompanyName("");
    setCompanyGoal("");
    setCompanyIndustry("");
    setSelectedRoles(new Set(["ceo"]));
    setExpandedRole(null);
    setRoleDescriptions({});
    setCreatedCompanyId(null);
    setCreatedCompanyPrefix(null);
    setCreatedAgentIds([]);
  }

  function handleClose() {
    reset();
    closeOnboarding();
  }

  async function handleStep1Next() {
    setLoading(true);
    setError(null);
    try {
      const company = await companiesApi.create({
        name: companyName.trim(),
        ...(companyIndustry.trim() ? { description: companyIndustry.trim() } : {}),
      });
      setCreatedCompanyId(company.id);
      setCreatedCompanyPrefix(company.issuePrefix);
      setSelectedCompanyId(company.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });

      if (companyGoal.trim()) {
        await goalsApi.create(company.id, {
          title: companyGoal.trim(),
          level: "company",
          status: "active",
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.goals.list(company.id) });
      }

      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create company");
    } finally {
      setLoading(false);
    }
  }

  async function handleStep3Next() {
    if (!createdCompanyId) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch existing agents to prevent duplicates
      let existingAgents: { name: string; role: string }[] = [];
      try {
        const agents = await agentsApi.list(createdCompanyId);
        existingAgents = (agents ?? []).map((a: any) => ({ name: a.name, role: a.role }));
      } catch { /* ignore */ }

      const existingRoles = new Set(existingAgents.map(a => a.role));

      const ids: string[] = [];
      const rolesToCreate = AGENT_ROLES.filter(
        r => selectedRoles.has(r.id) && !existingRoles.has(r.id)
      );

      if (rolesToCreate.length === 0 && existingAgents.length > 0) {
        // All selected roles already exist — skip to launch
        setCreatedAgentIds(ids);
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(createdCompanyId) });
        setStep(4);
        return;
      }

      for (const role of rolesToCreate) {
        const customDesc = getCustomDescription(role.id);
        const agent = await agentsApi.create(createdCompanyId, {
          name: role.name,
          role: role.id,
          adapterType: "openclaw",
          adapterConfig: {
            url: "http://127.0.0.1:18789/hooks/agent",
            method: "POST",
            timeoutSec: 120,
            webhookAuthHeader: "Bearer wisechef-hooks-secret-2026",
          },
          runtimeConfig: {
            heartbeat: {
              enabled: true,
              intervalSec: 3600,
              wakeOnDemand: true,
              cooldownSec: 10,
              maxConcurrentRuns: 1,
            },
          },
          ...(customDesc !== role.description ? { title: customDesc } : {}),
        });
        ids.push(agent.id);
      }

      setCreatedAgentIds(ids);
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(createdCompanyId) });
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agents");
    } finally {
      setLoading(false);
    }
  }

  function handleLaunch() {
    reset();
    closeOnboarding();
    if (createdCompanyPrefix) {
      navigate(`/${createdCompanyPrefix}/agents/all`);
      return;
    }
    navigate("/agents/all");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (step === 1 && companyName.trim()) handleStep1Next();
      else if (step === 2 && selectedRoles.size > 0) setStep(3);
      else if (step === 3) handleStep3Next();
      else if (step === 4) handleLaunch();
    }
  }

  if (!onboardingOpen) return null;

  const selectedCount = selectedRoles.size;
  const selectedRolesArray = AGENT_ROLES.filter(r => selectedRoles.has(r.id));

  return (
    <Dialog open={onboardingOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogPortal>
        <div className="fixed inset-0 z-50 bg-background" />
        <div className="fixed inset-0 z-50 flex" onKeyDown={handleKeyDown}>
          {/* Close */}
          <button
            onClick={handleClose}
            className="absolute top-4 left-4 z-10 rounded-sm p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </button>

          {/* Left — form */}
          <div className="w-full md:w-1/2 flex flex-col overflow-y-auto">
            <div className={cn(
              "w-full mx-auto my-auto px-8 py-12 shrink-0",
              step === 2 ? "max-w-lg" : "max-w-md"
            )}>
              {/* Progress */}
              <div className="flex items-center gap-2 mb-8">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Build your AI team</span>
                <span className="text-sm text-muted-foreground/60">Step {step} of 4</span>
                <div className="flex items-center gap-1.5 ml-auto">
                  {[1, 2, 3, 4].map((s) => (
                    <div key={s} className={cn(
                      "h-1.5 w-6 rounded-full transition-colors",
                      s < step ? "bg-green-500" : s === step ? "bg-foreground" : "bg-muted"
                    )} />
                  ))}
                </div>
              </div>

              {/* ═══ Step 1: Company ═══ */}
              {step === 1 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2"><Building2 className="h-5 w-5 text-muted-foreground" /></div>
                    <div>
                      <h3 className="font-medium">About your company</h3>
                      <p className="text-xs text-muted-foreground">We'll set up AI workers tailored to your business.</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Company name</label>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                      placeholder="Acme Corp"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Industry / what you do</label>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                      placeholder="e.g. SaaS, E-commerce, Agency, Robotics…"
                      value={companyIndustry}
                      onChange={(e) => setCompanyIndustry(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Main goal (optional)</label>
                    <textarea
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 resize-none min-h-[60px]"
                      placeholder="What should your AI team focus on?"
                      value={companyGoal}
                      onChange={(e) => setCompanyGoal(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* ═══ Step 2: Pick your team ═══ */}
              {step === 2 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2"><Bot className="h-5 w-5 text-muted-foreground" /></div>
                    <div>
                      <h3 className="font-medium">Pick your AI team</h3>
                      <p className="text-xs text-muted-foreground">
                        Select the roles you need. You can always add or remove agents later.
                      </p>
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Quick:</span>
                    <button
                      onClick={selectCeoOnly}
                      className={cn(
                        "rounded-full border px-2.5 py-1 transition-colors",
                        selectedCount === 1 && selectedRoles.has("ceo")
                          ? "border-foreground bg-accent font-medium"
                          : "border-border hover:bg-accent/50"
                      )}
                    >
                      CEO only
                    </button>
                    <button
                      onClick={selectAllRoles}
                      className={cn(
                        "rounded-full border px-2.5 py-1 transition-colors",
                        selectedCount === PRO_MAX_AGENTS
                          ? "border-foreground bg-accent font-medium"
                          : "border-border hover:bg-accent/50"
                      )}
                    >
                      Max team ({PRO_MAX_AGENTS})
                    </button>
                    <span className={cn(
                      "ml-auto font-medium",
                      selectedCount >= PRO_MAX_AGENTS ? "text-amber-500" : "text-muted-foreground"
                    )}>
                      {selectedCount}/{PRO_MAX_AGENTS}
                    </span>
                  </div>

                  {/* Role grid by category */}
                  <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                    {CATEGORY_ORDER.map(cat => {
                      const roles = AGENT_ROLES.filter(r => r.category === cat);
                      return (
                        <div key={cat}>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-1.5">
                            {CATEGORY_LABELS[cat]}
                          </p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {roles.map(role => {
                              const selected = selectedRoles.has(role.id);
                              const Icon = role.icon;
                              const isCeo = role.id === "ceo";
                              const atLimit = !selected && selectedRoles.size >= PRO_MAX_AGENTS;
                              return (
                                <button
                                  key={role.id}
                                  onClick={() => toggleRole(role.id)}
                                  disabled={atLimit && !selected}
                                  className={cn(
                                    "flex items-start gap-2 rounded-md border p-2.5 text-left text-xs transition-colors relative",
                                    selected
                                      ? "border-foreground bg-accent"
                                      : atLimit
                                        ? "border-border/50 opacity-40 cursor-not-allowed"
                                        : "border-border hover:bg-accent/50",
                                    isCeo && "opacity-90"
                                  )}
                                >
                                  {selected && (
                                    <div className="absolute top-1 right-1">
                                      <Check className="h-3 w-3 text-green-500" />
                                    </div>
                                  )}
                                  <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                                  <div className="min-w-0 pr-3">
                                    <span className="font-medium block leading-tight">
                                      {role.name}
                                      {isCeo && <span className="text-muted-foreground font-normal ml-1">(required)</span>}
                                    </span>
                                    <span className="text-muted-foreground text-[10px] leading-tight line-clamp-2">{role.description}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ═══ Step 3: Review & Customize ═══ */}
              {step === 3 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2"><Settings className="h-5 w-5 text-muted-foreground" /></div>
                    <div>
                      <h3 className="font-medium">Review your team</h3>
                      <p className="text-xs text-muted-foreground">
                        Click any role to customize its focus. {selectedCount} agent{selectedCount !== 1 ? "s" : ""} will be created.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                    {selectedRolesArray.map(role => {
                      const Icon = role.icon;
                      const isExpanded = expandedRole === role.id;
                      const currentDesc = getCustomDescription(role.id);
                      return (
                        <div
                          key={role.id}
                          className={cn(
                            "border rounded-md transition-colors",
                            isExpanded ? "border-foreground" : "border-border"
                          )}
                        >
                          <button
                            onClick={() => setExpandedRole(isExpanded ? null : role.id)}
                            className="flex items-center gap-3 px-3 py-2.5 w-full text-left"
                          >
                            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{role.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{currentDesc}</p>
                            </div>
                            <Check className="h-4 w-4 text-green-500 shrink-0" />
                          </button>
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-0">
                              <label className="text-[10px] text-muted-foreground mb-1 block uppercase tracking-wider">
                                Customize focus
                              </label>
                              <textarea
                                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 resize-none min-h-[60px]"
                                value={currentDesc}
                                onChange={(e) => setCustomDescription(role.id, e.target.value)}
                                placeholder="Describe what this agent should focus on…"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ═══ Step 4: Launch ═══ */}
              {step === 4 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2"><Rocket className="h-5 w-5 text-muted-foreground" /></div>
                    <div>
                      <h3 className="font-medium">Your team is ready</h3>
                      <p className="text-xs text-muted-foreground">
                        {selectedCount} AI worker{selectedCount !== 1 ? "s" : ""} created for <strong>{companyName}</strong>.
                        {createdAgentIds.length < selectedCount && createdAgentIds.length > 0 && (
                          <span className="text-amber-500 ml-1">
                            ({selectedCount - createdAgentIds.length} already existed and were skipped)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="border border-border divide-y divide-border rounded-md">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{companyName}</p>
                        {companyIndustry && <p className="text-xs text-muted-foreground truncate">{companyIndustry}</p>}
                      </div>
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    </div>
                    {selectedRolesArray.map(role => {
                      const Icon = role.icon;
                      return (
                        <div key={role.id} className="flex items-center gap-3 px-3 py-2">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{role.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">OpenClaw · Managed by WiseChef</p>
                          </div>
                          <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground space-y-1">
                    <p><strong>What happens next?</strong></p>
                    <p>Your AI team will be provisioned by WiseChef. Each agent gets its own workspace, communication channels, and instructions based on the role descriptions above.</p>
                    <p>You can manage, add, or remove agents from the Agents panel at any time.</p>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-3">
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}

              {/* Footer nav */}
              <div className="flex items-center justify-between mt-8">
                <div>
                  {step > 1 && step > (onboardingOptions.initialStep ?? 1) && (
                    <Button variant="ghost" size="sm" onClick={() => setStep((step - 1) as Step)} disabled={loading}>
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {step === 1 && (
                    <Button size="sm" disabled={!companyName.trim() || loading} onClick={handleStep1Next}>
                      {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5 mr-1" />}
                      {loading ? "Creating…" : "Next"}
                    </Button>
                  )}
                  {step === 2 && (
                    <Button size="sm" disabled={selectedRoles.size === 0} onClick={() => setStep(3)}>
                      <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      Review Team ({selectedCount})
                    </Button>
                  )}
                  {step === 3 && (
                    <Button size="sm" disabled={loading} onClick={handleStep3Next}>
                      {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Rocket className="h-3.5 w-3.5 mr-1" />}
                      {loading ? `Creating ${selectedCount} agents…` : `Launch Team (${selectedCount})`}
                    </Button>
                  )}
                  {step === 4 && (
                    <Button size="sm" disabled={loading} onClick={handleLaunch}>
                      <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      Open Agents Panel
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right — ASCII art (desktop) */}
          <div className="hidden md:block w-1/2 overflow-hidden">
            <AsciiArtAnimation />
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
