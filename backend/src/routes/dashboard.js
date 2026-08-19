import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { getDashboard } from '../lib/dashboard.js';

const router = Router();

router.use(requireRole('owner'));

router.get('/', asyncHandler(async (req, res) => {
  const dashboard = await getDashboard(req.query.date);
  res.json(dashboard);
}));

export default router;
