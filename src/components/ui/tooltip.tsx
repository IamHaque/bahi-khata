import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";

function TooltipProvider({
  delay = 400,
  closeDelay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      delay={delay}
      closeDelay={closeDelay}
      {...props}
    />
  );
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipPositioner({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  ...props
}: TooltipPrimitive.Positioner.Props) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        data-slot="tooltip-positioner"
        side={side}
        sideOffset={sideOffset}
        align={align}
        className={cn("isolate z-50", className)}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

function TooltipPopup({
  className,
  ...props
}: TooltipPrimitive.Popup.Props) {
  return (
    <TooltipPrimitive.Popup
      data-slot="tooltip-popup"
      className={cn(
        "z-50 rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground outline-none",
        className,
      )}
      {...props}
    />
  );
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "side" | "sideOffset" | "align">) {
  return (
    <TooltipPositioner side={side} sideOffset={sideOffset} align={align}>
      <TooltipPopup className={className} {...props}>
        {children}
      </TooltipPopup>
    </TooltipPositioner>
  );
}

export {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipPositioner,
  TooltipPopup,
  TooltipContent,
  TooltipPrimitive,
};
