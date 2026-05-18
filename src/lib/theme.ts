import type { AppSettings, AppTheme } from "@/lib/types";

export const THEMES: { id: AppTheme; label: string; description: string }[] = [
  { id: "dark", label: "Kuro", description: "Brand dark with blue accents" },
  { id: "midnight", label: "Midnight", description: "Deep navy from the logo" },
  { id: "amoled", label: "AMOLED", description: "Pure black, soft blue glow" },
  { id: "light", label: "Cream", description: "Light cream + logo blue" },
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
