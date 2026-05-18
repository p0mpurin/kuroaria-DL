import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const sizes = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
};

export function Logo({ size = "md", showText = false, className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src="/logo.png"
        alt="KuroAria DL"
        className={cn(
          sizes[size],
          "shrink-0 rounded-lg object-cover ring-1 ring-sidebar-border",
        )}
      />
      {showText ? (
        <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
          KuroAria DL
        </span>
      ) : null}
    </div>
  );
}
