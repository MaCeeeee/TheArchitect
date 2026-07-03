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
