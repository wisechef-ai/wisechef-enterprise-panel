import { useState, useEffect } from "react";
import { useCompany } from "../context/CompanyContext";
import { Loader2, CheckCircle2, AlertCircle, Send, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type DeployStatus = "deploying" | "ready" | "error" | "none";

export function DeploymentBanner() {
  const { selectedCompanyId } = useCompany();
  const [status, setStatus] = useState<DeployStatus>("none");
  const [hostname, setHostname] = useState<string>("");
  const [dismissed, setDismissed] = useState(false);
  const [channelConnected, setChannelConnected] = useState(false);

  useEffect(() => {
    if (!selectedCompanyId) return;
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`/api/provisioning/company/${selectedCompanyId}/status`, {
          credentials: "include",
        });
        if (!res.ok) {
          if (res.status === 404) {
            setStatus("none");
          }
          return;
        }
        const data = (await res.json()) as {
          running: boolean;
          healthy: boolean;
          hostname?: string;
        };
        if (!cancelled) {
          setHostname(data.hostname ?? "");
          if (data.running && data.healthy) {
            setStatus("ready");
          } else if (data.running) {
            setStatus("deploying");
          } else {
            setStatus("error");
          }
        }
      } catch {
        // provisioning API not available — skip banner
      }
    }

    void check();
    // Poll while deploying
    const interval = setInterval(() => {
      if (status === "deploying") void check();
    }, 10_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedCompanyId, status]);

  if (status === "none" || dismissed) return null;

  return (
    <div className="space-y-2">
      {status === "deploying" && (
        <div className="flex items-center gap-3 rounded-md border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-blue-400 shrink-0" />
          <div className="flex-1">
            <span className="font-medium">Setting up your AI team...</span>
            <span className="text-muted-foreground ml-2">This takes about 30 seconds.</span>
          </div>
        </div>
      )}

      {status === "ready" && !channelConnected && (
        <div className="flex items-center gap-3 rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm">
          <Send className="h-4 w-4 text-green-400 shrink-0" />
          <div className="flex-1">
            <span className="font-medium">Your team is live!</span>
            {hostname && (
              <span className="text-muted-foreground ml-2">
                Running at{" "}
                <a
                  href={`https://${hostname}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-400 hover:underline inline-flex items-center gap-1"
                >
                  {hostname}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" className="shrink-0 h-7 px-2" onClick={() => setDismissed(true)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {status === "ready" && channelConnected && (
        <div className="flex items-center gap-3 rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
          <div className="flex-1">
            <span className="font-medium">Everything's connected!</span>
            <span className="text-muted-foreground ml-2">Your CEO is ready to chat on Telegram.</span>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0 h-7 px-2" onClick={() => setDismissed(true)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <div className="flex-1">
            <span className="font-medium">Deployment issue</span>
            <span className="text-muted-foreground ml-2">Your team containers may be starting up. Check back in a minute.</span>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0 h-7 px-2" onClick={() => setDismissed(true)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
