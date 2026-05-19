import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

/** Visible box — image is zoomed inside so the mark stays sharp at small sizes */
const boxSizes = {
  sm: "h-10 w-10",
  md: "h-12 w-12",
  lg: "h-[4.5rem] w-[4.5rem]",
};

/** Crop zoom — center of logo-square, does not need to show the full artwork */
const imageZoom = {
  sm: "h-[165%] w-[165%]",
  md: "h-[170%] w-[170%]",
  lg: "h-[175%] w-[175%]",
};

export function Logo({ size = "md", showText = false, className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-xl bg-sidebar-active/40 ring-1 ring-sidebar-border",
          boxSizes[size],
        )}
        aria-hidden
      >
        <img
          src="/logo-square.png"
          alt="KuroAria DL"
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 object-cover",
            imageZoom[size],
          )}
          draggable={false}
        />
      </div>
      {showText ? (
        <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
          KuroAria DL
        </span>
      ) : null}
    </div>
  );
}
