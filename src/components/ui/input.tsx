import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-sm border border-line-strong bg-void/60 px-3 font-mono text-sm text-ink placeholder:text-mist/60 transition-colors focus:border-ion/50 focus:outline-none focus:ring-2 focus:ring-ion/15",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
