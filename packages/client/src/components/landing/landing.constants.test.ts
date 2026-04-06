import { describe, test, expect } from 'vitest';
import {
  SCROLL_ZONES,
  LAYER_COLORS,
  CONNECTION_COLORS,
  NODES,
  CONNECTIONS,
  LAYER_ZONES,
  CAMERA_KEYFRAMES,
  RISK_NODES,
  DEMO_LAYERS,
  easeInOutCubic,
  getLayerEmphasis,
  getXRayIntensity,
  findCameraKeyframes,
} from './landing.constants';

// ─── SCROLL_ZONES ───

describe('SCROLL_ZONES', () => {
  const zones = Object.values(SCROLL_ZONES);

  test('all zones start at 0 and end at 1', () => {
    const allStarts = zones.map(z => z[0]);
    const allEnds = zones.map(z => z[1]);
    expect(Math.min(...allStarts)).toBe(0);
    expect(Math.max(...allEnds)).toBe(1);
  });

  test('zones are contiguous (no gaps)', () => {
    const sorted = [...zones].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i][0]).toBeCloseTo(sorted[i - 1][1], 10);
    }
  });

  test('zones do not overlap', () => {
    const sorted = [...zones].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i][0]).toBeGreaterThanOrEqual(sorted[i - 1][1]);
    }
  });

  test('each zone has start < end', () => {
    zones.forEach(([start, end]) => {
      expect(end).toBeGreaterThan(start);
    });
  });

  test('has all 6 expected zones', () => {
    expect(Object.keys(SCROLL_ZONES)).toEqual(
      expect.arrayContaining(['HERO', 'STRATEGY', 'BUSINESS', 'XRAY', 'UPLOAD', 'FOOTER'])
    );
    expect(Object.keys(SCROLL_ZONES)).toHaveLength(6);
  });
});

// ─── NODES ───

describe('NODES', () => {
  test('11 demo nodes defined', () => {
    expect(NODES).toHaveLength(11);
  });

  test('all node IDs are unique', () => {
    const ids = NODES.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every node has a valid layer', () => {
    const validLayers = Object.keys(LAYER_COLORS);
    NODES.forEach(node => {
      expect(validLayers).toContain(node.layer);
    });
  });

  test('every node has a color mapping', () => {
    NODES.forEach(node => {
      expect(LAYER_COLORS[node.layer]).toBeDefined();
    });
  });

  test('strategy nodes are at y=12', () => {
    const strategyNodes = NODES.filter(n => n.layer === 'strategy');
    expect(strategyNodes.length).toBeGreaterThan(0);
    strategyNodes.forEach(n => expect(n.pos[1]).toBe(12));
  });

  test('business nodes are at y=8', () => {
    NODES.filter(n => n.layer === 'business').forEach(n => expect(n.pos[1]).toBe(8));
  });

  test('application nodes are at y=0', () => {
    NODES.filter(n => n.layer === 'application').forEach(n => expect(n.pos[1]).toBe(0));
  });

  test('technology nodes are at y=-4', () => {
    NODES.filter(n => n.layer === 'technology').forEach(n => expect(n.pos[1]).toBe(-4));
  });

  test('layers are vertically ordered: strategy > business > application > technology', () => {
    const layerY = (layer: string) => NODES.find(n => n.layer === layer)!.pos[1];
    expect(layerY('strategy')).toBeGreaterThan(layerY('business'));
    expect(layerY('business')).toBeGreaterThan(layerY('application'));
    expect(layerY('application')).toBeGreaterThan(layerY('technology'));
  });

  test('every geometry type is valid', () => {
    const valid = ['box', 'sphere', 'cylinder', 'cone'];
    NODES.forEach(n => expect(valid).toContain(n.geometry));
  });
});

// ─── CONNECTIONS ───

describe('CONNECTIONS', () => {
  test('9 connections defined', () => {
    expect(CONNECTIONS).toHaveLength(9);
  });

  test('all connection endpoints reference valid node IDs', () => {
    const nodeIds = new Set(NODES.map(n => n.id));
    CONNECTIONS.forEach(c => {
      expect(nodeIds.has(c.from)).toBe(true);
      expect(nodeIds.has(c.to)).toBe(true);
    });
  });

  test('all connection types have color mappings', () => {
    CONNECTIONS.forEach(c => {
      expect(CONNECTION_COLORS[c.type]).toBeDefined();
    });
  });

  test('no self-referencing connections', () => {
    CONNECTIONS.forEach(c => {
      expect(c.from).not.toBe(c.to);
    });
  });
});

// ─── CAMERA_KEYFRAMES ───

describe('CAMERA_KEYFRAMES', () => {
  test('at least 2 keyframes', () => {
    expect(CAMERA_KEYFRAMES.length).toBeGreaterThanOrEqual(2);
  });

  test('first keyframe starts at progress 0', () => {
    expect(CAMERA_KEYFRAMES[0].progress).toBe(0);
  });

  test('progress values are monotonically increasing', () => {
    for (let i = 1; i < CAMERA_KEYFRAMES.length; i++) {
      expect(CAMERA_KEYFRAMES[i].progress).toBeGreaterThan(CAMERA_KEYFRAMES[i - 1].progress);
    }
  });

  test('last keyframe progress is <= 1', () => {
    expect(CAMERA_KEYFRAMES[CAMERA_KEYFRAMES.length - 1].progress).toBeLessThanOrEqual(1);
  });

  test('each keyframe has pos and lookAt with 3 coordinates', () => {
    CAMERA_KEYFRAMES.forEach(kf => {
      expect(kf.pos).toHaveLength(3);
      expect(kf.lookAt).toHaveLength(3);
    });
  });
});

// ─── RISK_NODES ───

describe('RISK_NODES', () => {
  test('all risk node IDs reference valid nodes', () => {
    const nodeIds = new Set(NODES.map(n => n.id));
    Object.keys(RISK_NODES).forEach(id => {
      expect(nodeIds.has(id)).toBe(true);
    });
  });

  test('risk scores are between 0 and 1', () => {
    Object.values(RISK_NODES).forEach(({ score }) => {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  test('risk levels are valid', () => {
    const valid = ['high', 'medium', 'low'];
    Object.values(RISK_NODES).forEach(({ risk }) => {
      expect(valid).toContain(risk);
    });
  });
});

// ─── DEMO_LAYERS ───

describe('DEMO_LAYERS', () => {
  test('4 layer planes defined', () => {
    expect(DEMO_LAYERS).toHaveLength(4);
  });

  test('layer IDs match LAYER_COLORS keys', () => {
    DEMO_LAYERS.forEach(layer => {
      expect(LAYER_COLORS[layer.id]).toBeDefined();
    });
  });

  test('layer Y positions match node Y positions', () => {
    DEMO_LAYERS.forEach(layer => {
      const matchingNode = NODES.find(n => n.layer === layer.id);
      expect(matchingNode).toBeDefined();
      expect(layer.y).toBe(matchingNode!.pos[1]);
    });
  });
});

// ─── easeInOutCubic ───

describe('easeInOutCubic', () => {
  test('returns 0 for t=0', () => {
    expect(easeInOutCubic(0)).toBe(0);
  });

  test('returns 1 for t=1', () => {
    expect(easeInOutCubic(1)).toBe(1);
  });

  test('returns 0.5 for t=0.5', () => {
    expect(easeInOutCubic(0.5)).toBe(0.5);
  });

  test('is monotonically increasing on [0,1]', () => {
    let prev = 0;
    for (let t = 0.01; t <= 1; t += 0.01) {
      const val = easeInOutCubic(t);
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });

  test('starts slow (ease in)', () => {
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
  });

  test('ends slow (ease out)', () => {
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
  });
});

// ─── getLayerEmphasis ───

describe('getLayerEmphasis', () => {
  test('hero zone: all layers at base values', () => {
    const result = getLayerEmphasis('strategy', 0.05);
    expect(result.scale).toBe(1);
    expect(result.opacity).toBe(0.92);
    expect(result.emissive).toBe(0.4);
  });

  test('strategy zone: strategy nodes are emphasized', () => {
    const result = getLayerEmphasis('strategy', 0.30); // well into strategy zone
    expect(result.scale).toBeGreaterThan(1);
    expect(result.emissive).toBeGreaterThan(0.4);
    expect(result.opacity).toBe(0.92);
  });

  test('strategy zone: non-strategy nodes are faded', () => {
    const result = getLayerEmphasis('technology', 0.25);
    expect(result.scale).toBeLessThan(1);
    expect(result.opacity).toBeLessThan(0.92);
    expect(result.emissive).toBeLessThan(0.4);
  });

  test('business zone: business/application nodes are emphasized', () => {
    const biz = getLayerEmphasis('business', 0.50);
    const app = getLayerEmphasis('application', 0.50);
    expect(biz.scale).toBeGreaterThan(1);
    expect(app.scale).toBeGreaterThan(1);
  });

  test('business zone: strategy nodes are faded', () => {
    const result = getLayerEmphasis('strategy', 0.50);
    expect(result.scale).toBeLessThan(1);
    expect(result.opacity).toBeLessThan(0.5);
  });

  test('xray zone: all layers at base (handled by XRay component)', () => {
    const result = getLayerEmphasis('strategy', 0.65);
    expect(result.scale).toBe(1);
    expect(result.opacity).toBe(0.92);
  });

  test('upload zone: all layers calm', () => {
    const result = getLayerEmphasis('business', 0.85);
    expect(result.scale).toBeLessThan(1);
    expect(result.opacity).toBeLessThan(0.92);
    expect(result.emissive).toBeLessThan(0.4);
  });

  test('unknown layer returns base values', () => {
    const result = getLayerEmphasis('nonexistent', 0.5);
    expect(result.scale).toBe(1);
    expect(result.opacity).toBe(0.92);
    expect(result.emissive).toBe(0.4);
  });

  test('emphasis ramps up at start of zone', () => {
    const early = getLayerEmphasis('strategy', 0.18); // just entered
    const later = getLayerEmphasis('strategy', 0.30); // well in
    expect(later.scale).toBeGreaterThan(early.scale);
    expect(later.emissive).toBeGreaterThan(early.emissive);
  });
});

// ─── getXRayIntensity ───

describe('getXRayIntensity', () => {
  test('returns 0 before xray zone', () => {
    expect(getXRayIntensity(0)).toBe(0);
    expect(getXRayIntensity(0.3)).toBe(0);
    expect(getXRayIntensity(0.54)).toBe(0);
  });

  test('fades in from 0.55 to 0.62', () => {
    expect(getXRayIntensity(0.55)).toBeCloseTo(0, 1);
    expect(getXRayIntensity(0.585)).toBeGreaterThan(0);
    expect(getXRayIntensity(0.585)).toBeLessThan(1);
    expect(getXRayIntensity(0.62)).toBeCloseTo(1, 1);
  });

  test('full intensity from 0.62 to 0.73', () => {
    expect(getXRayIntensity(0.65)).toBe(1);
    expect(getXRayIntensity(0.70)).toBe(1);
  });

  test('fades out from 0.73 to xray end', () => {
    expect(getXRayIntensity(0.73)).toBeCloseTo(1, 1);
    expect(getXRayIntensity(0.74)).toBeLessThan(1);
    expect(getXRayIntensity(0.74)).toBeGreaterThan(0);
  });

  test('returns 0 after xray zone', () => {
    expect(getXRayIntensity(0.8)).toBe(0);
    expect(getXRayIntensity(1.0)).toBe(0);
  });

  test('always returns value between 0 and 1', () => {
    for (let s = 0; s <= 1; s += 0.01) {
      const val = getXRayIntensity(s);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });
});

// ─── findCameraKeyframes ───

describe('findCameraKeyframes', () => {
  test('at scroll 0, uses first keyframe', () => {
    const { from, to, t } = findCameraKeyframes(0);
    expect(from.progress).toBe(0);
    expect(t).toBe(0);
  });

  test('at scroll 1, interpolates past last keyframe', () => {
    const { from, to, t } = findCameraKeyframes(1);
    // Last segment: from second-to-last to last keyframe
    const lastIdx = CAMERA_KEYFRAMES.length - 1;
    expect(from.progress).toBe(CAMERA_KEYFRAMES[lastIdx - 1].progress);
    expect(to.progress).toBe(CAMERA_KEYFRAMES[lastIdx].progress);
    expect(t).toBe(1); // fully interpolated to end
  });

  test('interpolation t is always between 0 and 1', () => {
    for (let s = 0; s <= 1; s += 0.05) {
      const { t } = findCameraKeyframes(s);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });

  test('clamps negative input', () => {
    const { from } = findCameraKeyframes(-0.5);
    expect(from.progress).toBe(0);
  });

  test('clamps input above 1', () => {
    const { from, t } = findCameraKeyframes(1.5);
    // Clamped to 1.0, so same as scroll=1
    const lastIdx = CAMERA_KEYFRAMES.length - 1;
    expect(from.progress).toBe(CAMERA_KEYFRAMES[lastIdx - 1].progress);
    expect(t).toBe(1);
  });

  test('midpoint between two keyframes gives intermediate t', () => {
    const kf0 = CAMERA_KEYFRAMES[0];
    const kf1 = CAMERA_KEYFRAMES[1];
    const mid = (kf0.progress + kf1.progress) / 2;
    const { from, to, t } = findCameraKeyframes(mid);
    expect(from.progress).toBe(kf0.progress);
    expect(to.progress).toBe(kf1.progress);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
  });
});
