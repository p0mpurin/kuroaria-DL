import { motion } from "framer-motion";
import {
  CheckCircle2,
  CloudDownload,
  ListOrdered,
  Settings,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ViewId } from "@/lib/types";

const navItems: { id: ViewId; label: string; icon: typeof CloudDownload }[] = [
  { id: "downloads", label: "Downloads", icon: CloudDownload },
  { id: "queue", label: "Queue", icon: ListOrdered },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
  { id: "failed", label: "Failed", icon: XCircle },
];

interface SidebarProps {
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
  onAddDownload: () => void;
}

export function Sidebar({
  activeView,
  onViewChange,
  onAddDownload,
}: SidebarProps) {
  return (
    <aside className="flex w-[220px] shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <motion.div
        className="flex items-center gap-3 px-5 pt-6 pb-8"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="flex h-9 w-9 items-center justify-center rounded-md border border-sidebar-border bg-sidebar text-sm font-bold tracking-tight"
          whileHover={{ scale: 1.02 }}
        >
          KA
        </motion.div>
        <span className="text-sm font-semibold tracking-tight">KuroAria DL</span>
      </motion.div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-border text-sidebar-foreground"
                  : "text-sidebar-muted hover:bg-sidebar-border/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <motion.div
        className="mt-auto space-y-3 border-t border-sidebar-border px-3 py-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        <button
          type="button"
          onClick={() => onViewChange("settings")}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            activeView === "settings"
              ? "bg-sidebar-border text-sidebar-foreground"
              : "text-sidebar-muted hover:text-sidebar-foreground",
          )}
        >
          <Settings className="h-4 w-4" strokeWidth={1.75} />
          Settings
        </button>
        <Button
          className="w-full bg-accent font-semibold text-accent-foreground hover:opacity-90"
          onClick={onAddDownload}
        >
          Add Download
        </Button>
      </motion.div>
    </aside>
  );
}
