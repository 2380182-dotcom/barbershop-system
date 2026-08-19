import { Router } from 'express';
import { getDisplayView } from '../lib/queue.js';
import { getCurrentQrToken, buildJoinUrl } from '../lib/qrTokens.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

// Public: no auth. Must never expose customer names or phone numbers.
router.get('/', asyncHandler(async (req, res) => {
  const [view, qrToken] = await Promise.all([getDisplayView(), getCurrentQrToken()]);
  res.json({ ...view, qrToken: qrToken.token, joinUrl: buildJoinUrl(qrToken.token) });
}));

export default router;
