// Line icons used across the admin. Stroke uses currentColor so callers control color via parent.

import type { ReactNode } from "react";

const Svg = ({ s, children, sw = 1.6 }: { s: number; children: ReactNode; sw?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const AdmIcons = {
  search: (s = 16) => <Svg s={s}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Svg>,
  plus: (s = 16) => <Svg s={s} sw={1.7}><path d="M12 5v14M5 12h14" /></Svg>,
  download: (s = 16) => <Svg s={s}><path d="M12 3v12m0 0l-4-4m4 4l4-4" /><path d="M5 21h14" /></Svg>,
  filter: (s = 16) => <Svg s={s}><path d="M3 5h18M6 12h12M10 19h4" /></Svg>,
  more: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  ),
  chevronDown: (s = 14) => <Svg s={s} sw={1.7}><path d="M6 9l6 6 6-6" /></Svg>,
  chevronRight: (s = 14) => <Svg s={s} sw={1.7}><path d="M9 6l6 6-6 6" /></Svg>,
  arrowUp: (s = 12) => <Svg s={s} sw={2}><path d="M12 19V5M5 12l7-7 7 7" /></Svg>,
  arrowDown: (s = 12) => <Svg s={s} sw={2}><path d="M12 5v14M5 12l7 7 7-7" /></Svg>,
  close: (s = 16) => <Svg s={s} sw={1.7}><path d="M6 6l12 12M18 6L6 18" /></Svg>,
  bottle: (s = 16) => <Svg s={s} sw={1.5}><path d="M10 2h4v3l1 2v13a2 2 0 01-2 2h-2a2 2 0 01-2-2V7l1-2V2z" /><path d="M10 11h4" /></Svg>,
  store: (s = 16) => <Svg s={s} sw={1.5}><path d="M3 9l1-5h16l1 5" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></Svg>,
  user: (s = 16) => <Svg s={s} sw={1.5}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></Svg>,
  shield: (s = 16) => <Svg s={s} sw={1.5}><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z" /></Svg>,
  grid: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="4" y="4" width="7" height="7" />
      <rect x="13" y="4" width="7" height="7" />
      <rect x="4" y="13" width="7" height="7" />
      <rect x="13" y="13" width="7" height="7" />
    </svg>
  ),
  cart: (s = 16) => <Svg s={s} sw={1.5}><path d="M3 4h2l2.5 12h11l2-8H6" /><circle cx="9" cy="20" r="1.3" /><circle cx="18" cy="20" r="1.3" /></Svg>,
  cog: (s = 16) => <Svg s={s} sw={1.5}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.4.8a7 7 0 00-2-1.2L14 3h-4l-.5 2.5a7 7 0 00-2 1.2l-2.4-.8-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-.8a7 7 0 002 1.2L10 21h4l.5-2.5a7 7 0 002-1.2l2.4.8 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" /></Svg>,
  ext: (s = 14) => <Svg s={s} sw={1.7}><path d="M14 4h6v6" /><path d="M20 4l-8 8" /><path d="M14 14v5H5V10h5" /></Svg>,
  trash: (s = 14) => <Svg s={s}><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></Svg>,
  edit: (s = 14) => <Svg s={s}><path d="M14 4l6 6" /><path d="M4 20l4-1L20 7l-4-4L4 15l-1 5z" /></Svg>,
  mail: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  ),
  phone: (s = 14) => <Svg s={s} sw={1.5}><path d="M5 4h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4a2 2 0 01-2 2A18 18 0 013 6a2 2 0 012-2z" /></Svg>,
  pin: (s = 14) => <Svg s={s} sw={1.5}><path d="M12 22s7-7 7-12a7 7 0 10-14 0c0 5 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></Svg>,
  bell: (s = 16) => <Svg s={s} sw={1.5}><path d="M6 18V11a6 6 0 1112 0v7" /><path d="M4 18h16" /><path d="M10 21h4" /></Svg>,
  check: (s = 14) => <Svg s={s} sw={2.2}><path d="M5 12l5 5L20 7" /></Svg>,
  package: (s = 16) => <Svg s={s} sw={1.5}><path d="M12 3l9 5v8l-9 5-9-5V8l9-5z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v9" /></Svg>,
  truck: (s = 16) => <Svg s={s} sw={1.5}><path d="M3 6h11v9H3z" /><path d="M14 9h4l3 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></Svg>,
  calendar: (s = 14) => <Svg s={s} sw={1.5}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></Svg>,
  refresh: (s = 14) => <Svg s={s} sw={1.6}><path d="M21 12a9 9 0 11-3.5-7.1" /><path d="M21 4v5h-5" /></Svg>,
  tag: (s = 16) => <Svg s={s} sw={1.5}><path d="M3 12l9-9h8v8l-9 9z" /><circle cx="15.5" cy="7.5" r="1.2" /></Svg>,
  star: (s = 14) => <Svg s={s} sw={1.5}><path d="M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" /></Svg>,
  eye: (s = 16) => <Svg s={s} sw={1.6}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></Svg>,
  eyeOff: (s = 16) => <Svg s={s} sw={1.6}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></Svg>,
};
