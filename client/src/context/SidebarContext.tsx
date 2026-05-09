import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('nrl-sidebar-collapsed') === 'true'
  );

  const toggle = () => {
    setCollapsed(c => {
      const next = !c;
      localStorage.setItem('nrl-sidebar-collapsed', String(next));
      return next;
    });
  };

  return <SidebarContext.Provider value={{ collapsed, toggle }}>{children}</SidebarContext.Provider>;
}

export function useSidebarContext() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebarContext must be used within SidebarProvider');
  return ctx;
}
