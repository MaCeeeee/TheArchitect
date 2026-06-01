// Design Token Architecture — TheArchitect
// Single source of truth for all visual decisions.
// Inspired by Alla Kholmatova's "Design Systems" — semantic naming by function, not hue.

export const tokens = {
  // Surfaces (ordered by elevation)
  surface: {
    base:    '#0a0a0a',
    raised:  '#111111',
    overlay: '#1a1a1a',
    sunken:  '#050505',
  },

  // Borders (three intensities)
  border: {
    subtle:  '#1a2a1a',
    default: '#2a3a2a',
    strong:  '#3a4a3a',
  },

  // Primary accent (cyberpunk green — the brand)
  accent: {
    default: '#00ff41',
    hover:   '#00cc33',
    muted:   'rgba(0, 255, 65, 0.15)',
    text:    '#33ff66',
    glow:    '0 0 12px rgba(0, 255, 65, 0.25)',
  },

  // Text hierarchy (4 levels)
  text: {
    primary:   '#f0f0f0',
    secondary: '#b0b8b0',
    tertiary:  '#6a7a6a',
    disabled:  '#3a4a3a',
  },

  // Semantic status colors
  status: {
    success: '#22c55e',
    warning: '#eab308',
    danger:  '#ef4444',
    info:    '#38bdf8',
    purple:  '#a78bfa',
  },

  // Official ArchiMate 3.2 layer palette (kept in sync with shared ARCHITECTURE_LAYERS)
  layers: {
    motivation:     '#8b5cf6',  // violet
    strategy:       '#f59e0b',  // amber
    business:       '#facc15',  // yellow
    information:    '#3b82f6',  // blue (TheArchitect extension)
    application:    '#06b6d4',  // cyan
    technology:     '#22c55e',  // green
    physical:       '#16a34a',  // deep green
    implementation: '#ec4899',  // rose
  },

  // Spacing scale (8px base)
  space: {
    xs:   '4px',
    sm:   '8px',
    md:   '12px',
    lg:   '16px',
    xl:   '24px',
    '2xl': '32px',
    '3xl': '48px',
  },

  // Typography scale
  fontSize: {
    xs:   '10px',
    sm:   '12px',
    base: '14px',
    lg:   '16px',
    xl:   '20px',
    '2xl': '24px',
  },

  // Border radius
  radius: {
    sm:   '4px',
    md:   '6px',
    lg:   '8px',
    xl:   '12px',
    full: '9999px',
  },

  // Shadows / Elevation
  shadow: {
    glow:   '0 0 10px rgba(0, 255, 65, 0.15)',
    glowLg: '0 0 20px rgba(0, 255, 65, 0.25)',
    card:   '0 2px 8px rgba(0, 0, 0, 0.3)',
    modal:  '0 8px 32px rgba(0, 0, 0, 0.5)',
  },

  // Motion
  motion: {
    fast:    '150ms ease-out',
    default: '200ms ease-out',
    slow:    '400ms ease-out',
    spring:  '300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const;

// Type helpers
export type SurfaceToken = keyof typeof tokens.surface;
export type StatusToken = keyof typeof tokens.status;
export type TextToken = keyof typeof tokens.text;
