import { useRef, useMemo, useEffect, MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SCROLL_ZONES } from './landing.constants';

// ─── TheArchitect docs in Chinese (character source) ────
const DOC_TEXT =
  '建筑师是一个人工智能原生的企业架构管理平台' +
  '三维可视化引擎使用React和WebGPU渲染' +
  '支持TOGAF第十版和ArchiMate三点二规范' +
  '贝叶斯风险级联传播引擎自动计算跨层风险' +
  '蒙特卡洛模拟使用分布进行成本估算' +
  '鱼群智能引擎是多代理模拟的核心组件' +
  '每个代理使用独立的利益相关者角色进行辩论' +
  '反幻觉层验证每个代理操作与状态' +
  '三因子疲劳指数测量并发负载和谈判阻力' +
  '涌现追踪检测死锁共识联盟升级和疲劳' +
  '人工智能架构顾问包含十四个检测器' +
  '健康评分综合风险合规性和成熟度指标' +
  '转型路线图生成器创建基于波次的迁移计划' +
  '三维架构视图使用层平面和元素网格渲染' +
  '飞行导航允许快速定位到任意架构元素' +
  '审计日志记录所有变更包括用户和时间戳' +
  '合规评估服务检查架构是否符合策略规则' +
  '企业架构不应该是象牙塔里的理论练习' +
  '架构分析必须到达决策层才能产生价值' +
  '人工智能原生意味着核心而不是插件' +
  '单一事实来源每个组织一个权威架构库';

// ─── Config ─────────────────────────────────────────────
const NUM_COLUMNS_HIGH = 50;
const NUM_COLUMNS_LOW = 25;
const CHARS_PER_COL = 14;
const SPREAD_X = 70;
const SPREAD_Z = 60;
const TOP_Y = 35;
const BOTTOM_Y = -15;
const CHAR_SIZE = 0.9;
const CHAR_SPACING = 1.1;
const ATLAS_GRID = 16; // 16×16 = 256 cells
const ATLAS_CELL_PX = 64;

const COLOR_GREEN = new THREE.Color('#00ff41');
const COLOR_RED = new THREE.Color('#ef4444');

interface Props {
  perfLevel: 'high' | 'low';
  scrollRef: MutableRefObject<number>;
}

// ─── Character atlas texture ────────────────────────────
function buildAtlas() {
  const uniqueChars = [...new Set(DOC_TEXT)];
  const size = ATLAS_CELL_PX * ATLAS_GRID;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);
  ctx.font = `bold ${ATLAS_CELL_PX * 0.6}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';

  const count = Math.min(uniqueChars.length, ATLAS_GRID * ATLAS_GRID);
  for (let i = 0; i < count; i++) {
    const col = i % ATLAS_GRID;
    const row = Math.floor(i / ATLAS_GRID);
    ctx.fillText(uniqueChars[i], (col + 0.5) * ATLAS_CELL_PX, (row + 0.5) * ATLAS_CELL_PX);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return { texture: tex, charCount: count };
}

// ─── Shader ─────────────────────────────────────────────
const vertexShader = /* glsl */ `
  attribute float aCharIndex;
  attribute float aOpacity;

  uniform float uGridSize;

  varying vec2 vAtlasUV;
  varying float vOpacity;

  void main() {
    vOpacity = aOpacity;

    // Character atlas cell
    float idx = floor(aCharIndex);
    float col = mod(idx, uGridSize);
    float row = floor(idx / uGridSize);
    float cell = 1.0 / uGridSize;

    // Map plane UV (0-1) into atlas cell, flip Y (canvas top-down)
    vAtlasUV = vec2(
      (col + uv.x) * cell,
      1.0 - (row + (1.0 - uv.y)) * cell
    );

    // Billboard: extract world position, add vertex offset in view space
    vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mvPos.xy += position.xy;

    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uColor;

  varying vec2 vAtlasUV;
  varying float vOpacity;

  void main() {
    float texAlpha = texture2D(uAtlas, vAtlasUV).r;
    float alpha = texAlpha * vOpacity;
    if (alpha < 0.02) discard;

    vec3 col = uColor * (0.3 + vOpacity * 0.7);
    gl_FragColor = vec4(col, alpha);
  }
`;

// ─── Column state ───────────────────────────────────────
interface Column {
  x: number;
  z: number;
  headY: number;
  speed: number;
  chars: number[];
}

// ─── Component ──────────────────────────────────────────
export default function MatrixRain3D({ perfLevel, scrollRef }: Props) {
  const numColumns = perfLevel === 'high' ? NUM_COLUMNS_HIGH : NUM_COLUMNS_LOW;
  const totalInstances = numColumns * CHARS_PER_COL;

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Atlas
  const { texture, charCount } = useMemo(() => buildAtlas(), []);

  // Shader material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: texture },
        uGridSize: { value: ATLAS_GRID },
        uColor: { value: COLOR_GREEN.clone() },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }, [texture]);

  // Column data
  const columns = useMemo<Column[]>(() => {
    return Array.from({ length: numColumns }, () => ({
      x: (Math.random() - 0.5) * SPREAD_X,
      z: (Math.random() - 0.5) * SPREAD_Z,
      headY: Math.random() * (TOP_Y - BOTTOM_Y) + BOTTOM_Y,
      speed: 1.5 + Math.random() * 3.5,
      chars: Array.from({ length: CHARS_PER_COL }, () =>
        Math.floor(Math.random() * charCount)
      ),
    }));
  }, [numColumns, charCount]);

  // Per-instance attributes
  const charIndices = useMemo(() => new Float32Array(totalInstances), [totalInstances]);
  const opacities = useMemo(() => new Float32Array(totalInstances), [totalInstances]);

  // Attach instanced attributes to geometry
  const charAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);
  const opaAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);

  useEffect(() => {
    if (!meshRef.current) return;
    const geom = meshRef.current.geometry;

    const charAttr = new THREE.InstancedBufferAttribute(charIndices, 1);
    const opaAttr = new THREE.InstancedBufferAttribute(opacities, 1);
    geom.setAttribute('aCharIndex', charAttr);
    geom.setAttribute('aOpacity', opaAttr);
    charAttrRef.current = charAttr;
    opaAttrRef.current = opaAttr;
  }, [charIndices, opacities]);

  // Animation
  useFrame((_, delta) => {
    if (!meshRef.current || !charAttrRef.current || !opaAttrRef.current) return;
    const s = scrollRef.current;

    // Speed multiplier: slow down in upload zone
    const speedMul = s > SCROLL_ZONES.UPLOAD[0] ? 0.3 : 1;

    // Color: lerp to red in X-Ray zone
    const [xStart, xEnd] = SCROLL_ZONES.XRAY;
    let xrayT = 0;
    if (s >= xStart && s < xEnd) {
      xrayT = Math.min((s - xStart) / (xEnd - xStart) * 2, 1);
    }
    const targetColor = COLOR_GREEN.clone().lerp(COLOR_RED, xrayT);
    (material.uniforms.uColor.value as THREE.Color).lerp(targetColor, 0.06);

    let idx = 0;
    for (let c = 0; c < numColumns; c++) {
      const col = columns[c];

      // Move column down
      col.headY -= col.speed * delta * speedMul;

      // Reset at bottom
      if (col.headY < BOTTOM_Y) {
        col.headY = TOP_Y + Math.random() * 5;
        col.x = (Math.random() - 0.5) * SPREAD_X;
        // Shuffle characters
        for (let j = 0; j < CHARS_PER_COL; j++) {
          col.chars[j] = Math.floor(Math.random() * charCount);
        }
      }

      // Place each character in the column
      for (let j = 0; j < CHARS_PER_COL; j++) {
        const y = col.headY + j * CHAR_SPACING;

        // Skip if above scene
        if (y > TOP_Y + 5) {
          // Still need to set matrix for this instance (hide it)
          dummy.position.set(0, -999, 0);
          dummy.updateMatrix();
          meshRef.current!.setMatrixAt(idx, dummy.matrix);
          charIndices[idx] = 0;
          opacities[idx] = 0;
          idx++;
          continue;
        }

        dummy.position.set(col.x, y, col.z);
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(idx, dummy.matrix);

        charIndices[idx] = col.chars[j];

        // Head character is brightest, trail fades
        const fadeT = j / CHARS_PER_COL;
        opacities[idx] = Math.max(0, 0.5 * (1 - fadeT * fadeT) + (j === 0 ? 0.2 : 0));

        idx++;
      }
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    charAttrRef.current.needsUpdate = true;
    opaAttrRef.current.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, totalInstances]} frustumCulled={false}>
      <planeGeometry args={[CHAR_SIZE, CHAR_SIZE]} />
      <primitive object={material} attach="material" />
    </instancedMesh>
  );
}
