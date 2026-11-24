import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-fast ease-out disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        secondary: "border border-input bg-surface text-foreground shadow-xs hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
        link: "h-auto rounded-sm p-0 text-primary underline-offset-4 hover:underline active:scale-100"
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-3.5",
        lg: "h-11 px-5 text-base",
        icon: "size-9",
        "icon-sm": "size-8"
      }
    },
    defaultVariants: { variant: "secondary", size: "md" }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
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
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {children}
          </>
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";
