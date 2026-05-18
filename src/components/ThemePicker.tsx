import { cn } from "@/lib/utils";
import { THEMES } from "@/lib/theme";
import type { AppTheme } from "@/lib/types";

interface ThemePickerProps {
  value: AppTheme;
  onChange: (theme: AppTheme) => void;
  disabled?: boolean;
}

export function ThemePicker({ value, onChange, disabled }: ThemePickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {THEMES.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(t.id)}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-left transition-colors",
              active
                ? "border-accent bg-accent/10 ring-1 ring-accent"
                : "border-border bg-card hover:border-muted-foreground/30",
            )}
          >
            <span className="block text-sm font-medium text-foreground">
              {t.label}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
