import * as Ariakit from "@ariakit/react";
import type { ReactElement, ReactNode } from "react";

export type TooltipProps = {
  content: ReactNode;
  /** The anchor element — rendered through Ariakit's `render` prop. Must be focusable. */
  children: ReactElement;
  placement?: Ariakit.TooltipProviderProps["placement"];
  /** "label" = gear style; "value" = chart point (eyebrow + figure). */
  tone?: "label" | "value";
};

export function Tooltip({ content, children, placement = "bottom", tone = "label" }: TooltipProps) {
  return (
    <Ariakit.TooltipProvider placement={placement} showTimeout={400} hideTimeout={0}>
      <Ariakit.TooltipAnchor render={children} />
      <Ariakit.Tooltip
        gutter={8}
        unmountOnHide
        className={
          "z-50 rounded-lg bg-fg text-fg-inverse shadow-popover " +
          (tone === "label" ? "px-2.5 py-1.5 text-xs font-medium " : "px-3 py-2 ") +
          "opacity-0 translate-y-1 transition-[opacity,translate] duration-(--duration-fast) ease-out " +
          "data-enter:opacity-100 data-enter:translate-y-0 motion-reduce:translate-y-0"
        }
      >
        {content}
      </Ariakit.Tooltip>
    </Ariakit.TooltipProvider>
  );
}
