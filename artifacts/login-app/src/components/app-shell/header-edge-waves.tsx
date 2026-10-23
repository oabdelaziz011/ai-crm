/**
 * Sidebar ribbon inside the brand card.
 * Color stays on the outer edge and dissolves before the company name.
 */
export function HeaderEdgeWaves() {
  const mask = "[mask-image:linear-gradient(to_right,#000_0%,#000_96%,transparent_100%)]";
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <HeaderWave maskClass={mask} className="start-0 w-[7.9rem] rtl:-scale-x-100" />
    </div>
  );
}

function HeaderWave({ className, maskClass }: { className: string; maskClass: string }) {
  return (
    <svg
      className={`absolute inset-y-0 h-full ${maskClass} ${className}`}
      viewBox="0 0 320 64"
      preserveAspectRatio="none"
      fill="none"
    >
      <path d="M0 0c78 6 128 24 136 48 2 8-16 12-46 14C46 66 16 62 0 64V0Z" fill="#99f6e4" />
      <path
        d="M0 0c86 2 142 16 158 34 6 8-12 12-32 8C78 32 36 18 0 22V0Z"
        fill="#67e8f9"
        opacity="0.85"
      />
      <path
        d="M0 64c98-2 154-20 168-38 4-6-8-12-26-8C88 30 40 46 0 42v22Z"
        fill="#0d9488"
      />
      <path d="M0 0c34 14 46 30 32 48C20 62 0 64 0 64V0Z" fill="#0f766e" />
      <path
        d="M0 18c46 2 92 12 128 16 24 2 46 8 64 14-28 0-62-10-104-12C48 34 18 32 0 38V18Z"
        fill="#14b8a6"
        opacity="0.9"
      />
      <path
        d="M0 40c36-8 78-4 112 6 18 6 34 6 52 2-34 6-72 2-108-2C28 42 12 46 0 52v-12Z"
        fill="#059669"
        opacity="0.4"
      />
      <path d="M0 2c26 10 40 8 48 22-18-2-34-10-48-18V2Z" fill="#f0fdfa" opacity="0.8" />
    </svg>
  );
}
