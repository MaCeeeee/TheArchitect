import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainOf, layerOf, autoLayout } from './commit-model.mjs';

test('domainOf maps every ArchiMate layer to its canonical TOGAF domain', () => {
  assert.equal(domainOf('motivation'), 'motivation');
  assert.equal(domainOf('strategy'), 'strategy');
  assert.equal(domainOf('business'), 'business');
  assert.equal(domainOf('information'), 'data');          // Data domain
  assert.equal(domainOf('application'), 'application');
  assert.equal(domainOf('technology'), 'technology');
  assert.equal(domainOf('physical'), 'technology');       // physical → technology domain
  assert.equal(domainOf('implementation_migration'), 'implementation');
});

test('layerOf infers the layer for common non-motivation/strategy types', () => {
  assert.equal(layerOf('application_component'), 'application');
  assert.equal(layerOf('application_service'), 'application');
  assert.equal(layerOf('node'), 'technology');
  assert.equal(layerOf('system_software'), 'technology');
  assert.equal(layerOf('data_object'), 'information');
  assert.equal(layerOf('process'), 'business');            // explicit business behavioral
  assert.equal(layerOf('stakeholder'), 'motivation');      // unchanged
  assert.equal(layerOf('business_capability'), 'strategy'); // unchanged
});

test('autoLayout separates different types in the same plane so no two elements collide', () => {
  const els = [
    { id: 'ac1', type: 'application_component', name: 'A', layer: 'application' },
    { id: 'ac2', type: 'application_component', name: 'B', layer: 'application' },
    { id: 'as1', type: 'application_service',   name: 'C', layer: 'application' },
    { id: 'as2', type: 'application_service',   name: 'D', layer: 'application' },
  ];
  autoLayout(els);
  const key = (e) => `${e.position3D.x}|${e.position3D.y}|${e.position3D.z}`;
  const coords = els.map(key);
  assert.equal(new Set(coords).size, coords.length, 'every element has a unique coordinate');
  // The two type-groups must occupy different Z lanes.
  const zByType = {};
  for (const e of els) (zByType[e.type] ||= new Set()).add(e.position3D.z);
  assert.notDeepEqual([...zByType.application_component], [...zByType.application_service]);
});

test('autoLayout gives motivation types that share a Y band one row, so they never collide', () => {
  // requirement/constraint (y 16), outcome/am_value (y 21) and assessment/meaning (y 26)
  // share a Y band. Laid out per type, each one became a centred row at x=0 → same spot.
  const els = [
    { id: 'r1', type: 'requirement', name: 'R', layer: 'motivation' },
    { id: 'c1', type: 'constraint',  name: 'C', layer: 'motivation' },
    { id: 'o1', type: 'outcome',     name: 'O', layer: 'motivation' },
    { id: 'v1', type: 'am_value',    name: 'V', layer: 'motivation' },
    { id: 'a1', type: 'assessment',  name: 'A', layer: 'motivation' },
    { id: 'm1', type: 'meaning',     name: 'M', layer: 'motivation' },
  ];
  autoLayout(els);
  const coords = els.map((e) => `${e.position3D.x}|${e.position3D.y}|${e.position3D.z}`);
  assert.equal(new Set(coords).size, coords.length, 'every element has a unique coordinate');
  // Motivation stays a vertical wall at z = 0 (references/3d-layout.md).
  for (const e of els) assert.equal(e.position3D.z, 0, `${e.id} stays on the wall`);
});

test('autoLayout never stacks two elements of a mixed model on one coordinate', () => {
  const types = [
    ['stakeholder', 3], ['driver', 2], ['assessment', 1], ['meaning', 1], ['goal', 2], ['outcome', 2],
    ['am_value', 1], ['principle', 1], ['requirement', 3], ['constraint', 2],
    ['value_stream', 2], ['business_capability', 3], ['resource', 1],
    ['business_role', 2], ['business_service', 1], ['process', 1],
    ['application_component', 3], ['application_function', 4], ['application_service', 2],
    ['data_object', 4], ['node', 3],
  ];
  const els = types.flatMap(([type, n]) =>
    Array.from({ length: n }, (_, i) => ({ id: `${type}-${i}`, type, name: `${type} ${i}` })));
  autoLayout(els);
  const seen = new Map();
  for (const e of els) {
    const k = `${e.position3D.x}|${e.position3D.y}|${e.position3D.z}`;
    assert.ok(!seen.has(k), `${e.id} collides with ${seen.get(k)} at ${k}`);
    seen.set(k, e.id);
  }
});
