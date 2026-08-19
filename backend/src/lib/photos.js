import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.js';

const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 80;

async function ensureUploadsDir() {
  await fs.mkdir(config.uploadsDir, { recursive: true });
}

/**
 * Resizes to a max 1200px long edge, compresses to JPEG, and writes under
 * a random filename (never derived from customer/visit info, so the path
 * itself gives nothing away even if it ever leaked). Shared by style card
 * photos and face scan photos — both consent-gated, both stored the same
 * way in the same uploads directory.
 */
export async function saveResizedPhoto(buffer) {
  await ensureUploadsDir();
  const filename = `${crypto.randomUUID()}.jpg`;
  const filePath = path.join(config.uploadsDir, filename);
  await sharp(buffer)
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(filePath);
  return filename;
}

export const saveStyleCardPhoto = saveResizedPhoto;
export const saveFaceScanPhoto = saveResizedPhoto;

export function resolvePhotoPath(filename) {
  return path.join(config.uploadsDir, filename);
}
export const resolveStyleCardPhotoPath = resolvePhotoPath;

export async function deletePhotoFile(filename) {
  if (!filename) return;
  try {
    await fs.unlink(resolveStyleCardPhotoPath(filename));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}
