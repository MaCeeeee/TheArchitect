import { Router, Request, Response } from 'express';

const router = Router();

const NOCODB_URL = process.env.NOCODB_URL || '';
const NOCODB_TOKEN = process.env.NOCODB_API_TOKEN || '';
const TABLE_ID = process.env.NOCODB_TABLE_ID || '';

// POST /api/waitlist — public, no auth required
router.post('/', async (req: Request, res: Response) => {
  try {
    if (!NOCODB_URL || !NOCODB_TOKEN || !TABLE_ID) {
      return res.status(503).json({ success: false, error: 'Waitlist not configured' });
    }

    const { email, name, company, referrer } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Valid email required' });
    }

    // Duplicate check
    const checkRes = await fetch(
      `${NOCODB_URL}/api/v2/tables/${TABLE_ID}/records?where=(email,eq,${encodeURIComponent(email)})`,
      { headers: { 'xc-token': NOCODB_TOKEN } },
    );
    const existing = await checkRes.json();

    if (existing.list?.length > 0) {
      return res.json({ success: true, message: 'You are already on the waitlist!' });
    }

    // Create entry
    const createRes = await fetch(
      `${NOCODB_URL}/api/v2/tables/${TABLE_ID}/records`,
      {
        method: 'POST',
        headers: {
          'xc-token': NOCODB_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          name: name || null,
          company: company || null,
          referrer: referrer || null,
          status: 'pending',
        }),
      },
    );

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error('[Waitlist] NocoDB error:', err);
      return res.status(502).json({ success: false, error: 'Failed to register' });
    }

    res.status(201).json({ success: true, message: 'Welcome to the waitlist!' });
  } catch (err) {
    console.error('[Waitlist] Error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
