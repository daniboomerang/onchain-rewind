import { motion, useReducedMotion } from "motion/react";
import { enterCard, enterCardReduced, enterItem, enterItemReduced, stagger } from "./motion";

export type ShareStat = { value: string; label: string };

/**
 * Reading the panel's values every frame is what keeps them on Motion's own frame loop, and that is the
 * point of this empty handler — `onUpdate` is the one prop that tells Motion the values are being
 * observed, so it cannot hand any of them to the browser's animation engine instead. It is the same
 * handler `StoryStage` keeps, for the same reason, one element further out; see the comment there for
 * the full mechanism, and `design/KNOWN-ISSUES.md` §9.
 *
 * Without it the panel's fade is accelerated, and an accelerated animation stopped before its first
 * frame is recorded as already finished: Motion writes the end value into the value it owns while the
 * element renders the `0` the remount's reset had just written, and the restarted entrance, finding
 * opacity already at its target, animates nothing. The rise is never accelerated and always landed,
 * which is why the panel sat square and transparent with all of its content in the page. The story
 * mounts this panel into a tree React's development build double-invokes, so the interruption is not
 * exotic: it happens on every play.
 *
 * The cost is one 600px-wide element's opacity moving off the compositor, on an element already written
 * every frame for its rise.
 */
const readPanelValues = () => {};

export type ShareCardProps = {
  /** ENS name, or short address if none. */
  name: string;
  address: string; // already shortened, e.g. 0xd8dA…6045
  stats: [ShareStat, ShareStat, ShareStat, ShareStat];
};

/** Summary card on the last story card. Rises 16px + fades; stats stagger one step apart. */
export function ShareCard({ name, address, stats }: ShareCardProps) {
  const reduce = useReducedMotion();
  const item = reduce ? enterItemReduced : enterItem;
  // The card's own entrance is a named variant rather than a target written here: the hidden state
  // has to be preference-independent, because the server renders it before it can know, and the two
  // twins only stay in step while one place owns both. `hidden` is where the server leaves this
  // element, so `show` is the only thing that makes the card readable.
  const card = reduce ? enterCardReduced : enterCard;
  // No theme of its own: this card is the on-screen twin of the share image, which is painted in the
  // theme the visitor chose, so following the page is what keeps the two looking like the same card.
  return (
    <motion.article
      variants={card}
      initial="hidden"
      animate="show"
      onUpdate={readPanelValues}
      className="flex w-full max-w-[600px] flex-col gap-7 rounded-3xl bg-surface p-9 text-left shadow-card max-md:p-6"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 truncate font-display text-5xl leading-tight max-md:text-4xl">{name}</h2>
        <span className="shrink-0 whitespace-nowrap font-mono text-[13px] text-fg-muted">{address}</span>
      </header>
      <motion.dl
        className="grid grid-cols-2 gap-x-5 gap-y-6"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: {
            transition: {
              staggerChildren: reduce ? 0 : stagger.children,
              delayChildren: reduce ? 0 : stagger.children * 2,
            },
          },
        }}
      >
        {stats.map((s) => (
          <motion.div key={s.label} variants={item} className="flex flex-col-reverse gap-0.5">
            <dt className="text-small text-fg-muted">{s.label}</dt>
            <dd className="text-4xl font-medium tracking-[-0.02em] tabular-nums max-md:text-3xl">{s.value}</dd>
          </motion.div>
        ))}
      </motion.dl>
      <footer className="flex items-center justify-between border-t border-border pt-4">
        <span className="whitespace-nowrap font-display text-xl italic">Onchain Rewind</span>
        <span className="size-2 rounded-full bg-accent-share" />
      </footer>
    </motion.article>
  );
}
