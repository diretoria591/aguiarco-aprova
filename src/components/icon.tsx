import type { CSSProperties } from 'react';

const I = {
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M4 12l16-8-6 16-3-7-7-1z"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  bell: '<path d="M6 16V11a6 6 0 1112 0v5l2 2H4l2-2z"/><path d="M10 20a2 2 0 004 0"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
  video: '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  text: '<path d="M5 6h14M5 12h14M5 18h9"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.2 3.2 0 010 6.3M18 14.3c1.8.8 3 2.6 3 4.7"/>',
  out: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  whats: '<path d="M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-4-1.1L4 20z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 01-1.8-1.8l.8-1-1-2L9 9.5z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
  ext: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.9 7.9"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
} as const;

export type IconName = keyof typeof I;

export function Icon({ name, style }: { name: IconName; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
      dangerouslySetInnerHTML={{ __html: I[name] }}
    />
  );
}
