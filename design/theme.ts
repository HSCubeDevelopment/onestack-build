/**
 * Auto Tech — design tokens (the single source of truth for the app's look).
 * Extracted from the prototype (design/prototype.html → https://autotech-demo.higgsfield.app).
 *
 * RULE: every screen & component references these tokens. NO raw hex / magic numbers in screens.
 * Works for React Native (Expo) and the Next.js web app (same values).
 */

export const color = {
  // brand
  navy:    '#0F2340',
  navy2:   '#16325b',
  accent:  '#FF6A2C',   // primary action (orange)
  accent2: '#ff8a55',
  teal:    '#12A594',   // staff
  tealDark:'#0F6E56',
  magenta: '#b5347e',   // tow

  // surfaces & text
  bg:    '#f4f6fa',     // app background
  card:  '#ffffff',
  ink:   '#111826',     // primary text
  sub:   '#5b6472',     // secondary / muted text
  muted: '#888780',
  line:  '#e7ebf0',     // borders / dividers
  well:  '#eef1f6',     // inset fills (segmented control bg, tiles)

  // job-state status colours
  booked:     '#8b95a5',
  inProgress: '#F59E0B',
  ready:      '#10B981',
  collected:  '#3B82F6',
  towed:      '#7c3aed',

  // semantic
  danger:  '#c23a1e',
  warning: '#F59E0B',
  success: '#10B981',
  info:    '#3B82F6',
  ai:      '#7F77DD',   // AI / lifecycle-pipeline accent

  // rego plate
  regoBg:   '#111826',
  regoText: '#ffd23f',

  // confidence badges (AI drafts)
  confHiBg: '#dff5ee', confHiText: '#0b7a5e',
  confMdBg: '#fef1d6', confMdText: '#95610a',
  confLoBg: '#fde2dc', confLoText: '#c23a1e',

  white: '#ffffff',
} as const;

/** Role home themes (hero gradients). Use with expo-linear-gradient. */
export const roleTheme = {
  owner: { from: color.navy,  to: color.navy2,   accent: color.accent },
  staff: { from: '#0b3b34',   to: color.teal,    accent: color.teal },
  tow:   { from: '#3a2140',   to: color.magenta, accent: color.magenta },
} as const;

/** Spacing scale (px). */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** Corner radii (px). */
export const radius = { sm: 8, md: 12, lg: 16, xl: 18, pill: 20, phone: 46 } as const;

/** Typography. `family` = your loaded font, or undefined for system default. */
export const type = {
  family: undefined as string | undefined,
  h1:      { size: 19, weight: '800' as const },
  title:   { size: 15, weight: '800' as const },
  body:    { size: 14, weight: '600' as const },
  small:   { size: 12, weight: '600' as const },
  caption: { size: 11, weight: '700' as const },
  kpi:     { size: 22, weight: '800' as const },
  label:   { size: 11, weight: '800' as const, letterSpacing: 0.3 }, // section labels, color = color.sub
} as const;

/** Card shadow — RN (iOS shadow* + Android elevation). Prototype: 0 8px 22px rgba(16,35,64,.10). */
export const shadow = {
  card: {
    shadowColor: '#10233F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 22,
    elevation: 4,
  },
  fab: {
    shadowColor: '#FF6A2C',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 26,
    elevation: 8,
  },
} as const;

export const theme = { color, roleTheme, space, radius, type, shadow };
export default theme;
