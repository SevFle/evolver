import { cn } from "@/lib/utils";
import { forwardRef } from "react";

const Badge = forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & {
    variant?: "default" | "success" | "warning" | "destructive" | "secondary" | "outline";
  }
>(({ className, variant = "default", ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
      {
        "bg-primary text-primary-foreground": variant === "default",
        "bg-green-100 text-green-800": variant === "success",
        "bg-yellow-100 text-yellow-800": variant === "warning",
        "bg-red-100 text-red-800": variant === "destructive",
        "bg-secondary text-secondary-foreground": variant === "secondary",
        "border text-foreground": variant === "outline",
      },
      className,
    )}
    {...props}
  />
));
Badge.displayName = "Badge";

export { Badge };
