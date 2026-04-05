/**
 * Smart Cost Estimation Tests
 *
 * Verifies zero-cost detection, benchmark matching, and fallback behavior.
 *
 * Run: cd packages/server && npx jest src/__tests__/smart-cost.test.ts --verbose
 */

import { estimateSmartCost, applyStatusMultiplier } from '../services/smart-cost.service';
import {
  TECHNOLOGY_BENCHMARKS,
  ZERO_COST_ELEMENT_TYPES,
  ZERO_COST_NAME_PATTERN,
} from '@thearchitect/shared';

// ════════════════════════════════════════════════════════
// Zero-Cost Detection
// ════════════════════════════════════════════════════════

describe('Zero-Cost: Structural ArchiMate Types', () => {
  it.each([
    'data_entity', 'data_object', 'data_model', 'grouping', 'location',
    'stakeholder', 'driver', 'assessment', 'goal', 'outcome',
    'principle', 'requirement', 'constraint', 'meaning', 'am_value',
    'business_object', 'contract', 'representation', 'gap', 'plateau',
  ])('type "%s" → $0 / zero confidence', (type) => {
    const result = estimateSmartCost('Some Element', type, 'application');
    expect(result.annualCost).toBe(0);
    expect(result.confidence).toBe('zero');
  });
});

describe('Zero-Cost: Name-Based Patterns', () => {
  it.each([
    'Sticky Note', 'Sticky Note3', 'noOp', 'noop',
    'Set Schema', 'Merge', 'Merge2', 'Aggregate', 'Aggregate2',
    'If Task', 'Switch', 'Loop Over', 'Filter', 'Sort', 'Limit',
  ])('name "%s" → $0 / zero confidence', (name) => {
    // Use a non-structural type so we test name matching, not type matching
    const result = estimateSmartCost(name, 'application_component', 'application');
    expect(result.annualCost).toBe(0);
    expect(result.confidence).toBe('zero');
  });
});

// ════════════════════════════════════════════════════════
// Benchmark Matching
// ════════════════════════════════════════════════════════

describe('Benchmark: Database Technologies', () => {
  it.each([
    ['Postgres PGVector Store', 'postgresql', 3600],
    ['PostgreSQL Data Sync', 'postgresql', 3600],
    ['MySQL Backup Service', 'mysql', 3000],
    ['MongoDB Atlas Cluster', 'mongodb', 6000],
    ['Redis Cache Layer', 'redis', 2400],
    ['Neo4j Graph Database', 'neo4j', 7200],
    ['Elasticsearch Index', 'elasticsearch', 9600],
    ['SQLite Local DB', 'sqlite', 0],
  ])('"%s" → benchmark "%s" ($%d)', (name, expectedBenchmark, expectedCost) => {
    const result = estimateSmartCost(name, 'application_component', 'application');
    expect(result.confidence).toBe('benchmark');
    expect(result.matchedBenchmark).toBe(expectedBenchmark);
    expect(result.annualCost).toBe(expectedCost);
  });
});

describe('Benchmark: SaaS Tools', () => {
  it.each([
    ['Slack Notification', 'slack', 960],
    ['Jira Issue Tracker', 'jira', 4200],
    ['GitHub Repository', 'github', 2400],
    ['Notion Workspace', 'notion', 960],
    ['Salesforce CRM', 'salesforce', 18000],
  ])('"%s" → benchmark "%s" ($%d)', (name, expectedBenchmark, expectedCost) => {
    const result = estimateSmartCost(name, 'application_service', 'application');
    expect(result.confidence).toBe('benchmark');
    expect(result.matchedBenchmark).toBe(expectedBenchmark);
    expect(result.annualCost).toBe(expectedCost);
  });
});

describe('Benchmark: AI/ML', () => {
  it.each([
    ['OpenAI Embedding Generator', 'openai', 12000],
    ['Claude API Gateway', 'anthropic', 12000],
    ['LangChain RAG Pipeline', 'langchain', 6000],
    ['Ollama Local LLM', 'ollama', 2400],
  ])('"%s" → benchmark "%s" ($%d)', (name, expectedBenchmark, expectedCost) => {
    const result = estimateSmartCost(name, 'application_component', 'application');
    expect(result.confidence).toBe('benchmark');
    expect(result.matchedBenchmark).toBe(expectedBenchmark);
    expect(result.annualCost).toBe(expectedCost);
  });
});

describe('Benchmark: Infrastructure', () => {
  it.each([
    ['Kubernetes Cluster', 'kubernetes', 24000],
    ['AWS Lambda Function', 'lambda', 360],
    ['S3 Document Storage', 's3', 600],
    ['RabbitMQ Message Broker', 'rabbitmq', 4800],
    ['Kafka Event Stream', 'kafka', 18000],
    ['Nginx Reverse Proxy', 'nginx', 1200],
    ['Cloudflare CDN', 'cloudflare', 2400],
  ])('"%s" → benchmark "%s" ($%d)', (name, expectedBenchmark, expectedCost) => {
    const result = estimateSmartCost(name, 'technology_component', 'technology');
    expect(result.confidence).toBe('benchmark');
    expect(result.matchedBenchmark).toBe(expectedBenchmark);
    expect(result.annualCost).toBe(expectedCost);
  });
});

describe('Benchmark: Workflow Utility Nodes (via benchmark, not name pattern)', () => {
  it.each([
    ['HTTP Request to Payment API', 'http_request', 0],
    ['Extract from Excel Sheet', 'extract_transform', 0],
  ])('"%s" → benchmark "%s" ($%d)', (name, expectedBenchmark, expectedCost) => {
    const result = estimateSmartCost(name, 'application_service', 'application');
    expect(result.matchedBenchmark).toBe(expectedBenchmark);
    expect(result.annualCost).toBe(expectedCost);
  });
});

describe('Benchmark: Metadata-Enhanced Matching', () => {
  it('uses n8nType metadata for matching', () => {
    const result = estimateSmartCost(
      'Data Sync Node', 'application_service', 'application',
      { n8nType: 'n8n-nodes-base.postgres' },
    );
    expect(result.confidence).toBe('benchmark');
    expect(result.matchedBenchmark).toBe('postgresql');
    expect(result.annualCost).toBe(3600);
  });
});

// ════════════════════════════════════════════════════════
// Fallback Behavior
// ════════════════════════════════════════════════════════

describe('Fallback: Type-Based Defaults', () => {
  it('uses BASE_COSTS_BY_TYPE for unmatched operational types', () => {
    const result = estimateSmartCost('Custom Internal App', 'application_component', 'application');
    expect(result.confidence).toBe('type_default');
    expect(result.annualCost).toBe(20000); // application_component default
  });

  it('uses layer default when type has no base cost', () => {
    const result = estimateSmartCost('Unknown Thing', 'some_unknown_type' as any, 'technology');
    expect(result.confidence).toBe('type_default');
    expect(result.annualCost).toBe(15000); // technology layer default
  });
});

// ════════════════════════════════════════════════════════
// Status Multiplier
// ════════════════════════════════════════════════════════

describe('Status Multiplier', () => {
  it('current → 1.0x', () => expect(applyStatusMultiplier(10000, 'current')).toBe(10000));
  it('target → 1.8x', () => expect(applyStatusMultiplier(10000, 'target')).toBe(18000));
  it('transitional → 1.5x', () => expect(applyStatusMultiplier(10000, 'transitional')).toBe(15000));
  it('retired → 0.2x', () => expect(applyStatusMultiplier(10000, 'retired')).toBe(2000));
  it('unknown → 1.0x', () => expect(applyStatusMultiplier(10000, 'unknown')).toBe(10000));
});

// ════════════════════════════════════════════════════════
// Catalog Integrity
// ════════════════════════════════════════════════════════

describe('Benchmark Catalog Integrity', () => {
  it('has at least 50 benchmarks', () => {
    expect(TECHNOLOGY_BENCHMARKS.length).toBeGreaterThanOrEqual(50);
  });

  it('all benchmarks have valid cost ranges (low ≤ mid ≤ high)', () => {
    for (const bm of TECHNOLOGY_BENCHMARKS) {
      expect(bm.annualCostRange.low).toBeLessThanOrEqual(bm.annualCostRange.mid);
      expect(bm.annualCostRange.mid).toBeLessThanOrEqual(bm.annualCostRange.high);
    }
  });

  it('all benchmarks have unique IDs', () => {
    const ids = TECHNOLOGY_BENCHMARKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all benchmarks have a source string', () => {
    for (const bm of TECHNOLOGY_BENCHMARKS) {
      expect(bm.source.length).toBeGreaterThan(0);
    }
  });

  it('all benchmark keywords are valid RegExp', () => {
    for (const bm of TECHNOLOGY_BENCHMARKS) {
      expect(bm.keywords).toBeInstanceOf(RegExp);
      expect(() => bm.keywords.test('test')).not.toThrow();
    }
  });

  it('has benchmarks in at least 8 categories', () => {
    const cats = new Set(TECHNOLOGY_BENCHMARKS.map((b) => b.category));
    expect(cats.size).toBeGreaterThanOrEqual(8);
  });
});

describe('Zero-Cost Sets Integrity', () => {
  it('ZERO_COST_ELEMENT_TYPES has at least 20 types', () => {
    expect(ZERO_COST_ELEMENT_TYPES.size).toBeGreaterThanOrEqual(20);
  });

  it('ZERO_COST_NAME_PATTERN matches sticky notes', () => {
    expect(ZERO_COST_NAME_PATTERN.test('Sticky Note')).toBe(true);
    expect(ZERO_COST_NAME_PATTERN.test('Sticky Note3')).toBe(true);
  });

  it('ZERO_COST_NAME_PATTERN does not match real services', () => {
    expect(ZERO_COST_NAME_PATTERN.test('PostgreSQL')).toBe(false);
    expect(ZERO_COST_NAME_PATTERN.test('Slack Notification')).toBe(false);
    expect(ZERO_COST_NAME_PATTERN.test('Payment Service')).toBe(false);
  });
});
