import * as Ariakit from "@ariakit/react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode, Ref } from "react";
import { duration, ease, pressScale } from "../rewind/motion";

export type ButtonVariant = "primary" | "ghost" | "icon";

export type ButtonProps = Omit<Ariakit.ButtonProps, "children"> & {
  variant?: ButtonVariant;
  loading?: boolean;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

const base =
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] font-medium outline-none " +
  "transition-colors duration-(--duration-fast) ease-out " +
  "focus-ring:outline-2 focus-ring:outline-offset-2 focus-ring:outline-primary disabled-any:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  primary:
    "h-11 px-5 bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-pressed " +
    "disabled-any:bg-surface-raised disabled-any:text-fg-subtle",
  ghost:
    "h-11 px-5 border border-border-strong text-fg hover:bg-surface-raised active:bg-surface-pressed " +
    "disabled-any:border-border disabled-any:bg-transparent disabled-any:text-fg-subtle",
  icon:
    "size-11 text-fg-muted hover:bg-surface-raised hover:text-fg active:bg-surface-pressed " +
    "disabled-any:bg-transparent disabled-any:text-border-strong",
};

export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  children,
  ref,
  ...props
}: ButtonProps) {
  const reduce = useReducedMotion();
  const inert = disabled || loading;
  return (
    <Ariakit.Button
      ref={ref}
      disabled={inert}
      accessibleWhenDisabled={loading}
      aria-busy={loading || undefined}
      className={`${base} ${variants[variant]} ${className}`}
      render={
        <motion.button
          whileTap={inert || reduce ? undefined : { scale: pressScale }}
          transition={{ duration: duration.instant, ease: ease.out }}
        />
      }
      {...props}
    >
      {loading && <Spinner />}
      {variant === "icon" && loading ? null : children}
    </Ariakit.Button>
  );
}

export function Spinner({ className = "size-3.5" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin ${className}`}
    />
  );
}
