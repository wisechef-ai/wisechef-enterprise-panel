import { useCallback, useEffect, useMemo, useState } from "react";
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
  ChevronDown,
  ChevronUp,
  Send,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

type Step = 1 | 2 | 3;

type Industry =
  | "Tech"
  | "Retail"
  | "Healthcare"
  | "Education"
  | "Finance"
  | "Manufacturing"
  | "Services"
  | "Other";

interface AgentRole {
  id: string;
  name: string;
  icon: React.ElementType;
  description: string;
  category: "leadership" | "engineering" | "growth" | "operations" | "support";
}

const INDUSTRIES: Industry[] = [
  "Tech",
  "Retail",
  "Healthcare",
  "Education",
  "Finance",
  "Manufacturing",
  "Services",
  "Other",
];

const INDUSTRY_TEAM_SUGGESTIONS: Record<Industry, string[]> = {
  Tech: ["ceo", "engineer", "growth", "devops"],
  Retail: ["ceo", "sales", "content", "support"],
  Healthcare: ["ceo", "operations", "legal", "support"],
  Education: ["ceo", "content", "community", "support"],
  Finance: ["ceo", "finance", "security", "operations"],
  Manufacturing: ["ceo", "engineer", "operations", "qa"],
  Services: ["ceo", "sales", "growth", "operations"],
  Other: ["ceo"],
};

const DEFAULT_MAX_AGENTS = 20;

const AGENT_ROLES: AgentRole[] = [
  { id: "ceo", name: "CEO", icon: Crown, description: "Strategic oversight, company goals, agent coordination & hiring", category: "leadership" },
  { id: "product", name: "Product", icon: Package, description: "Product roadmap, feature prioritization, user research synthesis", category: "leadership" },
  { id: "engineer", name: "Engineer", icon: Code, description: "Code implementation, architecture decisions, PR reviews & debugging", category: "engineering" },
  { id: "devops", name: "DevOps", icon: Server, description: "Infrastructure, CI/CD pipelines, monitoring, deployments & uptime", category: "engineering" },
  { id: "security", name: "Security", icon: Shield, description: "Security audits, vulnerability scanning, access policies & compliance", category: "engineering" },
  { id: "qa", name: "QA", icon: Bug, description: "Test planning, automated testing, quality assurance & regression tracking", category: "engineering" },
  { id: "growth", name: "Growth", icon: TrendingUp, description: "Marketing campaigns, SEO, social media, content strategy & analytics", category: "growth" },
  { id: "sales", name: "Sales", icon: ShoppingCart, description: "Lead generation, outreach, pipeline management & deal closing", category: "growth" },
  { id: "content", name: "Content", icon: PenTool, description: "Blog posts, documentation, newsletters, copywriting & brand voice", category: "growth" },
  { id: "community", name: "Community", icon: MessageCircle, description: "Community engagement, forum moderation, user feedback loops", category: "growth" },
  { id: "partnerships", name: "Partnerships", icon: Handshake, description: "Partnership outreach, integration deals, co-marketing & alliances", category: "growth" },
  { id: "hr", name: "HR", icon: Users, description: "Hiring pipelines, onboarding, culture & team health", category: "operations" },
  { id: "finance", name: "Finance", icon: Calculator, description: "Budgeting, expense tracking, financial reporting & forecasting", category: "operations" },
  { id: "legal", name: "Legal", icon: Scale, description: "Contract review, compliance, privacy policies & terms of service", category: "operations" },
  { id: "operations", name: "Operations", icon: Settings, description: "Process optimization, internal tooling, workflow automation", category: "operations" },
  { id: "data", name: "Data Analyst", icon: BarChart3, description: "Data pipelines, dashboards, metrics analysis & business intelligence", category: "operations" },
  { id: "support", name: "Support", icon: Headphones, description: "Customer support, ticket triage, knowledge base & SLA management", category: "support" },
  { id: "design", name: "Design", icon: Palette, description: "UI/UX design, brand assets, prototyping & design system maintenance", category: "support" },
];

const CATEGORY_LABELS: Record<string, string> = {
  leadership: "Leadership",
  engineering: "Engineering",
  growth: "Growth & Revenue",
  operations: "Operations",
  support: "Support & Design",
};

const CATEGORY_ORDER = ["leadership", "engineering", "growth", "operations", "support"];

function parseTierAgentLimit(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  for (const key of ["maxAgents", "agentLimit", "max_agents"]) {
    const v = data[key];
    if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
  }
  return null;
}

function applyIndustrySuggestion(industry: Industry, maxAgents: number): Set<string> {
  const suggested = INDUSTRY_TEAM_SUGGESTIONS[industry] ?? ["ceo"];
  const next = new Set<string>(["ceo"]);
  for (const roleId of suggested) {
    if (next.size >= maxAgents) break;
    next.add(roleId);
  }
  return next;
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function OnboardingWizard() {
  const { onboardingOpen, onboardingOptions, closeOnboarding } = useDialog();
  const { setSelectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Restore wizard progress from sessionStorage
  const savedProgress = useMemo(() => {
    try {
      const raw = sessionStorage.getItem("wisechef_onboarding");
      if (raw) return JSON.parse(raw) as {
        step?: number;
        companyId?: string;
        companyName?: string;
        companyDescription?: string;
        industry?: Industry;
        roles?: string[];
      };
    } catch { /* ignore */ }
    return null;
  }, []);

  const initialStep = (onboardingOptions.initialStep === 2 ? 2 : (savedProgress?.step ?? 1)) as Step;
  const existingCompanyId = onboardingOptions.companyId ?? savedProgress?.companyId ?? null;

  const [step, setStep] = useState<Step>(initialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [companyName, setCompanyName] = useState(savedProgress?.companyName ?? "");
  const [companyDescription, setCompanyDescription] = useState(savedProgress?.companyDescription ?? "");
  const [companyIndustry, setCompanyIndustry] = useState<Industry>(savedProgress?.industry ?? "Tech");

  // Step 2
  const [addMoreRolesOpen, setAddMoreRolesOpen] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    savedProgress?.roles ? new Set(savedProgress.roles) : applyIndustrySuggestion("Tech", DEFAULT_MAX_AGENTS),
  );

  // Step 3
  const [botTokens, setBotTokens] = useState<Record<string, string>>({});
  const [tokenValidation, setTokenValidation] = useState<Record<string, {
    valid: boolean;
    botUsername?: string;
    error?: string;
    loading?: boolean;
  }>>({});
  const [teamBotsOpen, setTeamBotsOpen] = useState(false);
  const [deploymentStatus, setDeploymentStatus] = useState<"idle" | "deploying" | "ready" | "error">("idle");

  // Created entity tracking
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(existingCompanyId);
  const [maxAgents, setMaxAgents] = useState(DEFAULT_MAX_AGENTS);

  useEffect(() => {
    if (!onboardingOpen) return;
    if (!savedProgress) {
      setStep(initialStep);
      setLoading(false);
      setError(null);
      setCompanyName("");
      setCompanyDescription("");
      setCompanyIndustry("Tech");
      setCreatedCompanyId(existingCompanyId);
      setMaxAgents(DEFAULT_MAX_AGENTS);
      setAddMoreRolesOpen(false);
      setSelectedRoles(applyIndustrySuggestion("Tech", DEFAULT_MAX_AGENTS));
      setBotTokens({});
      setTokenValidation({});
      setDeploymentStatus("idle");
    }
  }, [onboardingOpen, initialStep, existingCompanyId, savedProgress]);

  // Persist progress
  useEffect(() => {
    if (!onboardingOpen) return;
    sessionStorage.setItem("wisechef_onboarding", JSON.stringify({
      step,
      companyId: createdCompanyId,
      companyName,
      companyDescription,
      industry: companyIndustry,
      roles: Array.from(selectedRoles),
    }));
  }, [onboardingOpen, step, createdCompanyId, companyName, companyDescription, companyIndustry, selectedRoles]);

  // Fetch tier limits
  useEffect(() => {
    if (!onboardingOpen) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/onboarding/tier", { credentials: "include", signal: controller.signal });
        if (!res.ok) return;
        const payload = await res.json() as unknown;
        const limit = parseTierAgentLimit(payload);
        if (limit) setMaxAgents(limit);
      } catch { /* ignore */ }
    })();
    return () => controller.abort();
  }, [onboardingOpen]);

  // Clamp selections to maxAgents
  useEffect(() => {
    setSelectedRoles((prev) => {
      if (prev.size <= maxAgents) return prev;
      const next = new Set<string>(["ceo"]);
      for (const role of AGENT_ROLES) {
        if (role.id === "ceo") continue;
        if (prev.has(role.id)) {
          if (next.size >= maxAgents) break;
          next.add(role.id);
        }
      }
      return next;
    });
  }, [maxAgents]);

  const suggestedRoles = useMemo(
    () => AGENT_ROLES.filter((r) => (INDUSTRY_TEAM_SUGGESTIONS[companyIndustry] ?? []).includes(r.id)),
    [companyIndustry],
  );
  const suggestedRoleIdSet = useMemo(
    () => new Set(INDUSTRY_TEAM_SUGGESTIONS[companyIndustry] ?? []),
    [companyIndustry],
  );
  const additionalRolesByCategory = useMemo(
    () => CATEGORY_ORDER.map((category) => ({
      category,
      roles: AGENT_ROLES.filter((r) => r.category === category && !suggestedRoleIdSet.has(r.id)),
    })),
    [suggestedRoleIdSet],
  );

  const toggleRole = useCallback((roleId: string) => {
    setSelectedRoles((prev) => {
      if (roleId === "ceo") return prev; // CEO always required
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        if (next.size >= maxAgents) return prev;
        next.add(roleId);
      }
      return next;
    });
  }, [maxAgents]);

  function handleIndustryChange(industry: Industry) {
    setCompanyIndustry(industry);
    setSelectedRoles(applyIndustrySuggestion(industry, maxAgents));
  }

  async function validateToken(roleId: string, token: string) {
    if (!token.trim()) {
      setTokenValidation((prev) => { const next = { ...prev }; delete next[roleId]; return next; });
      return;
    }
    setTokenValidation((prev) => ({ ...prev, [roleId]: { valid: false, loading: true } }));
    try {
      const res = await fetch("/api/channels/validate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: token.trim(), platform: "telegram" }),
      });
      const data = await res.json() as { valid: boolean; botUsername?: string; error?: string };
      setTokenValidation((prev) => ({ ...prev, [roleId]: { valid: data.valid, botUsername: data.botUsername, error: data.error } }));
    } catch {
      setTokenValidation((prev) => ({ ...prev, [roleId]: { valid: false, error: "Network error" } }));
    }
  }

  function handleTokenChange(roleId: string, value: string) {
    setBotTokens((prev) => ({ ...prev, [roleId]: value }));
    if (value.trim().length > 10) {
      void validateToken(roleId, value.trim());
    } else {
      setTokenValidation((prev) => { const next = { ...prev }; delete next[roleId]; return next; });
    }
  }

  function reset() {
    setStep(1);
    setLoading(false);
    setError(null);
    setCompanyName("");
    setCompanyDescription("");
    setCompanyIndustry("Tech");
    setCreatedCompanyId(null);
    setSelectedRoles(applyIndustrySuggestion("Tech", DEFAULT_MAX_AGENTS));
    setAddMoreRolesOpen(false);
    setMaxAgents(DEFAULT_MAX_AGENTS);
    setBotTokens({});
    setTokenValidation({});
    setDeploymentStatus("idle");
    sessionStorage.removeItem("wisechef_onboarding");
  }

  function handleClose() {
    reset();
    closeOnboarding();
  }

  async function handleStep1Next() {
    if (!companyName.trim() || !companyDescription.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const company = await companiesApi.create({
        name: companyName.trim(),
        description: companyDescription.trim(),
      });
      setCreatedCompanyId(company.id);
      setSelectedCompanyId(company.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });

      await goalsApi.create(company.id, {
        title: companyDescription.trim(),
        level: "company",
        status: "active",
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.list(company.id) });

      setSelectedRoles(applyIndustrySuggestion(companyIndustry, maxAgents));
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create company");
    } finally {
      setLoading(false);
    }
  }

  function handleStep2Next() {
    setError(null);
    setStep(3);
  }

  async function handleLaunchTeam() {
    if (!createdCompanyId) {
      setError("No company selected");
      return;
    }
    setLoading(true);
    setError(null);
    setDeploymentStatus("deploying");

    try {
      const companySlug = slugify(companyName);
      const gatewayUrl = `wss://${companySlug}.wisechef.ai/gateway`;

      // Create all agents in Paperclip DB
      const selected = AGENT_ROLES.filter((r) => selectedRoles.has(r.id));
      const createdAgents: Array<{ id: string; role: string; name: string }> = [];

      for (const role of selected) {
        const agent = await agentsApi.create(createdCompanyId, {
          name: role.name,
          role: role.id,
          adapterType: "openclaw_gateway",
          adapterConfig: {
            url: gatewayUrl,
            authToken: "", // filled by provisioning from gateway token
            agentId: `${companySlug}-${role.id}`,
            autoPairOnFirstConnect: true,
            sessionKeyStrategy: "issue",
            timeoutSec: 300,
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
        });
        createdAgents.push({ id: agent.id, role: role.id, name: role.name });
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(createdCompanyId) });

      // Trigger Docker provisioning
      try {
        const provRes = await fetch("/api/provisioning/deploy-company", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            companyId: createdCompanyId,
            companySlug,
            companyName: companyName.trim(),
            companyDescription: companyDescription.trim(),
            plan: "enterprise",
            agents: createdAgents,
            botTokens: Object.fromEntries(
              Object.entries(botTokens).filter(([, v]) => v.trim().length > 10),
            ),
          }),
        });

        if (provRes.ok) {
          setDeploymentStatus("ready");
        } else {
          console.warn("[wisechef] provisioning non-ok, continuing", await provRes.text());
          setDeploymentStatus("error");
        }
      } catch (provErr) {
        console.warn("[wisechef] provisioning error (non-fatal)", provErr);
        setDeploymentStatus("error");
      }

      handleClose();
      navigate(`/${createdCompanyId}/agents`);
    } catch (err) {
      setDeploymentStatus("error");
      setError(err instanceof Error ? err.message : "Failed to launch team");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || (!e.metaKey && !e.ctrlKey)) return;
    e.preventDefault();
    if (step === 1 && !loading) void handleStep1Next();
    if (step === 2 && !loading) handleStep2Next();
    if (step === 3 && !loading) void handleLaunchTeam();
  }

  if (!onboardingOpen) return null;

  const selectedCount = selectedRoles.size;

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

          {/* Left: Form */}
          <div className="w-full md:w-1/2 flex flex-col overflow-y-auto">
            <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 md:py-12">

              {/* Header */}
              <div className="flex items-center gap-2 mb-6">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Build your AI team</span>
                <span className="text-sm text-muted-foreground/70">Step {step} of 3</span>
              </div>

              {/* ── Step 1: Company basics ── */}
              {step === 1 && (
                <div className="space-y-5 pb-28">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2 rounded-md">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">Let&apos;s set up your AI team</h3>
                      <p className="text-xs text-muted-foreground">A few details to generate the right starting team.</p>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Company name</label>
                    <input
                      className="w-full min-h-[44px] rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                      placeholder="Acme Corp"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">What does your company do?</label>
                    <textarea
                      className="w-full min-h-[88px] rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 resize-y"
                      placeholder="We sell handmade candles online and need help with marketing and customer support."
                      value={companyDescription}
                      onChange={(e) => setCompanyDescription(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Industry</label>
                    <select
                      className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                      value={companyIndustry}
                      onChange={(e) => handleIndustryChange(e.target.value as Industry)}
                    >
                      {INDUSTRIES.map((ind) => (
                        <option key={ind} value={ind}>{ind}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* ── Step 2: Team selection ── */}
              {step === 2 && (
                <div className="space-y-5 pb-28">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2 rounded-md">
                      <Bot className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">Here&apos;s your team</h3>
                      <p className="text-xs text-muted-foreground">We picked roles based on your industry. Tap to add or remove.</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
                    <span className="text-sm font-medium">Suggested for {companyIndustry}</span>
                    <span className="text-xs text-muted-foreground">{selectedCount} of {maxAgents} agents</span>
                  </div>

                  {/* Suggested roles */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {suggestedRoles.map((role) => {
                      const selected = selectedRoles.has(role.id);
                      const Icon = role.icon;
                      const atLimit = !selected && selectedRoles.size >= maxAgents;
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => toggleRole(role.id)}
                          disabled={atLimit}
                          className={cn(
                            "relative min-h-[44px] rounded-md border p-3 text-left transition-colors",
                            selected
                              ? "border-foreground bg-accent"
                              : atLimit
                                ? "border-border/50 opacity-40 cursor-not-allowed"
                                : "border-border hover:bg-accent/50",
                          )}
                        >
                          {selected && <Check className="absolute right-2 top-2 h-4 w-4 text-green-500" />}
                          <div className="flex items-start gap-2 pr-5">
                            <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div>
                              <p className="text-sm font-medium">
                                {role.name}{role.id === "ceo" ? " (required)" : ""}
                              </p>
                              <p className="text-xs text-muted-foreground line-clamp-2">{role.description}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Add more roles collapsible */}
                  <div className="rounded-md border border-border">
                    <button
                      type="button"
                      onClick={() => setAddMoreRolesOpen((p) => !p)}
                      className="w-full min-h-[44px] px-3 py-2 flex items-center justify-between text-left hover:bg-accent/40 transition-colors"
                    >
                      <span className="text-sm font-medium">Add more roles</span>
                      {addMoreRolesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {addMoreRolesOpen && (
                      <div className="border-t border-border p-3 space-y-4">
                        {additionalRolesByCategory.map(({ category, roles }) =>
                          roles.length === 0 ? null : (
                            <div key={category}>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-1.5">
                                {CATEGORY_LABELS[category]}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {roles.map((role) => {
                                  const selected = selectedRoles.has(role.id);
                                  const Icon = role.icon;
                                  const atLimit = !selected && selectedRoles.size >= maxAgents;
                                  return (
                                    <button
                                      key={role.id}
                                      type="button"
                                      onClick={() => toggleRole(role.id)}
                                      disabled={atLimit}
                                      className={cn(
                                        "relative min-h-[44px] rounded-md border p-3 text-left transition-colors",
                                        selected
                                          ? "border-foreground bg-accent"
                                          : atLimit
                                            ? "border-border/50 opacity-40 cursor-not-allowed"
                                            : "border-border hover:bg-accent/50",
                                      )}
                                    >
                                      {selected && <Check className="absolute right-2 top-2 h-4 w-4 text-green-500" />}
                                      <div className="flex items-start gap-2 pr-5">
                                        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                                        <div>
                                          <p className="text-sm font-medium">{role.name}</p>
                                          <p className="text-xs text-muted-foreground line-clamp-2">{role.description}</p>
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Step 3: Telegram bot token ── */}
              {step === 3 && (
                <div className="space-y-6 pb-28">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2 rounded-md">
                      <Send className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">Connect your CEO to Telegram</h3>
                      <p className="text-xs text-muted-foreground">
                        Create a bot via BotFather and paste the token. You can skip and do this later.
                      </p>
                    </div>
                  </div>

                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open BotFather on Telegram
                  </a>

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider">Quick setup</p>
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Open BotFather, send <code className="bg-muted px-1 rounded">/newbot</code></li>
                      <li>Follow the prompts, copy the token it gives you</li>
                      <li>Paste it below</li>
                    </ol>
                  </div>

                  {/* CEO token */}
                  {(() => {
                    const validation = tokenValidation["ceo"];
                    const token = botTokens["ceo"] ?? "";
                    return (
                      <div className="rounded-md border border-border p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Crown className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">CEO</span>
                          <span className="text-xs text-muted-foreground">(your personal assistant)</span>
                        </div>
                        <div className="relative">
                          <input
                            className="w-full min-h-[44px] rounded-md border border-border bg-transparent px-3 py-2 pr-8 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 font-mono text-xs"
                            placeholder="1234567890:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            value={token}
                            onChange={(e) => handleTokenChange("ceo", e.target.value)}
                          />
                          {validation?.loading && <Loader2 className="absolute right-2 top-3 h-4 w-4 animate-spin text-muted-foreground" />}
                          {!validation?.loading && validation?.valid && <CheckCircle2 className="absolute right-2 top-3 h-4 w-4 text-green-500" />}
                          {!validation?.loading && validation && !validation.valid && token && (
                            <AlertCircle className="absolute right-2 top-3 h-4 w-4 text-destructive" />
                          )}
                        </div>
                        {validation?.valid && validation.botUsername && (
                          <p className="text-xs text-green-600">✓ Connected as @{validation.botUsername}</p>
                        )}
                        {validation && !validation.valid && validation.error && token && (
                          <p className="text-xs text-destructive">{validation.error}</p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Optional team bots */}
                  {selectedCount > 1 && (
                    <div className="rounded-md border border-border">
                      <button
                        type="button"
                        onClick={() => setTeamBotsOpen((p) => !p)}
                        className="w-full min-h-[44px] px-3 py-2 flex items-center justify-between text-left hover:bg-accent/40 transition-colors"
                      >
                        <span className="text-sm font-medium">Add Telegram bots for team agents</span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">optional</span>
                          {teamBotsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </span>
                      </button>
                      {teamBotsOpen && (
                        <div className="border-t border-border p-3 space-y-3">
                          <p className="text-xs text-muted-foreground">
                            Each team agent can have its own bot to respond in Telegram groups. Create one per agent via BotFather.
                          </p>
                          {AGENT_ROLES.filter((r) => r.id !== "ceo" && selectedRoles.has(r.id)).map((role) => {
                            const Icon = role.icon;
                            const validation = tokenValidation[role.id];
                            const token = botTokens[role.id] ?? "";
                            return (
                              <div key={role.id} className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm font-medium">{role.name}</span>
                                </div>
                                <div className="relative">
                                  <input
                                    className="w-full min-h-[44px] rounded-md border border-border bg-transparent px-3 py-2 pr-8 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 font-mono text-xs"
                                    placeholder="1234567890:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                    value={token}
                                    onChange={(e) => handleTokenChange(role.id, e.target.value)}
                                  />
                                  {validation?.loading && <Loader2 className="absolute right-2 top-3 h-4 w-4 animate-spin text-muted-foreground" />}
                                  {!validation?.loading && validation?.valid && <CheckCircle2 className="absolute right-2 top-3 h-4 w-4 text-green-500" />}
                                  {!validation?.loading && validation && !validation.valid && token && (
                                    <AlertCircle className="absolute right-2 top-3 h-4 w-4 text-destructive" />
                                  )}
                                </div>
                                {validation?.valid && validation.botUsername && (
                                  <p className="text-xs text-green-600">✓ @{validation.botUsername}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {deploymentStatus === "deploying" && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Setting up your AI team — this takes about 30 seconds…
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="mt-3">
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}
            </div>

            {/* Sticky bottom nav */}
            <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur px-4 sm:px-6 py-3">
              <div className="w-full max-w-3xl mx-auto flex items-center justify-between gap-2">
                <div>
                  {step > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep((s) => (s - 1) as Step)}
                      disabled={loading}
                    >
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                      Back
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {/* Step dots */}
                  <div className="flex gap-1.5">
                    {[1, 2, 3].map((s) => (
                      <div
                        key={s}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full transition-colors",
                          s === step ? "bg-foreground" : s < step ? "bg-foreground/40" : "bg-border",
                        )}
                      />
                    ))}
                  </div>

                  {step === 1 && (
                    <Button
                      size="sm"
                      onClick={() => void handleStep1Next()}
                      disabled={loading || !companyName.trim() || !companyDescription.trim()}
                    >
                      {loading
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Creating…</>
                        : <><ArrowRight className="h-3.5 w-3.5 mr-1" />Next</>
                      }
                    </Button>
                  )}
                  {step === 2 && (
                    <Button
                      size="sm"
                      onClick={handleStep2Next}
                      disabled={!createdCompanyId || selectedRoles.size === 0}
                    >
                      <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      Next
                    </Button>
                  )}
                  {step === 3 && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleLaunchTeam()}
                        disabled={loading}
                      >
                        Skip for now
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void handleLaunchTeam()}
                        disabled={loading || !createdCompanyId}
                      >
                        {loading
                          ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Launching…</>
                          : <><ArrowRight className="h-3.5 w-3.5 mr-1" />Launch team</>
                        }
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Animation */}
          <div className="hidden md:block w-1/2 overflow-hidden">
            <AsciiArtAnimation />
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
