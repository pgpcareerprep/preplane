import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { Topbar } from "./Topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-n50 text-n900 dark:bg-d-bg dark:text-d-text">
      <Topbar />
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <AppSidebar />
        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0, 0, 0.2, 1] }}
            className="w-full px-gutter py-gutter"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}