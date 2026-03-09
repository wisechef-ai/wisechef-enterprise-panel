import { useState, useEffect } from "react";
import {
  ExternalLink,
  MessageCircle,
  Settings,
  Link2,
  Bot,
  Brain,
  Loader2,
  Crown,
} from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { Button } from "@/components/ui/button";

interface DeploymentInfo {
  running: boolean;
  healthy: boolean;
  hostname?: string;
  agentCount?: number;
}

export function PersonalSidebar() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [deployment, setDeployment] = useState<DeploymentInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedCompanyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch(`/api/provisioning/company/${selectedCompanyId}/status`, {
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) setDeployment(null);
          return;
        }
        const data = (await res.json()) as DeploymentInfo;
        if (!cancelled) setDeployment(data);
      } catch {
        if (!cancelled) setDeployment(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    void fetchStatus();
    return () => { cancelled = true; };
  }, [selectedCompanyId]);

  const boardUrl = deployment?.hostname ? `https://${deployment.hostname}` : null;
  const isOnline = deployment?.running && deployment?.healthy;

  return (
    <aside className="w-60 h-full min-h-0 border-r border-border bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-12 shrink-0 border-b border-border">
        <Crown className="h-4 w-4 text-amber-500 shrink-0" />
        <span className="text-sm font-bold text-foreground truncate">
          Personal Assistant
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !selectedCompany ? (
          <div className="text-sm text-muted-foreground py-4">
            Select a company to see your personal assistant.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Status */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                CEO Agent
              </h3>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${isOnline ? "bg-green-400" : "bg-red-400"}`}
                />
                <span className="text-foreground">
                  {isOnline ? "Online" : "Offline"}
                </span>
                {deployment?.hostname && (
                  <span className="text-xs text-muted-foreground truncate">
                    {deployment.hostname}
                  </span>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quick Actions
              </h3>
              <div className="space-y-1">
                {boardUrl && (
                  <a
                    href={boardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-foreground hover:bg-accent/50 rounded-md transition-colors group"
                  >
                    <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                    <span className="flex-1 truncate">Chat with CEO</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </a>
                )}

                {boardUrl && (
                  <a
                    href={`${boardUrl}?skip`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-foreground hover:bg-accent/50 rounded-md transition-colors group"
                  >
                    <Bot className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                    <span className="flex-1 truncate">Agent Dashboard</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </a>
                )}

                {boardUrl && (
                  <a
                    href={`${boardUrl}/link`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-foreground hover:bg-accent/50 rounded-md transition-colors group"
                  >
                    <Link2 className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                    <span className="flex-1 truncate">Connect Messenger</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </a>
                )}

                {boardUrl && (
                  <a
                    href={`${boardUrl}/memory`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-foreground hover:bg-accent/50 rounded-md transition-colors group"
                  >
                    <Brain className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                    <span className="flex-1 truncate">Agent Memory</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </a>
                )}

                {boardUrl && (
                  <a
                    href={`${boardUrl}/settings`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-foreground hover:bg-accent/50 rounded-md transition-colors group"
                  >
                    <Settings className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                    <span className="flex-1 truncate">Agent Settings</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </a>
                )}
              </div>
            </div>

            {/* No deployment state */}
            {!boardUrl && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                <p>Your personal assistant hasn't been deployed yet.</p>
                <p className="mt-1 text-xs">
                  Deploy your company from the enterprise panel to activate your CEO agent.
                </p>
              </div>
            )}

            {/* Company info */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Company
              </h3>
              <div className="text-sm space-y-1">
                <div className="flex items-center gap-2">
                  {selectedCompany.brandColor && (
                    <div
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: selectedCompany.brandColor }}
                    />
                  )}
                  <span className="font-medium text-foreground">{selectedCompany.name}</span>
                </div>
                {selectedCompany.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {selectedCompany.description}
                  </p>
                )}
                {deployment?.agentCount != null && (
                  <p className="text-xs text-muted-foreground">
                    {deployment.agentCount} agent{deployment.agentCount !== 1 ? "s" : ""} deployed
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
