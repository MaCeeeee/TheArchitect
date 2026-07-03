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
