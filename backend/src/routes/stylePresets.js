import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { getPresets } from '../lib/styleCards.js';

const router = Router();

router.use(requireRole('owner', 'barber'));

router.get('/', asyncHandler(async (req, res) => {
  const presets = await getPresets();
  res.json({ presets });
}));

export default router;
