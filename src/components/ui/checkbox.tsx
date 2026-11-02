import * as React from "react";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.ComponentPropsWithoutRef<typeof BaseCheckbox.Root>, "className"> {
  className?: string;
  indeterminate?: boolean;
}

export const Checkbox = React.forwardRef<HTMLElement, CheckboxProps>(
  ({ className, indeterminate, checked, ...props }, ref) => {
    return (
      <BaseCheckbox.Root
        ref={ref}
        checked={checked}
        indeterminate={indeterminate}
        className={cn(
          "peer relative inline-flex size-4 shrink-0 touch-target items-center justify-center rounded-[4px] border border-input transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "data-[checked]:bg-primary data-[checked]:border-primary data-[checked]:text-primary-foreground",
          "data-[indeterminate]:bg-primary data-[indeterminate]:border-primary data-[indeterminate]:text-primary-foreground",
          className,
        )}
        {...props}
      >
        <BaseCheckbox.Indicator className="flex items-center justify-center text-current">
          {indeterminate ? (
            <Minus className="size-3 stroke-[3]" />
          ) : (
            <Check className="size-3 stroke-[3]" />
          )}
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
    );
  },
);
Checkbox.displayName = "Checkbox";
