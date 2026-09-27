import { motion, useReducedMotion } from "motion/react";
import { duration, ease, enterItem, enterItemReduced, stagger } from "./motion";

export type ShareStat = { value: string; label: string };

export type ShareCardProps = {
  /** ENS name, or short address if none. */
  name: string;
  address: string; // already shortened, e.g. 0xd8dA…6045
  stats: [ShareStat, ShareStat, ShareStat, ShareStat];
};

/** Summary card on the last story card. Rises 16px + fades; stats stagger 80ms. */
export function ShareCard({ name, address, stats }: ShareCardProps) {
  const reduce = useReducedMotion();
  const item = reduce ? enterItemReduced : enterItem;
  return (
    <motion.article
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow, ease: ease.out }}
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
        variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : stagger.children, delayChildren: reduce ? 0 : 0.16 } } }}
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
