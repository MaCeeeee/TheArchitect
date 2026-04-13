import neo4j, { Driver } from 'neo4j-driver';
import { log } from './logger';

let driver: Driver;

export async function connectNeo4j() {
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'thearchitect_dev';

  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    await driver.verifyConnectivity();
    log.info('[Neo4j] Connected successfully');
  } catch (err) {
    log.error({ err }, '[Neo4j] Connection failed');
    throw err;
  }
}

export function getNeo4jDriver(): Driver {
  if (!driver) throw new Error('Neo4j driver not initialized');
  return driver;
}

export async function runCypher(query: string, params: Record<string, unknown> = {}) {
  const session = driver.session();
  try {
    const result = await session.run(query, params);
    return result.records;
  } finally {
    await session.close();
  }
}

/**
 * Execute multiple Cypher operations atomically in a single write transaction.
 * If any operation fails, the entire batch is rolled back.
 */
export async function runCypherTransaction(
  operations: Array<{ query: string; params: Record<string, unknown> }>,
): Promise<void> {
  const session = driver.session();
  const txc = session.beginTransaction();
  try {
    for (const op of operations) {
      await txc.run(op.query, op.params);
    }
    await txc.commit();
  } catch (err) {
    await txc.rollback();
    throw err;
  } finally {
    await session.close();
  }
}

/**
 * Convert Neo4j Integer/DateTime properties to plain JS values.
 * Neo4j returns integers as {low, high} objects and DateTimes as
 * complex objects — this normalizes them for JSON serialization.
 */
export function serializeNeo4jProperties(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value && typeof value === 'object' && 'low' in value && 'high' in value) {
      // Neo4j Integer
      result[key] = (value as { low: number; high: number }).low;
    } else if (value && typeof value === 'object' && 'year' in value && 'month' in value && 'day' in value) {
      // Neo4j DateTime — convert to ISO string
      const dt = value as { year: { low: number }; month: { low: number }; day: { low: number }; hour: { low: number }; minute: { low: number }; second: { low: number } };
      const d = new Date(Date.UTC(dt.year.low, dt.month.low - 1, dt.day.low, dt.hour.low, dt.minute.low, dt.second.low));
      result[key] = d.toISOString();
    } else {
      result[key] = value;
    }
  }
  return result;
}
