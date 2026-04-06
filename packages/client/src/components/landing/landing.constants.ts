// ─── Shared scroll zones (used by all landing components) ───
export const SCROLL_ZONES = {
  HERO:        [0.00, 0.17] as const,
  STRATEGY:    [0.17, 0.35] as const,
  BUSINESS:    [0.35, 0.58] as const,
  XRAY:        [0.58, 0.75] as const,
  UPLOAD:      [0.75, 0.92] as const,
  FOOTER:      [0.92, 1.00] as const,
};

// ─── Colors (strategy = purple per design tokens) ───
export const LAYER_COLORS: Record<string, string> = {
  strategy: '#8b5cf6',
  business: '#22c55e',
  application: '#f97316',
  technology: '#00ff41',
};

export const CONNECTION_COLORS: Record<string, string> = {
  triggers: '#eab308',
  depends_on: '#ef4444',
  uses: '#00ff41',
  data_flow: '#06b6d4',
  runs_on: '#00ff41',
  integrates: '#f59e0b',
};

// ─── Demo nodes ───
export interface DemoNode {
  id: string;
  layer: string;
  geometry: 'box' | 'sphere' | 'cylinder' | 'cone';
  pos: [number, number, number];
}

export const NODES: DemoNode[] = [
  // Strategy (y=12)
  { id: 's1', layer: 'strategy',    geometry: 'box',      pos: [-2, 12, 0]   },
  { id: 's2', layer: 'strategy',    geometry: 'box',      pos: [2, 12, -1]   },
  // Business (y=8)
  { id: 'b1', layer: 'business',    geometry: 'cylinder', pos: [-3, 8, 1.5]  },
  { id: 'b2', layer: 'business',    geometry: 'sphere',   pos: [0, 8, 2.5]   },
  { id: 'b3', layer: 'business',    geometry: 'cylinder', pos: [3, 8, -1]    },
  // Application (y=0)
  { id: 'a1', layer: 'application', geometry: 'sphere',   pos: [-4, 0, 0]    },
  { id: 'a2', layer: 'application', geometry: 'box',      pos: [0, 0, 1.5]   },
  { id: 'a3', layer: 'application', geometry: 'cone',     pos: [4, 0, -1]    },
  // Technology (y=-4)
  { id: 't1', layer: 'technology',  geometry: 'box',      pos: [-2.5, -4, 1] },
  { id: 't2', layer: 'technology',  geometry: 'cylinder', pos: [1.5, -4, -1] },
  { id: 't3', layer: 'technology',  geometry: 'sphere',   pos: [4, -4, 1.5]  },
];

export const CONNECTIONS = [
  { from: 's1', to: 'b1', type: 'triggers' },
  { from: 's2', to: 'b2', type: 'depends_on' },
  { from: 'b1', to: 'a2', type: 'uses' },
  { from: 'b2', to: 'a1', type: 'data_flow' },
  { from: 'b3', to: 'a3', type: 'uses' },
  { from: 'a1', to: 't1', type: 'runs_on' },
  { from: 'a2', to: 't2', type: 'data_flow' },
  { from: 'a3', to: 't3', type: 'runs_on' },
  { from: 'a2', to: 'a1', type: 'integrates' },
];

// Layer-to-scroll-zone mapping for isolation
export const LAYER_ZONES: Record<string, readonly [number, number]> = {
  strategy:    SCROLL_ZONES.STRATEGY,
  business:    SCROLL_ZONES.BUSINESS,
  application: SCROLL_ZONES.BUSINESS,
  technology:  SCROLL_ZONES.BUSINESS,
};

// ─── Camera keyframes ───
export const CAMERA_KEYFRAMES = [
  { progress: 0.00, pos: [0, 30, 40]  as const, lookAt: [0, 4, 0]  as const },
  { progress: 0.17, pos: [8, 18, 15]  as const, lookAt: [0, 8, 0]  as const },
  { progress: 0.35, pos: [12, 10, 12] as const, lookAt: [0, 4, 0]  as const },
  { progress: 0.58, pos: [15, 12, 15] as const, lookAt: [0, 4, 0]  as const },
  { progress: 0.75, pos: [0, 25, 35]  as const, lookAt: [0, 4, 0]  as const },
];

// ─── X-Ray risk nodes ───
export const RISK_NODES: Record<string, { risk: 'high' | 'medium' | 'low'; score: number }> = {
  a2: { risk: 'high', score: 0.9 },
  t1: { risk: 'medium', score: 0.6 },
  b2: { risk: 'high', score: 0.85 },
  a3: { risk: 'medium', score: 0.55 },
};

// ─── Layer planes ───
export const DEMO_LAYERS = [
  { id: 'strategy',    y: 12, color: '#8b5cf6', zone: SCROLL_ZONES.STRATEGY },
  { id: 'business',    y: 8,  color: '#22c55e', zone: SCROLL_ZONES.BUSINESS },
  { id: 'application', y: 0,  color: '#f97316', zone: SCROLL_ZONES.BUSINESS },
  { id: 'technology',  y: -4, color: '#00ff41', zone: SCROLL_ZONES.BUSINESS },
] as const;

// ─── Pure functions ───

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function getLayerEmphasis(layer: string, scroll: number): { scale: number; opacity: number; emissive: number } {
  const zone = LAYER_ZONES[layer];
  if (!zone) return { scale: 1, opacity: 0.92, emissive: 0.4 };

  const [start, end] = zone;
  const heroEnd = SCROLL_ZONES.HERO[1];
  const uploadStart = SCROLL_ZONES.UPLOAD[0];
  const xrayStart = SCROLL_ZONES.XRAY[0];

  // Hero zone — all visible
  if (scroll < heroEnd) {
    return { scale: 1, opacity: 0.92, emissive: 0.4 };
  }

  // X-Ray zone — handled by LandingXRay, keep all at base
  if (scroll >= xrayStart && scroll < uploadStart) {
    return { scale: 1, opacity: 0.92, emissive: 0.4 };
  }

  // Upload/Footer — all calm
  if (scroll >= uploadStart) {
    return { scale: 0.95, opacity: 0.7, emissive: 0.2 };
  }

  // Layer-specific zone — emphasis logic
  if (scroll >= start && scroll < end) {
    const t = (scroll - start) / (end - start);
    const ramp = Math.min(t * 4, 1);
    return {
      scale: 1 + 0.3 * ramp,
      opacity: 0.92,
      emissive: 0.4 + 0.6 * ramp,
    };
  }

  // Another layer is in focus — fade this one
  return { scale: 0.7, opacity: 0.2, emissive: 0.15 };
}

export function getXRayIntensity(scroll: number): number {
  const [, xEnd] = SCROLL_ZONES.XRAY;
  let intensity = 0;
  if (scroll >= 0.55 && scroll < 0.62) {
    intensity = (scroll - 0.55) / 0.07;
  } else if (scroll >= 0.62 && scroll < 0.73) {
    intensity = 1;
  } else if (scroll >= 0.73 && scroll < xEnd) {
    intensity = 1 - (scroll - 0.73) / (xEnd - 0.73);
  }
  return Math.max(0, Math.min(1, intensity));
}

export function findCameraKeyframes(offset: number) {
  const clamped = Math.min(Math.max(offset, 0), 1);
  let i = 0;
  for (let k = 0; k < CAMERA_KEYFRAMES.length - 1; k++) {
    if (clamped >= CAMERA_KEYFRAMES[k].progress) i = k;
  }
  const from = CAMERA_KEYFRAMES[i];
  const to = CAMERA_KEYFRAMES[Math.min(i + 1, CAMERA_KEYFRAMES.length - 1)];
  const range = to.progress - from.progress;
  const t = range > 0 ? easeInOutCubic(Math.min((clamped - from.progress) / range, 1)) : 0;
  return { from, to, t };
}
