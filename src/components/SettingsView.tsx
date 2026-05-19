import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { ThemePicker } from "@/components/ThemePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { applyTheme } from "@/lib/theme";
import type { AppSettings, AppTheme } from "@/lib/types";

interface SettingsViewProps {
  settings: AppSettings;
  aria2Connected: boolean;
  onSave: (settings: AppSettings) => Promise<void>;
  onPickDir: () => Promise<void>;
}

export function SettingsView({
  settings,
  aria2Connected,
  onSave,
  onPickDir,
}: SettingsViewProps) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) {
      setDraft(settings);
    }
  }, [settings]);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    dirtyRef.current = true;
    setDraft((s) => ({ ...s, [key]: value }));
  };

  const persist = useCallback(
    async (next: AppSettings) => {
      setSaving(true);
      try {
        await onSave(next);
        dirtyRef.current = false;
      } finally {
        setSaving(false);
      }
    },
    [onSave],
  );

  const handleSave = async () => {
    await persist(draft);
  };

  const saveToggle = async (patch: Partial<AppSettings>) => {
    const unchanged = (Object.keys(patch) as (keyof AppSettings)[]).every(
      (key) => patch[key] === settings[key],
    );
    const next = { ...draft, ...patch };
    setDraft(next);
    if (unchanged) return;
    dirtyRef.current = true;
    await persist(next);
  };

  return (
    <main className="grid-paper flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-xl px-8 py-8">
        <div className="flex items-center gap-4">
          <Logo size="lg" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Settings
            </h1>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          aria2 {aria2Connected ? "connected" : "disconnected"}
        </p>

        <div className="mt-8 space-y-8 rounded-xl border border-border bg-card p-6 shadow-sm">
          <section className="space-y-4">
            <h2 className="settings-section-title">Appearance</h2>
            <ThemePicker
              value={draft.theme}
              disabled={saving}
              onChange={(theme: AppTheme) => {
                update("theme", theme);
                applyTheme(theme);
              }}
            />
            <div className="flex items-center justify-between border-t border-border pt-4">
              <div>
                <Label>Minimize to tray on close</Label>
                <p className="text-xs text-muted-foreground">
                  Closing the window hides it; use the tray icon to reopen
                </p>
              </div>
              <Switch
                checked={draft.minimize_to_tray}
                disabled={saving}
                onCheckedChange={(v) => {
                  if (v === settings.minimize_to_tray) return;
                  void saveToggle({ minimize_to_tray: v });
                }}
              />
            </div>
          </section>

          <section className="space-y-4 border-t border-border pt-6">
            <h2 className="settings-section-title">System</h2>
            <div className="flex items-center justify-between">
              <div>
                <Label>Start with Windows</Label>
                <p className="text-xs text-muted-foreground">
                  Launch KuroAria DL when you sign in
                </p>
              </div>
              <Switch
                checked={draft.launch_at_login}
                disabled={saving}
                onCheckedChange={(v) => {
                  if (v === settings.launch_at_login) return;
                  void saveToggle({ launch_at_login: v });
                }}
              />
            </div>
          </section>

          <section className="space-y-4 border-t border-border pt-6">
            <h2 className="settings-section-title">Downloads</h2>
            <div className="space-y-2">
              <Label>Download directory</Label>
              <div className="flex gap-2">
                <Input
                  value={draft.download_dir}
                  onChange={(e) => update("download_dir", e.target.value)}
                />
                <Button type="button" variant="outline" onClick={onPickDir}>
                  Browse
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-concurrent">Max concurrent downloads</Label>
              <Input
                id="max-concurrent"
                type="number"
                min={1}
                max={32}
                value={draft.max_concurrent}
                onChange={(e) =>
                  update("max_concurrent", parseInt(e.target.value, 10) || 1)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retry">Retry attempts</Label>
              <Input
                id="retry"
                type="number"
                min={0}
                max={20}
                value={draft.retry_attempts}
                onChange={(e) =>
                  update("retry_attempts", parseInt(e.target.value, 10) || 0)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="split">Segments per download</Label>
              <p className="text-xs text-muted-foreground">
                Higher is faster (like the browser). Use 16 for large files.
              </p>
              <Input
                id="split"
                type="number"
                min={1}
                max={16}
                value={draft.split}
                onChange={(e) =>
                  update("split", parseInt(e.target.value, 10) || 16)
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-start downloads</Label>
                <p className="text-xs text-muted-foreground">
                  Start new downloads immediately when added
                </p>
              </div>
              <Switch
                checked={draft.auto_start}
                disabled={saving}
                onCheckedChange={(v) => {
                  if (v === settings.auto_start) return;
                  void saveToggle({ auto_start: v });
                }}
              />
            </div>
          </section>

          <section className="space-y-4 border-t border-border pt-6">
            <h2 className="settings-section-title">Bandwidth</h2>
            <div className="space-y-2">
              <Label htmlFor="dl-speed">
                Max download speed (KB/s, 0 = unlimited)
              </Label>
              <Input
                id="dl-speed"
                type="number"
                min={0}
                value={draft.max_download_speed}
                onChange={(e) =>
                  update(
                    "max_download_speed",
                    parseInt(e.target.value, 10) || 0,
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ul-speed">
                Max upload speed (KB/s, 0 = unlimited)
              </Label>
              <Input
                id="ul-speed"
                type="number"
                min={0}
                value={draft.max_upload_speed}
                onChange={(e) =>
                  update("max_upload_speed", parseInt(e.target.value, 10) || 0)
                }
              />
            </div>
          </section>

          <section className="space-y-4 border-t border-border pt-6">
            <h2 className="settings-section-title">aria2 RPC</h2>
            <div className="space-y-2">
              <Label htmlFor="rpc-url">RPC URL</Label>
              <Input
                id="rpc-url"
                value={draft.aria2_rpc_url}
                onChange={(e) => update("aria2_rpc_url", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rpc-secret">RPC secret (optional)</Label>
              <Input
                id="rpc-secret"
                type="password"
                value={draft.aria2_rpc_secret}
                onChange={(e) => update("aria2_rpc_secret", e.target.value)}
              />
            </div>
          </section>

          <section className="space-y-4 border-t border-border pt-6">
            <h2 className="settings-section-title">Browser integration</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Enable the bridge, then install the extension: Firefox →{" "}
              <code className="settings-inline-code">extension/firefox</code>
              , Chrome →{" "}
              <code className="settings-inline-code">extension/chrome</code>.
              See{" "}
              <code className="settings-inline-code">extension/README.md</code>.
            </p>
            <div className="flex items-center justify-between">
              <Label>Enable bridge server</Label>
              <Switch
                checked={draft.bridge_enabled}
                disabled={saving}
                onCheckedChange={(v) => {
                  if (v === settings.bridge_enabled) return;
                  void saveToggle({ bridge_enabled: v });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bridge-port">Bridge port</Label>
              <Input
                id="bridge-port"
                type="number"
                min={1024}
                max={65535}
                value={draft.bridge_port}
                onChange={(e) =>
                  update("bridge_port", parseInt(e.target.value, 10) || 17888)
                }
                disabled={!draft.bridge_enabled}
              />
            </div>
          </section>

          <Button
            variant="dark"
            className="w-full"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>
    </main>
  );
}
