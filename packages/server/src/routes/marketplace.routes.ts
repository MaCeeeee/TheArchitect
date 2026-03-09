import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { Template } from '../models/Template';

const router = Router();

// Public: list/search templates
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, q, sort } = req.query;
    const filter: Record<string, unknown> = {};

    if (category && category !== 'all') filter.category = String(category);
    if (q) filter.$text = { $search: String(q) };

    const sortOrder: Record<string, unknown> = sort === 'rating'
      ? { rating: -1 }
      : sort === 'name'
        ? { name: 1 }
        : { downloads: -1 };

    const templates = await Template.find(filter)
      .sort(sortOrder as Record<string, 1 | -1>)
      .limit(50)
      .select('-elements -connections');

    res.json({ success: true, data: templates });
  } catch (err) {
    console.error('List templates error:', err);
    res.status(500).json({ success: false, error: 'Failed to list templates' });
  }
});

// Get template details
router.get('/:templateId', async (req: Request, res: Response) => {
  try {
    const template = await Template.findById(String(req.params.templateId));
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
    res.json({ success: true, data: template });
  } catch (err) {
    console.error('Get template error:', err);
    res.status(500).json({ success: false, error: 'Failed to get template' });
  }
});

// Auth required from here
router.use(authenticate);

// Create template (publish from project)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, category, industry, framework, elements, connections, price, tags } = req.body;

    if (!name || !category || !elements) {
      return res.status(400).json({ success: false, error: 'name, category, and elements are required' });
    }

    const template = await Template.create({
      name,
      description,
      category,
      industry: industry || 'General',
      framework: framework || 'TOGAF 10',
      elements,
      connections: connections || [],
      authorId: req.user!._id,
      authorName: req.user!.name,
      price: price || 0,
      tags: tags || [],
    });

    res.status(201).json({ success: true, data: template });
  } catch (err) {
    console.error('Create template error:', err);
    res.status(500).json({ success: false, error: 'Failed to create template' });
  }
});

// Deploy template to project (returns elements/connections to import)
router.post('/:templateId/deploy', async (req: Request, res: Response) => {
  try {
    const template = await Template.findById(String(req.params.templateId));
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    // Increment download count
    template.downloads++;
    await template.save();

    res.json({
      success: true,
      data: {
        elements: template.elements,
        connections: template.connections,
        templateName: template.name,
      },
    });
  } catch (err) {
    console.error('Deploy template error:', err);
    res.status(500).json({ success: false, error: 'Failed to deploy template' });
  }
});

// Rate template
router.post('/:templateId/rate', async (req: Request, res: Response) => {
  try {
    const { rating } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be 1-5' });
    }

    const template = await Template.findById(String(req.params.templateId));
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    const newCount = template.ratingCount + 1;
    template.rating = (template.rating * template.ratingCount + rating) / newCount;
    template.ratingCount = newCount;
    await template.save();

    res.json({ success: true, data: { rating: template.rating, ratingCount: template.ratingCount } });
  } catch (err) {
    console.error('Rate template error:', err);
    res.status(500).json({ success: false, error: 'Failed to rate template' });
  }
});

export default router;
