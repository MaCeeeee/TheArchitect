import Redis from 'ioredis';
import { log } from './logger';

let redis: Redis;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
    });
    redis.on('connect', () => log.info('[Redis] Connected'));
    redis.on('error', (err) => log.error({ err }, '[Redis] Error'));
  }
  return redis;
}
