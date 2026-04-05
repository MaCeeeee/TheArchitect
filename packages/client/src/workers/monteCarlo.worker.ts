/**
 * Monte Carlo Web Worker — client-side PERT simulation.
 * Runs 10K iterations without blocking the UI thread.
 */

interface MCInput {
  elements: {
    elementId: string;
    name: string;
    optimistic: number;
    mostLikely: number;
    pessimistic: number;
    successProbability?: number;
  }[];
  iterations: number;
}

interface MCOutput {
  mean: number;
  stdDev: number;
  p10: number;
  p50: number;
  p90: number;
  var95: number;
  histogram: { bucket: number; count: number }[];
  elementContributions: { elementId: string; name: string; varianceContribution: number }[];
}

// Beta-PERT sampler (matches server implementation)
function betaPertSample(min: number, mode: number, max: number): number {
  if (min >= max) return mode;
  const range = max - min;
  const mu = (min + 4 * mode + max) / 6;
  const alpha1 = ((mu - min) * (2 * mode - min - max)) / ((mode - mu) * range);
  const alpha2 = alpha1 * (max - mu) / (mu - min);

  if (alpha1 <= 0 || alpha2 <= 0 || !isFinite(alpha1) || !isFinite(alpha2)) {
    // Triangular fallback
    const u = Math.random();
    const fc = (mode - min) / range;
    return u < fc
      ? min + Math.sqrt(u * range * (mode - min))
      : max - Math.sqrt((1 - u) * range * (max - mode));
  }

  const beta = sampleBeta(alpha1, alpha2);
  return min + beta * range;
}

function sampleBeta(a: number, b: number): number {
  const ga = sampleGamma(a);
  const gb = sampleGamma(b);
  return ga / (ga + gb);
}

function sampleGamma(shape: number): number {
  if (shape < 1) return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number, v: number;
    do { x = randomNormal(); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function randomNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function runSimulation(input: MCInput): MCOutput {
  const { elements, iterations } = input;
  if (elements.length === 0) {
    return { mean: 0, stdDev: 0, p10: 0, p50: 0, p90: 0, var95: 0, histogram: [], elementContributions: [] };
  }

  const totals: number[] = [];
  const elementSums: number[][] = elements.map(() => []);

  for (let i = 0; i < iterations; i++) {
    let total = 0;
    for (let j = 0; j < elements.length; j++) {
      const el = elements[j];
      let cost = betaPertSample(el.optimistic, el.mostLikely, el.pessimistic);
      if (el.successProbability != null && el.successProbability < 1) {
        if (Math.random() > el.successProbability) cost *= 1.5;
      }
      elementSums[j].push(cost);
      total += cost;
    }
    totals.push(total);
  }

  totals.sort((a, b) => a - b);
  const mean = totals.reduce((s, v) => s + v, 0) / totals.length;
  const variance = totals.reduce((s, v) => s + (v - mean) ** 2, 0) / totals.length;

  const p10 = totals[Math.floor(iterations * 0.10)];
  const p50 = totals[Math.floor(iterations * 0.50)];
  const p90 = totals[Math.floor(iterations * 0.90)];
  const var95 = totals[Math.floor(iterations * 0.95)];

  // Histogram
  const bucketCount = 20;
  const minVal = totals[0];
  const maxVal = totals[totals.length - 1];
  const bucketSize = (maxVal - minVal) / bucketCount || 1;
  const histogram: { bucket: number; count: number }[] = [];
  for (let b = 0; b < bucketCount; b++) {
    histogram.push({ bucket: Math.round(minVal + b * bucketSize), count: 0 });
  }
  for (const v of totals) {
    const idx = Math.min(Math.floor((v - minVal) / bucketSize), bucketCount - 1);
    histogram[idx].count++;
  }

  // Variance contributions
  const elementContributions = elements.map((el, j) => {
    const elMean = elementSums[j].reduce((s, v) => s + v, 0) / elementSums[j].length;
    const elVar = elementSums[j].reduce((s, v) => s + (v - elMean) ** 2, 0) / elementSums[j].length;
    return { elementId: el.elementId, name: el.name, varianceContribution: variance > 0 ? elVar / variance : 0 };
  });
  elementContributions.sort((a, b) => b.varianceContribution - a.varianceContribution);

  return {
    mean: Math.round(mean),
    stdDev: Math.round(Math.sqrt(variance)),
    p10: Math.round(p10),
    p50: Math.round(p50),
    p90: Math.round(p90),
    var95: Math.round(var95),
    histogram,
    elementContributions,
  };
}

// Web Worker message handler
self.onmessage = (e: MessageEvent<MCInput>) => {
  const result = runSimulation(e.data);
  self.postMessage(result);
};
