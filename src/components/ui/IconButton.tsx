import type { ReactNode } from "react";
import { Button, type ButtonProps } from "./Button";
import { Tooltip } from "./Tooltip";

export type IconButtonProps = Omit<ButtonProps, "variant" | "children"> & {
  /** Accessible name + tooltip text. */
  label: string;
  icon?: ReactNode;
};

/** 44×44 icon-only button with tooltip. Default icon = gear (Settings). */
export function IconButton({ label, icon = <GearIcon />, ...props }: IconButtonProps) {
  return (
    <Tooltip content={label}>
      <Button variant="icon" aria-label={label} {...props}>
        {icon}
      </Button>
    </Tooltip>
  );
}

export function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="8.5" strokeWidth="3" strokeDasharray="2.67 2.67" />
      <circle cx="12" cy="12" r="6.2" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.2" strokeWidth="1.8" />
    </svg>
  );
}
