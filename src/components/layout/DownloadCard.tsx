import { motion } from "framer-motion";
import {
  FolderOpen,
  Pause,
  Play,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn, formatBytes, formatEta, formatSpeed } from "@/lib/utils";
import type { DownloadItem } from "@/lib/types";

interface DownloadCardProps {
  download: DownloadItem;
  selected: boolean;
  onSelect: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onOpenFolder: () => void;
}

export function DownloadCard({
  download,
  selected,
  onSelect,
  onPause,
  onResume,
  onCancel,
  onRemove,
  onRetry,
  onOpenFolder,
}: DownloadCardProps) {
  const isActive = download.status === "active";
  const isPaused = download.status === "paused";
  const isComplete = download.status === "complete";
  const isError = download.status === "error";
  const showProgress =
    isActive || isPaused || download.status === "waiting";

  const statusLabel =
    download.status === "waiting"
      ? "Queued"
      : download.status.charAt(0).toUpperCase() + download.status.slice(1);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onSelect}
      className={cn(
        "cursor-pointer rounded-xl border bg-card px-5 py-4 shadow-sm transition-[border-color,box-shadow]",
        selected
          ? "download-card-selected"
          : "border-border hover:border-brand/40 hover:shadow-md",
      )}
    >
      <motion.div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-card-foreground">
                {download.filename}
              </h3>
              {!showProgress && (
                <p className="mt-0.5 text-xs text-muted-foreground">{statusLabel}</p>
              )}
            </div>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {formatBytes(download.total_length)}
            </span>
          </div>

          {showProgress && (
            <>
              <div className="mt-3">
                <Progress value={download.progress_percent} className="h-1" />
              </div>
              <motion.div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {Math.round(download.progress_percent)}%
                  {isActive && download.download_speed > 0 && (
                    <>
                      {" "}
                      | {formatSpeed(download.download_speed)}
                    </>
                  )}
                </span>
                <span>
                  {isActive && download.eta_seconds > 0
                    ? formatEta(download.eta_seconds)
                    : statusLabel}
                </span>
              </motion.div>
            </>
          )}
        </div>

        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {(isActive || isPaused) && (
            <button
              type="button"
              onClick={isPaused ? onResume : onPause}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? (
                <Play className="h-3.5 w-3.5" />
              ) : (
                <Pause className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {!isComplete && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Cancel"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          )}
          {isError && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Retry"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          {isComplete && (
            <>
              <button
                type="button"
                onClick={onOpenFolder}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Open folder"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/15 hover:text-red-400"
                aria-label="Delete file and remove from list"
                title="Delete file and remove from list"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.article>
  );
}
