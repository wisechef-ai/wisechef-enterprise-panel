import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle,
  Settings,
  Link2,
  Brain,
  Heart,
  KeyRound,
  Cpu,
  LayoutDashboard,
  FolderOpen,
  Calendar,
  Puzzle,
  Loader2,
  Crown,
  WifiOff,
} from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { cn } from "../lib/utils";

interface DeploymentInfo {
  running: boolean;
  healthy: boolean;
  hostname?: string;
  agentCount?: number;
}

const BOARD_PAGES = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "kanban", label: "Tasks", icon: LayoutDashboard },
  { id: "calendar", label: "Activity", icon: Calendar },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "skills", label: "Skills", icon: Puzzle },
  { id: "soul", label: "Soul / Persona", icon: Heart },
  { id: "credentials", label: "Credentials", icon: KeyRound },
  { id: "ai-provider", label: "AI Provider", icon: Cpu },
  { id: "link-channel", label: "Link Channel", icon: Link2 },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

export type BoardPage = (typeof BOARD_PAGES)[number]["id"];

export function PersonalSidebar() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { boardPage, setBoardPage } = useWorkspace();
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
    const interval = setInterval(fetchStatus, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedCompanyId]);

  const isOnline = deployment?.running && deployment?.healthy;

  const handleNavClick = useCallback(
    (pageId: string) => {
      setBoardPage(pageId as BoardPage);
    },
    [setBoardPage],
  );

  return (
    <aside className="w-60 h-full min-h-0 border-r border-border bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-12 shrink-0 border-b border-border">
        <Crown className="h-4 w-4 text-amber-500 shrink-0" />
        <span className="text-sm font-bold text-foreground truncate">
          Personal Assistant
        </span>
        {!loading && (
          <span
            className={cn(
              "ml-auto h-2 w-2 rounded-full shrink-0",
              isOnline ? "bg-green-400" : "bg-red-400",
            )}
            title={isOnline ? "Online" : "Offline"}
          />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !selectedCompany ? (
          <div className="text-sm text-muted-foreground px-3 py-4">
            Select a company to see your personal assistant.
          </div>
        ) : !deployment?.hostname ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 mx-1 mt-2 text-sm text-muted-foreground">
            <WifiOff className="h-4 w-4 mb-1.5 text-muted-foreground" />
            <p>Assistant not deployed yet.</p>
            <p className="mt-1 text-xs">
              Deploy your company from the enterprise view to activate your CEO agent.
            </p>
          </div>
        ) : (
          BOARD_PAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors",
                boardPage === item.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          ))
        )}
      </nav>

      {/* Company info footer */}
      {selectedCompany && (
        <div className="border-t border-border px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {selectedCompany.brandColor && (
              <div
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: selectedCompany.brandColor }}
              />
            )}
            <span className="truncate font-medium">{selectedCompany.name}</span>
          </div>
          {deployment?.agentCount != null && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              {deployment.agentCount} agent{deployment.agentCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
