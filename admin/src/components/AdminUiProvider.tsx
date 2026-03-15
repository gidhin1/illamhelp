"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";

type AdminUiContextValue = {
  isDesktopSidebarCollapsed: boolean;
  toggleDesktopSidebar: () => void;
};

const AdminUiContext = createContext<AdminUiContextValue | null>(null);

export function AdminUiProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);

  const value = useMemo<AdminUiContextValue>(
    () => ({
      isDesktopSidebarCollapsed,
      toggleDesktopSidebar: () => {
        setIsDesktopSidebarCollapsed((current) => !current);
      }
    }),
    [isDesktopSidebarCollapsed]
  );

  return <AdminUiContext.Provider value={value}>{children}</AdminUiContext.Provider>;
}

export function useAdminUi(): AdminUiContextValue {
  const context = useContext(AdminUiContext);
  if (!context) {
    throw new Error("useAdminUi must be used within AdminUiProvider.");
  }
  return context;
}
