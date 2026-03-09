import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type WorkspaceView = "personal" | "company";
type BoardPage = string;

interface WorkspaceContextValue {
  view: WorkspaceView;
  setView: (view: WorkspaceView) => void;
  isPersonal: boolean;
  boardPage: BoardPage;
  setBoardPage: (page: BoardPage) => void;
}

const STORAGE_KEY = "wisechef.workspaceView";
const BOARD_PAGE_KEY = "wisechef.boardPage";

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<WorkspaceView>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "personal" ? "personal" : "company";
  });

  const [boardPage, setBoardPageState] = useState<BoardPage>(() => {
    return localStorage.getItem(BOARD_PAGE_KEY) || "chat";
  });

  const setView = useCallback((next: WorkspaceView) => {
    setViewState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const setBoardPage = useCallback((page: BoardPage) => {
    setBoardPageState(page);
    localStorage.setItem(BOARD_PAGE_KEY, page);
  }, []);

  const value = useMemo(
    () => ({
      view,
      setView,
      isPersonal: view === "personal",
      boardPage,
      setBoardPage,
    }),
    [view, setView, boardPage, setBoardPage],
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
