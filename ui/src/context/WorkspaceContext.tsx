import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type WorkspaceView = "personal" | "company";

interface WorkspaceContextValue {
  view: WorkspaceView;
  setView: (view: WorkspaceView) => void;
  isPersonal: boolean;
}

const STORAGE_KEY = "wisechef.workspaceView";

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<WorkspaceView>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "personal" ? "personal" : "company";
  });

  const setView = useCallback((next: WorkspaceView) => {
    setViewState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ view, setView, isPersonal: view === "personal" }),
    [view, setView],
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}
