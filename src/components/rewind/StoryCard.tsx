import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { duration, ease, enterItem, enterItemReduced, springCard, stagger } from "./motion";

export type StoryCardProps = {
  index: number; // 1-based
  total?: number;
  eyebrow: string;
  /** CSS color for the eyebrow dot, e.g. "var(--color-accent-origin)". */
  accent: string;
  kicker?: string;
  headline?: ReactNode;
  /** "xl" = display-xl (cards 1–3), "lg" = display (card 4). */
  headlineSize?: "xl" | "lg";
  /** Left of kicker + headline (token icon on card 3). */
  media?: ReactNode;
  /** One line under the headline (card 2 summary). */
  lead?: ReactNode;
  children?: ReactNode;
  /** "split" = 5/6 column grid (Home chain); "center" = Share card. */
  layout?: "stack" | "split" | "center";
};

/** Layout shell. Children enter in order: eyebrow → kicker/headline → lead → body, one stagger step apart. */
export function StoryCard({
  index,
  total = 5,
  eyebrow,
  accent,
  kicker,
  headline,
  headlineSize = "xl",
  media,
  lead,
  children,
  layout = "stack",
}: StoryCardProps) {
  const reduce = useReducedMotion();
  const item = reduce ? enterItemReduced : enterItem;
  const container: Variants = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : stagger.children } } };

  const title = (kicker || headline) && (
    <div className="flex flex-col gap-2">
      {kicker && <p className="text-title text-fg-muted max-md:text-xl">{kicker}</p>}
      {headline && (
        <h2
          className={
            headlineSize === "xl"
              ? "font-display text-display-xl max-md:text-[88px] max-md:leading-none"
              : "font-display text-display max-md:text-[56px]"
          }
        >
          {headline}
        </h2>
      )}
    </div>
  );

  const head = (
    <>
      <motion.div variants={item} className="flex items-center gap-2.5">
        <span className="size-2 rounded-full" style={{ background: accent }} />
        <span className="text-label font-medium uppercase text-fg-muted">
          {String(index).padStart(2, "0")} · {eyebrow}
        </span>
      </motion.div>
      {title && (
        <motion.div variants={item} className="flex items-center gap-8 max-md:gap-5">
          {media}
          {title}
        </motion.div>
      )}
      {lead && (
        <motion.p variants={item} className="text-body text-fg-muted">
          {lead}
        </motion.p>
      )}
    </>
  );

  return (
    <motion.section
      aria-roledescription="slide"
      aria-label={`${index} of ${total}: ${eyebrow}`}
      variants={container}
      initial="hidden"
      animate="show"
      className={
        "mx-auto flex h-dvh w-full max-w-[1440px] flex-col justify-center gap-5 px-30 pb-20 pt-30 max-md:px-5 " +
        (layout === "center" ? "items-center text-center" : "")
      }
    >
      {layout === "split" ? (
        <div className="grid grid-cols-[5fr_6fr] items-center gap-24 max-md:grid-cols-1 max-md:gap-10">
          <div className="flex flex-col gap-5">{head}</div>
          <motion.div variants={item}>{children}</motion.div>
        </div>
      ) : (
        <>
          {head}
          <motion.div variants={item} className={layout === "center" ? "flex w-full flex-col items-center" : ""}>
            {children}
          </motion.div>
        </>
      )}
    </motion.section>
  );
}

/** Direction-aware card transition. direction: 1 = next (enters from right), -1 = previous. */
export function StoryStage({
  id,
  direction,
  children,
}: {
  id: string | number;
  direction: 1 | -1;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const variants: Variants = reduce
    ? {
        // x is pinned at 0, not merely absent, so a card caught mid-slide when the preference
        // changes still lands square instead of holding whatever offset it had reached.
        enter: { opacity: 0 },
        center: { opacity: 1, x: 0, transition: { duration: duration.base } },
        exit: { opacity: 0, x: 0, transition: { duration: duration.base } },
      }
    : {
        enter: (dir: number) => ({ x: 64 * dir, opacity: 0 }),
        center: { x: 0, opacity: 1, transition: springCard },
        exit: (dir: number) => ({ x: -64 * dir, opacity: 0, transition: { duration: duration.fast, ease: ease.in } }),
      };
  return (
    <AnimatePresence mode="popLayout" custom={direction} initial={false}>
      <motion.div
        key={id}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        className="absolute inset-0"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
