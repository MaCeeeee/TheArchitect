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
