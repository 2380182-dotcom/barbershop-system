// Pure functions operating on MediaPipe Face Mesh landmarks (468 points,
// normalized x/y/z). No DOM, no camera, no network — deliberately testable
// with plain synthetic coordinates. index.html wires this to a live camera;
// nothing about *this* file needs one.
//
// Landmark indices below are MediaPipe Face Mesh's standard topology
// (the same points used across most public face-mesh tutorials). Treat
// them, like the thresholds in thresholds.js, as a first pass — the
// tuning task in brief section 6.3 may turn up a better point for a given
// measurement.
import { THRESHOLDS, SUGGESTED_STYLES } from './thresholds.js';

const LANDMARKS = {
  foreheadTop: 10,
  chinBottom: 152,
  cheekLeft: 234,
  cheekRight: 454,
  jawLeft: 172,
  jawRight: 397,
  templeLeft: 54,
  templeRight: 284,
  noseTip: 1,
  eyeOuterLeft: 33,
  eyeOuterRight: 263,
  jawCornerLeft: 172,
  jawLineUpLeft: 150,
  jawLineDownLeft: 136,
};

function dist3D(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function dist2D(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Ratios, never raw pixel/normalized distances — the whole point is that
 * moving the camera closer or farther must not change the answer, and
 * dividing by the cheekbone width (present in every ratio) cancels out
 * distance-from-camera scaling.
 */
export function computeRatios(landmarks) {
  const faceLength = dist3D(landmarks[LANDMARKS.foreheadTop], landmarks[LANDMARKS.chinBottom]);
  const cheekboneWidth = dist3D(landmarks[LANDMARKS.cheekLeft], landmarks[LANDMARKS.cheekRight]);
  const jawWidth = dist3D(landmarks[LANDMARKS.jawLeft], landmarks[LANDMARKS.jawRight]);
  const foreheadWidth = dist3D(landmarks[LANDMARKS.templeLeft], landmarks[LANDMARKS.templeRight]);

  return {
    L: faceLength / cheekboneWidth,
    J: jawWidth / cheekboneWidth,
    F: foreheadWidth / cheekboneWidth,
  };
}

/** More than ~15% difference between the two eye-to-nose distances means the head is turned, not straight-on. */
export function checkFaceTurn(landmarks, thresholds = THRESHOLDS) {
  const nose = landmarks[LANDMARKS.noseTip];
  const leftDist = dist2D(landmarks[LANDMARKS.eyeOuterLeft], nose);
  const rightDist = dist2D(landmarks[LANDMARKS.eyeOuterRight], nose);
  const avg = (leftDist + rightDist) / 2;
  const diffPercent = avg === 0 ? 0 : (Math.abs(leftDist - rightDist) / avg) * 100;
  return { diffPercent, turned: diffPercent > thresholds.turnedFaceMaxDiffPercent };
}

/** The angle at the jaw corner — near 90° reads square, more open/curved reads round. */
export function computeJawCornerAngleDegrees(landmarks) {
  const corner = landmarks[LANDMARKS.jawCornerLeft];
  const up = landmarks[LANDMARKS.jawLineUpLeft];
  const down = landmarks[LANDMARKS.jawLineDownLeft];
  const v1 = { x: up.x - corner.x, y: up.y - corner.y };
  const v2 = { x: down.x - corner.x, y: down.y - corner.y };
  const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
  const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
  if (mag1 === 0 || mag2 === 0) return null;
  const cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Quality gate, run before any measurement is trusted — brief section
 * 6.1's "no face / two faces / turned / dark" rejects. faceLandmarksList
 * is MediaPipe's per-frame array of detected faces (each a landmark array).
 */
export function checkQuality({ faceLandmarksList, meanBrightness, landmarkConfidence }, thresholds = THRESHOLDS) {
  if (!faceLandmarksList || faceLandmarksList.length === 0) {
    return { ok: false, reason: 'no_face' };
  }
  if (faceLandmarksList.length > thresholds.maxFaceCount) {
    return { ok: false, reason: 'multiple_faces' };
  }
  if (landmarkConfidence !== undefined && landmarkConfidence < thresholds.minLandmarkConfidence) {
    return { ok: false, reason: 'low_confidence' };
  }
  if (meanBrightness !== undefined && meanBrightness < thresholds.minBrightness) {
    return { ok: false, reason: 'too_dark' };
  }
  const turn = checkFaceTurn(faceLandmarksList[0], thresholds);
  if (turn.turned) {
    return { ok: false, reason: 'face_turned', diffPercent: turn.diffPercent };
  }
  return { ok: true };
}

function fitScore(value, [min, max]) {
  const mid = (min + max) / 2;
  const halfRange = (max - min) / 2 || 0.01;
  return Math.abs(value - mid) / halfRange; // 0 = dead centre of the expected range
}

/**
 * Classifies into one of six shapes by nearest-fit on (L, J, F), then
 * resolves a round/square tie with the jaw corner angle. Never a bare
 * verdict: if the top two candidates are close, both come back and the
 * caller is expected to word it as "closest to X" and offer the runner-up.
 */
export function classifyShape(ratios, jawCornerAngleDegrees, thresholds = THRESHOLDS) {
  const scores = Object.fromEntries(
    Object.entries(thresholds.shapeRatios).map(([shape, ranges]) => [
      shape,
      fitScore(ratios.L, ranges.L) + fitScore(ratios.J, ranges.J) + fitScore(ratios.F, ranges.F),
    ])
  );

  const ranked = Object.entries(scores).sort((a, b) => a[1] - b[1]);
  let [bestShape, bestScore] = ranked[0];
  const [secondShape, secondScore] = ranked[1];

  if (
    (bestShape === 'round' || bestShape === 'square') &&
    (secondShape === 'round' || secondShape === 'square') &&
    jawCornerAngleDegrees != null
  ) {
    bestShape = jawCornerAngleDegrees <= thresholds.squareJawCornerMaxDegrees ? 'square' : 'round';
  }

  const denominator = Math.max(secondScore, 0.01);
  const closenessPercent = (Math.abs(secondScore - bestScore) / denominator) * 100;
  const uncertain = closenessPercent < thresholds.uncertaintyMarginPercent;

  return {
    shape: bestShape,
    alternateShape: uncertain ? secondShape : null,
    uncertain,
    scores,
  };
}

export function getSuggestedStyles(shape) {
  return SUGGESTED_STYLES[shape] || [];
}
