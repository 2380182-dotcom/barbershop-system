import { Router } from 'express';
import multer from 'multer';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { logAudit } from '../lib/audit.js';
import {
  saveStyleCard,
  getStyleCardWithCustomer,
  attachPhoto,
  StyleCardNotFoundError,
} from '../lib/styleCards.js';
import { saveStyleCardPhoto, resolveStyleCardPhotoPath, deletePhotoFile } from '../lib/photos.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.use(requireRole('owner', 'barber'));

router.post('/', asyncHandler(async (req, res) => {
  const { visit_id: visitId, sides, top, beard, notes, grow_out_days: growOutDays } = req.body || {};
  if (!visitId) {
    return res.status(400).json({ error: 'visit_id is required' });
  }

  let card;
  try {
    card = await saveStyleCard({ visitId, sides, top, beard, notes, growOutDays });
  } catch (err) {
    if (err instanceof StyleCardNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    throw err;
  }

  await logAudit({
    userId: req.session.user.id,
    action: 'save',
    entity: 'style_card',
    entityId: card.id,
    detail: { visitId },
  });

  res.status(201).json({ styleCard: card });
}));

router.post('/:id/photo', upload.single('photo'), asyncHandler(async (req, res) => {
  const card = await getStyleCardWithCustomer(req.params.id);
  if (!card) {
    return res.status(404).json({ error: 'Style card not found' });
  }
  // Enforced here regardless of what the UI shows — never trust the client
  // to have hidden the camera button for a customer who didn't consent.
  if (!card.consent_photos) {
    return res.status(403).json({ error: 'Customer has not consented to photos' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'photo file is required' });
  }

  const oldPhotoPath = card.photo_path;
  const filename = await saveStyleCardPhoto(req.file.buffer);
  const updated = await attachPhoto(card.id, filename);
  if (oldPhotoPath) {
    await deletePhotoFile(oldPhotoPath);
  }

  await logAudit({
    userId: req.session.user.id,
    action: 'upload_photo',
    entity: 'style_card',
    entityId: card.id,
  });

  res.status(201).json({ styleCard: updated });
}));

router.get('/:id/photo', asyncHandler(async (req, res) => {
  const card = await getStyleCardWithCustomer(req.params.id);
  if (!card || !card.photo_path) {
    return res.status(404).json({ error: 'No photo for this style card' });
  }
  res.sendFile(resolveStyleCardPhotoPath(card.photo_path));
}));

export default router;
