import { motion, AnimatePresence } from "framer-motion";
import { FileArchive } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatBytes, formatEta, formatSpeed } from "@/lib/utils";
import type { DownloadItem } from "@/lib/types";

interface DetailPanelProps {
  download: DownloadItem | null;
}

function statusLabel(status: DownloadItem["status"]): string {
  const map: Record<DownloadItem["status"], string> = {
    active: "Downloading",
    waiting: "Queued",
    paused: "Paused",
    complete: "Complete",
    error: "Failed",
    removed: "Removed",
  };
  return map[status];
}

export function DetailPanel({ download }: DetailPanelProps) {
  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-border bg-card/90 backdrop-blur-sm">
      <AnimatePresence mode="wait">
        {download ? (
          <motion.div
            key={download.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
            className="flex h-full flex-col"
          >
            <div className="px-6 pt-8 pb-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted">
                  <FileArchive className="h-6 w-6 text-foreground" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-foreground">
                    {download.filename}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {statusLabel(download.status)}
                  </p>
                </div>
              </div>

              <motion.div
                className="mt-8 grid grid-cols-2 gap-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.05 }}
              >
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Speed
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {download.download_speed > 0
                      ? formatSpeed(download.download_speed)
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    ETA
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {download.eta_seconds > 0
                      ? `${formatEta(download.eta_seconds)} left`
                      : "-"}
                  </p>
                </div>
              </motion.div>

              <div className="mt-8">
                <div className="flex items-baseline justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Progress
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(download.progress_percent)}% |{" "}
                    {formatBytes(download.completed_length)} /{" "}
                    {formatBytes(download.total_length)}
                  </p>
                </div>
                <Progress
                  value={download.progress_percent}
                  className="mt-2 h-2"
                />
              </div>
            </div>

            <Separator />

            <ScrollArea className="flex-1 px-6 py-5">
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Source URL
                  </p>
                  <p className="mt-1 break-all text-xs leading-relaxed text-muted-foreground">
                    {download.url}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Location
                  </p>
                  <p className="mt-1 break-all text-xs leading-relaxed text-muted-foreground">
                    {download.dir}
                  </p>
                </div>
                {download.connections > 0 && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                      Connections
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {download.connections} segments
                    </p>
                  </div>
                )}
                {download.error_message && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-red-400">
                      Error
                    </p>
                    <p className="mt-1 text-xs text-red-600">
                      {download.error_message}
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="border-t border-border bg-muted/50 px-6 py-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Status Log
              </p>
              <div className="max-h-28 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed text-muted-foreground">
                {download.logs.length === 0 ? (
                  <p className="text-muted-foreground/70">No log entries yet.</p>
                ) : (
                  download.logs.map((log, i) => (
                    <p key={`${log.timestamp}-${i}`}>
                      <span className="text-muted-foreground/70">[{log.category}]</span>{" "}
                      {log.message}
                    </p>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground/70"
          >
            Select a download to view details
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
