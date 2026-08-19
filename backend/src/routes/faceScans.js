import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { pool } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { saveFaceScan, getFaceScanPhotoPath } from '../lib/faceScans.js';
import { resolvePhotoPath } from '../lib/photos.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// The scan station is a shop device but, like the queue/booking pages, has
// no login concept for customers — still rate-limited per IP against abuse.
const scanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many scans from this device. Please wait a while.' },
});

// Public: runs at the in-shop scan station, not behind a login. Never sits
// between a customer and joining the queue (nothing here touches the
// queue at all). phone is optional; consent_photos gates the photo, and is
// re-checked against the persisted customer record, not just this request.
router.post('/', scanLimiter, upload.single('photo'), asyncHandler(async (req, res) => {
  const { phone, detectedShape, correctedShape, ratios, suggestedStyles, consentPhotos } = req.body || {};
  if (!detectedShape) {
    return res.status(400).json({ error: 'detectedShape is required' });
  }

  const scan = await saveFaceScan({
    phone: phone || null,
    detectedShape,
    correctedShape: correctedShape || null,
    ratios: ratios ? JSON.parse(ratios) : null,
    suggestedStyles: suggestedStyles ? JSON.parse(suggestedStyles) : null,
    consentPhotos: consentPhotos === 'true' || consentPhotos === true,
    photoBuffer: req.file?.buffer,
  });

  res.status(201).json({
    id: scan.id,
    detectedShape: scan.detected_shape,
    correctedShape: scan.corrected_shape,
    photoSaved: Boolean(scan.photo_path),
  });
}));

// Behind the login, like style card photos — never a guessable public path.
router.get('/:id/photo', requireRole('owner', 'barber'), asyncHandler(async (req, res) => {
  const photoPath = await getFaceScanPhotoPath(req.params.id);
  if (!photoPath) {
    return res.status(404).json({ error: 'No photo for this scan' });
  }
  res.sendFile(resolvePhotoPath(photoPath));
}));

router.get('/', requireRole('owner', 'barber'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `select id, customer_id, detected_shape, corrected_shape, ratios, suggested_styles, photo_path, created_at
     from face_scans order by created_at desc limit 100`
  );
  res.json({ scans: rows });
}));

export default router;
