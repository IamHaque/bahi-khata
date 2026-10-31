import * as React from "react";
import { Button, type buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  ariaLabel?: string;
  icon: React.ReactNode;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  tone?: "default" | "destructive";
  tooltipSide?: "top" | "bottom" | "left" | "right";
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      label,
      ariaLabel,
      icon,
      onClick,
      variant = "ghost",
      size = "icon",
      disabled = false,
      tone = "default",
      tooltipSide = "top",
      className,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const accessibleName = ariaLabel ?? label;

    const button = (
      <Button
        ref={ref}
        type={type}
        variant={tone === "destructive" ? "destructive" : variant}
        size={size}
        disabled={disabled}
        aria-label={accessibleName}
        className={cn(
          "touch-target",
          tone === "destructive" &&
            "text-destructive hover:bg-destructive/10 hover:text-destructive",
          className,
        )}
        onClick={onClick}
        {...props}
      >
        {icon}
      </Button>
    );

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            disabled ? (
              <span
                tabIndex={0}
                className="inline-flex touch-target"
                aria-disabled="true"
                aria-label={accessibleName}
              >
                {button}
              </span>
            ) : (
              button
            )
          }
        />
        <TooltipContent side={tooltipSide}>{label}</TooltipContent>
      </Tooltip>
    );
  },
);

IconButton.displayName = "IconButton";
