import { AvatarImage } from "./TokenIcon";

export type ChainIconProps = { name: string; iconUrl?: string; size?: number };

/** 36px on desktop ChainBar, 28px on mobile. Falls back to the chain's initial. */
export function ChainIcon({ name, iconUrl, size = 36 }: ChainIconProps) {
  return <AvatarImage src={iconUrl} label={name} size={size} className="max-md:size-7" />;
}
