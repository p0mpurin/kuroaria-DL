export type ViewId = "downloads" | "queue" | "completed" | "failed" | "settings";

export type AppTheme = "light" | "dark" | "midnight" | "amoled";

export type DownloadStatus =
  | "active"
  | "waiting"
  | "paused"
  | "complete"
  | "error"
  | "removed";

export interface LogEntry {
  category: string;
  message: string;
  timestamp: string;
}

export interface DownloadItem {
  id: string;
  gid: string | null;
  url: string;
  filename: string;
  status: DownloadStatus;
  total_length: number;
  completed_length: number;
  download_speed: number;
  progress_percent: number;
  eta_seconds: number;
  dir: string;
  connections: number;
  error_message: string | null;
  retry_count: number;
  logs: LogEntry[];
  added_at: string;
}

export interface AppSettings {
  download_dir: string;
  max_concurrent: number;
  retry_attempts: number;
  max_download_speed: number;
  max_upload_speed: number;
  auto_start: boolean;
  aria2_rpc_url: string;
  aria2_rpc_secret: string;
  split: number;
  bridge_enabled: boolean;
  bridge_port: number;
  theme: AppTheme;
  minimize_to_tray: boolean;
  launch_at_login: boolean;
  sort_by_type: boolean;
}

export interface DownloadsSnapshot {
  downloads: DownloadItem[];
  settings: AppSettings;
  aria2_connected: boolean;
}

export interface AddDownloadRequest {
  url: string;
  filename?: string;
}
