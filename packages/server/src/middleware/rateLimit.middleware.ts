import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  count: number;
  resetTime: number;
}

const stores = new Map<string, Map<string, RateLimitStore>>();
const intervals = new Map<string, ReturnType<typeof setInterval>>();

export function rateLimit(options: { windowMs?: number; max?: number; name?: string } = {}) {
  const { windowMs = 60_000, max = 100, name = 'default' } = options;

  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  const store = stores.get(name)!;

  // One cleanup interval per named store (not per middleware call)
  if (!intervals.has(name)) {
    const handle = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of store) {
        if (now > entry.resetTime) {
          store.delete(key);
        }
      }
    }, windowMs);
    // Allow process to exit cleanly without waiting for this interval
    if (handle.unref) handle.unref();
    intervals.set(name, handle);
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));

    if (entry.count > max) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
    }

    next();
  };
}
