/**
 * Inline SVG icons. All 24x24, stroke-based, inheriting currentColor so the
 * button state (on / live / danger) colours them without extra classes.
 */

/* Soft-UI icon set: medium stroke, round caps — matches the rounded shell. */
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

/** Signal-wave mark used next to the wordmark. */
export function LogoMark() {
  return (
    <svg {...base} width="26" height="26">
      <circle cx="5.5" cy="18.5" r="1.6" fill="currentColor" stroke="none" />
      <path d="M3 12.5a9 9 0 0 1 8.5 8.5" />
      <path d="M3 6.5A15 15 0 0 1 17.5 21" />
      <path d="M3 .8A20.6 20.6 0 0 1 23.2 21" />
    </svg>
  );
}

export function MicIcon() {
  return (
    <svg {...base}>
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  );
}

export function MicOffIcon() {
  return (
    <svg {...base}>
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" />
    </svg>
  );
}

export function SpeakerIcon() {
  return (
    <svg {...base}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

export function SpeakerOffIcon() {
  return (
    <svg {...base}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <line x1="16" y1="9" x2="21" y2="15" />
      <line x1="21" y1="9" x2="16" y2="15" />
    </svg>
  );
}

export function ScreenIcon() {
  return (
    <svg {...base}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

export function ScreenOffIcon() {
  return (
    <svg {...base}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="3" y1="3" x2="21" y2="19" />
    </svg>
  );
}

export function CamIcon() {
  return (
    <svg {...base}>
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="m15 11 7-4v10l-7-4z" />
    </svg>
  );
}

export function CamOffIcon() {
  return (
    <svg {...base}>
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="m15 11 7-4v10l-7-4z" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}

export function ChatIcon() {
  return (
    <svg {...base}>
      <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-7a8 8 0 0 1 8-8h2a8 8 0 0 1 8 4z" />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function LeaveIcon() {
  return (
    <svg {...base}>
      <path d="M16 17l5-5-5-5" />
      <line x1="21" y1="12" x2="9" y2="12" />
      <path d="M12 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h7" />
    </svg>
  );
}

export function SlidersIcon() {
  return (
    <svg {...base}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="9" cy="6" r="2.2" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2.2" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="10" cy="18" r="2.2" />
    </svg>
  );
}

export function LiveDot() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="5" r="4" fill="currentColor" />
    </svg>
  );
}

export function ExpandIcon() {
  return (
    <svg {...base}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...base}>
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  );
}
