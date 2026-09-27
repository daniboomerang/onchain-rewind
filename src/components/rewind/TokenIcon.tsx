import { type CSSProperties, useState } from "react";

export type AvatarImageProps = {
  src?: string;
  /** Used for the fallback initial and alt text. */
  label: string;
  /** px. */
  size?: number;
  className?: string;
};

/**
 * Icon URLs reach this component from an external API, so only three kinds are ever loaded: an
 * https URL, an inline image, or a same-origin path. Anything else — cleartext http, a
 * protocol-relative host, an exotic scheme — falls back to the initial rather than sending the
 * viewer's browser somewhere the API chose. Requests carry no referrer.
 */
function loadable(src: string) {
  if (/^(?:https:|data:image\/)/i.test(src)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith("//");
}

/**
 * Image with an initial-in-a-circle fallback. The fallback renders first and stays under the image,
 * so a slow or broken icon never blocks or shifts layout.
 */
export function AvatarImage({ src, label, size = 36, className = "" }: AvatarImageProps) {
  const [failed, setFailed] = useState(false);
  const initial = label.trim().charAt(0).toUpperCase() || "?";
  const url = src && loadable(src) ? src : undefined;
  return (
    <span
      className={`relative inline-grid size-(--avatar-size) shrink-0 place-items-center overflow-hidden rounded-full bg-surface-raised font-semibold text-fg ${className}`}
      style={{ "--avatar-size": `${size}px`, fontSize: Math.max(10, Math.round(size * 0.33)) } as CSSProperties}
    >
      <span aria-hidden>{initial}</span>
      {url && !failed && (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export type TokenIconProps = { symbol: string; iconUrl?: string; size?: number };

/** Card 3 uses size 120 (desktop) / 72 (mobile). Fallback shows the symbol's first letter. */
export function TokenIcon({ symbol, iconUrl, size = 120 }: TokenIconProps) {
  return <AvatarImage src={iconUrl} label={symbol} size={size} />;
}
