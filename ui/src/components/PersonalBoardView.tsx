import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, WifiOff, ExternalLink } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { Button } from "@/components/ui/button";

interface DeploymentInfo {
  running: boolean;
  healthy: boolean;
  hostname?: string;
}

/**
 * Renders the wisechef-board (personal assistant dashboard) inside an iframe.
 * The sidebar nav controls which board page is shown via the URL hash.
 */
export function PersonalBoardView() {
  const { selectedCompanyId } = useCompany();
  const { boardPage } = useWorkspace();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [deployment, setDeployment] = useState<DeploymentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [iframeLoaded, setIframeLoaded] = useState(false);

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

  const boardUrl = useMemo(() => {
    if (!deployment?.hostname) return null;
    // link-channel is at /link path, others use hash routing
    if (boardPage === "link-channel") {
      return `https://${deployment.hostname}/link`;
    }
    if (boardPage === "memory") {
      return `https://${deployment.hostname}/memory`;
    }
    return `https://${deployment.hostname}/#${boardPage}`;
  }, [deployment?.hostname, boardPage]);

  // When boardPage changes and iframe is loaded, update it
  useEffect(() => {
    if (!iframeRef.current || !iframeLoaded || !boardUrl) return;
    const current = iframeRef.current.src;
    if (current !== boardUrl) {
      iframeRef.current.src = boardUrl;
    }
  }, [boardUrl, iframeLoaded]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!deployment?.hostname) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
        <WifiOff className="h-12 w-12 text-muted-foreground/40" />
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-foreground">
            Personal assistant not deployed
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Switch to the company view and deploy your company to activate your personal CEO agent.
          </p>
        </div>
      </div>
    );
  }

  if (!boardUrl) return null;

  return (
    <div className="relative h-full w-full">
      {/* Open in new tab shortcut */}
      <div className="absolute top-2 right-2 z-10">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs bg-background/80 backdrop-blur-sm"
          asChild
        >
          <a href={boardUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3" />
            Open in tab
          </a>
        </Button>
      </div>

      {/* Loading overlay */}
      {!iframeLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-5">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading dashboard…</span>
          </div>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={boardUrl}
        className="w-full h-full border-0"
        title="Personal Assistant Dashboard"
        allow="clipboard-write; microphone"
        onLoad={() => setIframeLoaded(true)}
      />
    </div>
  );
}
