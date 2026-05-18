import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AddDownloadDialog } from "@/components/AddDownloadDialog";

import { SettingsView } from "@/components/SettingsView";

import { DetailPanel } from "@/components/layout/DetailPanel";

import { MainPanel } from "@/components/layout/MainPanel";

import { Sidebar } from "@/components/layout/Sidebar";

import * as api from "@/lib/api";

import { applyTheme, themeFromSettings } from "@/lib/theme";

import { ToastProvider, useToast } from "@/lib/toast";

import type { AppSettings, DownloadItem, DownloadStatus, ViewId } from "@/lib/types";



const defaultSettings: AppSettings = {

  download_dir: "",

  max_concurrent: 3,

  retry_attempts: 3,

  max_download_speed: 0,

  max_upload_speed: 0,

  auto_start: true,

  aria2_rpc_url: "http://127.0.0.1:6800/jsonrpc",

  aria2_rpc_secret: "",

  split: 16,

  bridge_enabled: false,

  bridge_port: 17888,

  theme: "dark",

  minimize_to_tray: true,

  launch_at_login: false,

};



function isSelectable(d: DownloadItem): boolean {

  return d.status !== "removed";

}



function AppInner() {

  const toast = useToast();

  const [view, setView] = useState<ViewId>("downloads");

  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [aria2Connected, setAria2Connected] = useState(false);

  const [addOpen, setAddOpen] = useState(false);

  const statusById = useRef<Map<string, DownloadStatus>>(new Map());

  const initialized = useRef(false);



  const notifyStatusChanges = useCallback(

    (items: DownloadItem[]) => {

      const prev = statusById.current;

      const next = new Map<string, DownloadStatus>();



      for (const d of items) {

        if (d.status === "removed") continue;

        const old = prev.get(d.id);

        next.set(d.id, d.status);



        if (!initialized.current) continue;

        if (old === d.status) continue;



        if (d.status === "complete") {

          toast.success("Download complete", d.filename);

        } else if (d.status === "error") {

          toast.error(

            "Download failed",

            d.error_message ?? d.filename,

          );

        } else if (old === undefined && (d.status === "waiting" || d.status === "active")) {

          toast.info("Added to queue", d.filename);

        }

      }



      statusById.current = next;

    },

    [toast],

  );



  const applySnapshot = useCallback(

    (snapshot: Awaited<ReturnType<typeof api.getSnapshot>>) => {

      const visible = snapshot.downloads.filter(isSelectable);

      notifyStatusChanges(snapshot.downloads);

      setDownloads(snapshot.downloads);

      setSettings(snapshot.settings);

      setAria2Connected(snapshot.aria2_connected);

      applyTheme(themeFromSettings(snapshot.settings));

      setSelectedId((prev) => {

        if (prev && visible.some((d) => d.id === prev)) return prev;

        const firstActive = visible.find(

          (d) => d.status === "active" || d.status === "paused",

        );

        return firstActive?.id ?? visible[0]?.id ?? null;

      });

      initialized.current = true;

    },

    [notifyStatusChanges],

  );



  useEffect(() => {

    applyTheme("dark");

    api.getSnapshot().then(applySnapshot).catch(console.error);

    let unlisten: (() => void) | undefined;

    api.onDownloadsUpdated(applySnapshot).then((fn) => {

      unlisten = fn;

    });

    return () => unlisten?.();

  }, [applySnapshot]);



  const selected = useMemo(() => {

    if (!selectedId) return null;

    const item = downloads.find((d) => d.id === selectedId);

    if (!item || !isSelectable(item)) return null;

    return item;

  }, [downloads, selectedId]);



  const handleSelect = async (id: string) => {

    setSelectedId(id);

    await api.selectDownload(id);

  };



  const handleAdd = async (url: string, filename?: string) => {

    try {

      await api.addDownload({ url, filename });

    } catch (e) {

      toast.error("Could not add download", e instanceof Error ? e.message : "Unknown error");

      throw e;

    }

  };



  const handleCancel = async (id: string) => {

    setDownloads((prev) => prev.filter((d) => d.id !== id));

    if (selectedId === id) {

      setSelectedId(null);

    }

    try {

      await api.cancelDownload(id);

      toast.info("Download cancelled");

    } catch (e) {

      console.error(e);

      const snapshot = await api.getSnapshot();

      applySnapshot(snapshot);

      toast.error("Cancel failed", e instanceof Error ? e.message : "Unknown error");

    }

  };



  const handleSaveSettings = async (next: AppSettings) => {

    const saved = await api.updateSettings(next);

    setSettings(saved);

    applyTheme(themeFromSettings(saved));

    toast.success("Settings saved");

  };



  const handlePickDir = async () => {

    const dir = await api.pickDownloadDir();

    if (dir) {

      setSettings((s) => ({ ...s, download_dir: dir }));

    }

  };



  return (
    <div className="flex h-screen overflow-hidden bg-background">

      <Sidebar

        activeView={view}

        onViewChange={setView}

        onAddDownload={() => setAddOpen(true)}

      />



      {view === "settings" ? (

        <SettingsView

          settings={settings}

          aria2Connected={aria2Connected}

          onSave={handleSaveSettings}

          onPickDir={handlePickDir}

        />

      ) : (

        <>

          <MainPanel

            view={view}

            downloads={downloads}

            selectedId={selectedId}

            onSelect={handleSelect}

            onPause={api.pauseDownload}

            onResume={api.resumeDownload}

            onCancel={handleCancel}

            onRetry={api.retryDownload}

            onOpenFolder={api.openDownloadFolder}

            onAddUrl={(url) => handleAdd(url)}

            onOpenSettings={() => setView("settings")}

          />

          <DetailPanel download={selected} />

        </>

      )}



      <AddDownloadDialog

        open={addOpen}

        onOpenChange={setAddOpen}

        onSubmit={handleAdd}

      />

    </div>
  );
}

function App() {

  return (

    <ToastProvider>

      <AppInner />

    </ToastProvider>

  );

}



export default App;

