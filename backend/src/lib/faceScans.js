import { pool } from '../db/pool.js';
import { findOrCreateCustomerByPhone } from './customers.js';
import { saveFaceScanPhoto } from './photos.js';

/**
 * Face scan station is a shop device, not a customer's own phone — but it's
 * still unauthenticated (no login concept exists for customers), so this
 * stays intentionally minimal: an optional phone links the scan to a
 * customer record (and can flip on their photo consent for future style
 * card photos too), but a scan works fine with no phone at all, purely as
 * anonymous tuning data. Ratios are always logged regardless of consent —
 * they're just numbers, not a photo.
 *
 * The photo (if any) is saved in this same call, not a separate step —
 * unlike a style card, a face scan's photo is captured at the exact moment
 * of measurement, so there's no later "does consent still hold" gap to
 * re-check; consentPhotos gates it once, here.
 */
export async function saveFaceScan({ phone, detectedShape, correctedShape, ratios, suggestedStyles, consentPhotos, photoBuffer }) {
  let customerId = null;
  // For a linked customer, the authoritative consent is the persisted
  // customers.consent_photos value (re-read after any update below), not
  // the request's own claim — the same "check stored state, don't trust
  // the caller" rule the style card photo upload already follows. Only an
  // anonymous scan (no phone, nothing to persist against) falls back to
  // trusting this request's flag.
  let effectiveConsent = consentPhotos;

  if (phone) {
    const customer = await findOrCreateCustomerByPhone(phone, null);
    customerId = customer.id;
    if (consentPhotos && !customer.consent_photos) {
      await pool.query(`update customers set consent_photos = true, updated_at = now() where id = $1`, [customerId]);
    }
    const { rows: freshRows } = await pool.query(`select consent_photos from customers where id = $1`, [customerId]);
    effectiveConsent = freshRows[0]?.consent_photos ?? false;
  }

  let photoPath = null;
  if (effectiveConsent && photoBuffer) {
    photoPath = await saveFaceScanPhoto(photoBuffer);
  }

  const { rows } = await pool.query(
    `insert into face_scans (customer_id, detected_shape, corrected_shape, photo_path, ratios, suggested_styles)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [
      customerId,
      detectedShape,
      correctedShape || null,
      photoPath,
      ratios ? JSON.stringify(ratios) : null,
      suggestedStyles ? JSON.stringify(suggestedStyles) : null,
    ]
  );
  return rows[0];
}

export async function getFaceScanPhotoPath(id) {
  const { rows } = await pool.query(`select photo_path from face_scans where id = $1`, [id]);
  return rows[0]?.photo_path ?? null;
}
