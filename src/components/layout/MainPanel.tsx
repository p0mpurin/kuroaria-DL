import { MoreVertical, Settings } from "lucide-react";
import { DownloadCard } from "./DownloadCard";
import { UrlQuickAdd } from "./UrlQuickAdd";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DownloadItem, ViewId } from "@/lib/types";

interface MainPanelProps {
  view: ViewId;
  downloads: DownloadItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onAddUrl: (url: string) => Promise<void>;
  onOpenSettings: () => void;
}

const viewTitles: Record<Exclude<ViewId, "settings">, string> = {
  downloads: "Downloads",
  queue: "Queue",
  completed: "Completed",
  failed: "Failed",
};

function filterByView(view: ViewId, items: DownloadItem[]): DownloadItem[] {
  const visible = items.filter((d) => d.status !== "removed");
  switch (view) {
    case "downloads":
      return visible.filter(
        (d) =>
          d.status === "active" ||
          d.status === "paused" ||
          d.status === "waiting",
      );
    case "queue":
      return visible.filter((d) => d.status === "waiting");
    case "completed":
      return visible.filter((d) => d.status === "complete");
    case "failed":
      return visible.filter((d) => d.status === "error");
    default:
      return visible;
  }
}

function countSummary(all: DownloadItem[]): string {
  const visible = all.filter((d) => d.status !== "removed");
  const active = visible.filter((d) => d.status === "active").length;
  const queued = visible.filter((d) => d.status === "waiting").length;
  return `${active} Active | ${queued} Queued`;
}

export function MainPanel({
  view,
  downloads,
  selectedId,
  onSelect,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onOpenFolder,
  onAddUrl,
  onOpenSettings,
}: MainPanelProps) {
  const filtered = filterByView(view, downloads);
  const title = viewTitles[view as keyof typeof viewTitles] ?? "Downloads";
  const showQuickAdd = view === "downloads" || view === "queue";

  return (
    <main className="grid-paper flex min-w-0 flex-1 flex-col">
      <header className="flex items-start justify-between px-8 pt-8 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {view === "downloads" && (
            <p className="mt-1 text-sm text-muted-foreground">
              {countSummary(downloads)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-md p-2 text-muted-foreground hover:bg-card/80 hover:text-foreground"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="rounded-md p-2 text-muted-foreground hover:bg-card/80 hover:text-foreground"
            aria-label="More"
          >
            <MoreVertical className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-8 pb-8">
        {showQuickAdd && <UrlQuickAdd onAdd={onAddUrl} />}

        <ScrollArea className="flex-1">
          <div className="download-list space-y-3">
            {filtered.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No downloads in this view.
              </p>
            ) : (
              filtered.map((d) => (
                <DownloadCard
                  key={d.id}
                  download={d}
                  selected={selectedId === d.id}
                  onSelect={() => onSelect(d.id)}
                  onPause={() => onPause(d.id)}
                  onResume={() => onResume(d.id)}
                  onCancel={() => onCancel(d.id)}
                  onRetry={() => onRetry(d.id)}
                  onOpenFolder={() => onOpenFolder(d.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </main>
  );
}
