import type { AppSettings, AppTheme } from "@/lib/types";

export const THEMES: { id: AppTheme; label: string; description: string }[] = [
  { id: "dark", label: "Dark", description: "Balanced dark gray" },
  { id: "midnight", label: "Midnight", description: "Deep blue-gray" },
  { id: "amoled", label: "AMOLED", description: "True black" },
  { id: "light", label: "Light", description: "Classic light" },
];

export function applyTheme(theme: AppTheme) {
  document.documentElement.setAttribute("data-theme", theme);
}

const VALID: AppTheme[] = ["light", "dark", "midnight", "amoled"];

export function themeFromSettings(settings: AppSettings): AppTheme {
  const t = settings.theme;
  if (t && VALID.includes(t)) return t;
  return "dark";
}
