import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/btn relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans font-medium tracking-tight transition-[background,color,box-shadow,transform,border-color] duration-200 ease-out select-none disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ion/60 focus-visible:ring-offset-2 focus-visible:ring-offset-void active:translate-y-px [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-ink text-void hover:bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_10px_30px_-10px_rgba(143,243,255,0.45)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_14px_40px_-10px_rgba(143,243,255,0.65)]",
        si: "bg-si text-white hover:bg-[#ff5247] shadow-[0_10px_30px_-10px_rgba(255,59,48,0.7)]",
        ion: "bg-ion/10 text-ion border border-ion/30 hover:bg-ion/20 hover:border-ion/60",
        outline: "border border-line-strong text-ink hover:border-haze/50 hover:bg-white/[0.03]",
        ghost: "text-haze hover:text-ink hover:bg-white/[0.04]",
      },
      size: {
        sm: "h-8 rounded-sm px-3 text-[13px]",
        md: "h-10 rounded-sm px-4 text-sm",
        lg: "h-12 rounded-md px-6 text-[15px]",
        icon: "size-9 rounded-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && (
              <span className="size-3.5 animate-spin rounded-full border-[1.5px] border-current border-r-transparent" />
            )}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
