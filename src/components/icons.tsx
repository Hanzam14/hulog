const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const Logo = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <rect width="48" height="48" rx="14" fill="#0f6b4f" />
    <path
      d="M17 14v20m14-20v20M17 24h14"
      {...line}
      stroke="#fbf6ec"
      strokeWidth={4.5}
    />
    <circle cx="24" cy="12" r="3.5" fill="#f2b53a" />
  </svg>
);

export const HomeIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...line}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  </svg>
);

export const HistoryIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...line}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4h4" />
    <path d="M12 8v4.5l3 2" />
  </svg>
);

export const ChangesIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...line}>
    <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
    <path d="M10 20a2.2 2.2 0 0 0 4 0" />
  </svg>
);

export const GroupIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...line}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
    <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c1.9.7 3.1 2.5 3.5 5.2" />
  </svg>
);

export const GoogleMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8"
    />
    <path
      fill="#34A853"
      d="M12 23c3 0 5.5-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0 0 12 23"
    />
    <path
      fill="#FBBC05"
      d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8z"
    />
    <path
      fill="#EA4335"
      d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4"
    />
  </svg>
);

/** Coin jar illustration for the welcome screen. */
export const JarArt = () => (
  <svg className="welcome-art" viewBox="0 -20 300 220" aria-hidden="true">
    <ellipse cx="150" cy="186" rx="110" ry="10" fill="#ece4d3" />
    <circle cx="56" cy="60" r="22" fill="#fdf0d2" />
    <circle cx="252" cy="44" r="14" fill="#e3f1e9" />
    <circle cx="238" cy="120" r="8" fill="#fdf0d2" />
    <rect
      x="92"
      y="46"
      width="116"
      height="138"
      rx="34"
      fill="#e3f1e9"
      stroke="#0f6b4f"
      strokeWidth="4"
    />
    <rect x="104" y="30" width="92" height="22" rx="9" fill="#0f6b4f" />
    <g stroke="#c98a10" strokeWidth="3">
      <ellipse cx="128" cy="160" rx="22" ry="8" fill="#f2b53a" />
      <ellipse cx="172" cy="160" rx="22" ry="8" fill="#f2b53a" />
      <ellipse cx="150" cy="148" rx="22" ry="8" fill="#f2b53a" />
      <ellipse cx="128" cy="136" rx="22" ry="8" fill="#f2b53a" />
      <ellipse cx="172" cy="132" rx="22" ry="8" fill="#f2b53a" />
      <ellipse cx="150" cy="120" rx="22" ry="8" fill="#f2b53a" />
    </g>
    <g transform="rotate(-18 150 6)">
      <circle
        cx="150"
        cy="6"
        r="15"
        fill="#f2b53a"
        stroke="#c98a10"
        strokeWidth="3"
      />
      <text
        x="150"
        y="11"
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fill="#8a5a00"
      >
        ₱
      </text>
    </g>
    <path
      d="M118 70v34"
      stroke="#ffffff"
      strokeWidth="6"
      strokeLinecap="round"
      opacity=".8"
    />
  </svg>
);
