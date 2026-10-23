import { useId, type ReactNode } from "react";

export function brandColor(name: string): string {
  if (name === "facebook") return "#0866FF";
  if (name === "instagram") return "#E1306C";
  if (name === "whatsapp") return "#25D366";
  if (name === "telegram") return "#2AABEE";
  if (name === "tiktok") return "#111111";
  if (name === "youtube") return "#FF0033";
  if (name === "x") return "#111111";
  if (name === "snapchat") return "#FFFC00";
  if (name === "linkedin") return "#0A66C2";
  if (name === "email") return "#111827";
  if (name === "phone") return "#16A34A";
  return "#0F766E";
}

export function BrandIcon({
  name,
  className = "size-11",
  radius = 12,
}: {
  name: string;
  className?: string;
  radius?: number;
}) {
  const gradientId = useId();
  if (name === "facebook") {
    return (
      <Tile className={className} radius={radius} fill="#0866FF">
        <path fill="#fff" d="M27.2 15.6h3.4V11h-3.6c-3.8 0-5.8 2.2-5.8 5.8v2.6h-3.4v4.4h3.4V37h4.6V23.8h3.6l.7-4.4h-4.3v-1.8c0-1.3.6-2 2-2z" />
      </Tile>
    );
  }
  if (name === "instagram") {
    return (
      <svg viewBox="0 0 48 48" className={className} aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="6" y1="42" x2="42" y2="6" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FEDA75" />
            <stop offset="0.25" stopColor="#FA7E1E" />
            <stop offset="0.5" stopColor="#D62976" />
            <stop offset="0.75" stopColor="#962FBF" />
            <stop offset="1" stopColor="#4F5BD5" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx={radius} fill={`url(#${gradientId})`} />
        <rect x="14" y="14" width="20" height="20" rx="6" fill="none" stroke="#fff" strokeWidth="2.4" />
        <circle cx="24" cy="24" r="4.6" fill="none" stroke="#fff" strokeWidth="2.4" />
        <circle cx="30.4" cy="17.6" r="1.5" fill="#fff" />
      </svg>
    );
  }
  if (name === "whatsapp") {
    return (
      <Tile className={className} radius={radius} fill="#25D366">
        <path fill="#fff" d="M24 12.5a9.4 9.4 0 0 0-8.1 14.1L14.6 33l6.6-1.7A9.4 9.4 0 1 0 24 12.5zm0 17.1c-1.4 0-2.7-.4-3.9-1l-.3-.2-3.9 1 1-3.8-.2-.3a7.6 7.6 0 1 1 7.3 4.3zm4.2-5.7c-.2-.1-1.3-.6-1.5-.7-.2-.1-.4-.1-.5.1l-.6.8c-.1.2-.3.2-.5.1a6.2 6.2 0 0 1-3-2.6c-.2-.3.2-.3.6-1.1.1-.1 0-.3 0-.4l-.7-1.6c-.2-.4-.3-.4-.5-.4h-.4c-.2 0-.4.1-.6.3-.2.2-.7.7-.7 1.7s.8 2 .9 2.1c.1.1 1.5 2.3 3.6 3.1.5.2.9.3 1.2.4.5.1 1 .1 1.3.1.4 0 1.2-.5 1.4-1 .2-.5.2-.9.1-1-.1-.1-.2-.1-.4-.2z" />
      </Tile>
    );
  }
  if (name === "youtube") {
    return (
      <Tile className={className} radius={radius} fill="#FF0033">
        <path fill="#fff" d="M20 17.2v13.6l12.2-6.8L20 17.2z" />
      </Tile>
    );
  }
  if (name === "linkedin") {
    return (
      <Tile className={className} radius={radius} fill="#0A66C2">
        <circle cx="16.2" cy="15.2" r="2.3" fill="#fff" />
        <rect x="14" y="19.2" width="4.4" height="13.2" rx="1" fill="#fff" />
        <path fill="#fff" d="M22.2 19.2h4.2v1.8c.6-1.1 1.9-2.2 4-2.2 3.2 0 4.6 1.8 4.6 5.2v8.4h-4.4v-7.4c0-1.8-.6-2.8-2-2.8-1.3 0-2 1-2 2.8v7.4h-4.4V19.2z" />
      </Tile>
    );
  }
  if (name === "telegram") {
    return (
      <Tile className={className} radius={radius} fill="#2AABEE">
        <path fill="#fff" d="M33.6 14.2 12.2 22.4c-1.2.5-1.1 1.1-.2 1.4l5.2 1.6 2 5.8c.2.6.1.8.7.8.4 0 .6-.2.9-.4l2.4-2.3 5 3.6c.8.4 1.4.2 1.6-.8l3.2-15.2c.3-1.2-.4-1.7-1.4-1.3zM18.6 24.4l9.8-6.2c.4-.3.8-.1.5.2l-8.4 7.6-.3 3.6-1.6-5.2z" />
      </Tile>
    );
  }
  if (name === "x") {
    return (
      <Tile className={className} radius={radius} fill="#111111">
        <path fill="#fff" d="M16.2 15h3.4l8.8 11.4L32.2 15H36l-6.6 8.4L36.4 33h-3.4l-9.2-12L19.2 33h-3.8l7-8.8L16.2 15zm1.6 1.4 10.4 15.2h2.2L20 16.4h-2.2z" />
      </Tile>
    );
  }
  if (name === "tiktok") {
    return (
      <Tile className={className} radius={radius} fill="#111111">
        <path fill="#25F4EE" d="M21.2 18.2c.8-2.4 2.6-4.2 5-5v3.2c-1.2.6-2.2 1.6-2.8 2.8v9.2a6.2 6.2 0 1 1-4.4-6v3.4a2.8 2.8 0 1 0 2 2.7V18.2z" />
        <path fill="#FE2C55" d="M23.4 16.8c.8-2.4 2.6-4.2 5-5v3.2c-1.2.6-2.2 1.6-2.8 2.8v9.2a6.2 6.2 0 1 1-4.4-6v3.4a2.8 2.8 0 1 0 2 2.7V16.8z" />
        <path fill="#fff" d="M22.3 17.5c.8-2.4 2.6-4.2 5-5v3.2c-1.2.6-2.2 1.6-2.8 2.8v9.2a6.2 6.2 0 1 1-4.4-6v3.4a2.8 2.8 0 1 0 2 2.7V17.5z" />
      </Tile>
    );
  }
  if (name === "snapchat") {
    return (
      <Tile className={className} radius={radius} fill="#FFFC00">
        <path fill="#111" d="M24 12.2c-4.2 0-6.8 3.2-6.8 7.4 0 1.3-.3 2.1-.9 2.8-.4.4-1.1.6-1.6.9-.6.4-.4 1.3.4 1.4.9.1 1.6.6 1.6 1.3 0 .6.7 1.1 1.5 1.4.5 1.7 1.8 2.8 5.8 2.8s5.3-1.1 5.8-2.8c.8-.3 1.5-.8 1.5-1.4 0-.7.7-1.2 1.6-1.3.8-.1 1-.9.4-1.4-.5-.3-1.2-.5-1.6-.9-.6-.7-.9-1.5-.9-2.8 0-4.2-2.6-7.4-6.8-7.4z" />
      </Tile>
    );
  }
  if (name === "email") {
    return (
      <Tile className={className} radius={radius} fill="#111827">
        <rect x="12" y="15" width="24" height="18" rx="2" fill="none" stroke="#fff" strokeWidth="2.2" />
        <path d="M13 16.5 24 25l11-8.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
      </Tile>
    );
  }
  if (name === "phone") {
    return (
      <Tile className={className} radius={radius} fill="#16A34A">
        <path fill="#fff" d="M18.2 14.2h2.4c.5 0 .9.3 1 .8l.8 2.8c.1.5 0 .9-.4 1.2l-1.6 1.2a11 11 0 0 0 4.6 4.6l1.2-1.6c.3-.4.7-.5 1.2-.4l2.8.8c.5.1.8.5.8 1v2.4c0 .6-.4 1-1 1-8.2 0-14.8-6.6-14.8-14.8 0-.6.4-1 1-1z" />
      </Tile>
    );
  }
  const letter = name.slice(0, 1).toUpperCase();
  return (
    <Tile className={className} radius={radius} fill={brandColor(name)}>
      <text x="24" y="30" textAnchor="middle" fontSize="18" fontWeight="700" fill="#fff">{letter}</text>
    </Tile>
  );
}

function Tile({
  className,
  radius,
  fill,
  children,
}: {
  className: string;
  radius: number;
  fill: string;
  children: ReactNode;
}) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx={radius} fill={fill} />
      {children}
    </svg>
  );
}
