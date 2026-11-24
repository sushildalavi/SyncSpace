import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-surface px-3 text-base text-foreground shadow-xs transition-[border-color,box-shadow] duration-fast placeholder:text-muted-foreground/80 hover:border-foreground/30 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => <input ref={ref} type={type} className={cn(inputClass, className)} {...props} />
);
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(inputClass, "appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%238a817a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  )
);
Select.displayName = "Select";
