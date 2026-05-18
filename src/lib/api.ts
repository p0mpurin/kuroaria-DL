import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AddDownloadRequest,
  AppSettings,
  DownloadItem,
  DownloadsSnapshot,
} from "./types";

export async function getSnapshot(): Promise<DownloadsSnapshot> {
  return invoke("get_snapshot");
}

export async function addDownload(req: AddDownloadRequest): Promise<DownloadItem> {
  return invoke("add_download", { req });
}

export async function pauseDownload(id: string): Promise<void> {
  return invoke("pause_download", { id });
}

export async function resumeDownload(id: string): Promise<void> {
  return invoke("resume_download", { id });
}

export async function cancelDownload(id: string): Promise<void> {
  return invoke("cancel_download", { id });
}

export async function retryDownload(id: string): Promise<void> {
  return invoke("retry_download", { id });
}

export async function removeDownload(id: string): Promise<void> {
  return invoke("remove_download", { id });
}

export async function selectDownload(id: string | null): Promise<void> {
  return invoke("select_download", { id });
}

export async function getSelectedId(): Promise<string | null> {
  return invoke("get_selected_id");
}

export async function updateSettings(settings: AppSettings): Promise<AppSettings> {
  return invoke("update_settings", { settings });
}

export async function pickDownloadDir(): Promise<string | null> {
  return invoke("pick_download_dir");
}

export async function openDownloadFolder(id: string): Promise<void> {
  return invoke("open_download_folder", { id });
}

export async function checkAria2Connection(): Promise<boolean> {
  return invoke("check_aria2_connection");
}

export function onDownloadsUpdated(
  handler: (snapshot: DownloadsSnapshot) => void,
): Promise<() => void> {
  return listen<DownloadsSnapshot>("downloads-updated", (event) => {
    handler(event.payload);
  });
}
