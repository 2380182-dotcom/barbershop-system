import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRatios,
  checkFaceTurn,
  computeJawCornerAngleDegrees,
  checkQuality,
  classifyShape,
} from '../public/scan/classify.js';

// Minimal synthetic 468-point landmark array with only the indices
// classify.js actually reads — everything else is irrelevant to the math.
function buildLandmarks(overrides) {
  const points = Array.from({ length: 468 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, p] of Object.entries(overrides)) points[i] = p;
  return points;
}

test('computeRatios produces the expected ratios and is scale-invariant (camera distance must not change the answer)', () => {
  const landmarks = buildLandmarks({
    10: { x: 0.5, y: 0.1, z: 0 }, // forehead top
    152: { x: 0.5, y: 0.9, z: 0 }, // chin bottom -> length = 0.8
    234: { x: 0.3, y: 0.5, z: 0 }, // cheek left
    454: { x: 0.7, y: 0.5, z: 0 }, // cheek right -> cheekbone width = 0.4
    172: { x: 0.35, y: 0.75, z: 0 }, // jaw left
    397: { x: 0.65, y: 0.75, z: 0 }, // jaw right -> jaw width = 0.3
    54: { x: 0.32, y: 0.2, z: 0 }, // temple left
    284: { x: 0.68, y: 0.2, z: 0 }, // temple right -> forehead width = 0.36
  });
  const ratios = computeRatios(landmarks);
  assert.ok(Math.abs(ratios.L - 2.0) < 0.01);
  assert.ok(Math.abs(ratios.J - 0.75) < 0.01);
  assert.ok(Math.abs(ratios.F - 0.9) < 0.01);

  const scaled = landmarks.map((p) => ({ x: p.x * 2, y: p.y * 2, z: p.z * 2 }));
  const scaledRatios = computeRatios(scaled);
  assert.ok(Math.abs(scaledRatios.L - ratios.L) < 1e-9);
  assert.ok(Math.abs(scaledRatios.J - ratios.J) < 1e-9);
  assert.ok(Math.abs(scaledRatios.F - ratios.F) < 1e-9);
});

test('checkFaceTurn detects a straight-on face vs a turned one from eye-to-nose symmetry', () => {
  const straight = buildLandmarks({
    1: { x: 0.5, y: 0.5, z: 0 },
    33: { x: 0.35, y: 0.45, z: 0 },
    263: { x: 0.65, y: 0.45, z: 0 },
  });
  assert.equal(checkFaceTurn(straight).turned, false);

  const turned = buildLandmarks({
    1: { x: 0.5, y: 0.5, z: 0 },
    33: { x: 0.48, y: 0.45, z: 0 },
    263: { x: 0.75, y: 0.45, z: 0 },
  });
  assert.equal(checkFaceTurn(turned).turned, true);
});

test('checkQuality rejects no-face, multi-face, and dark frames; accepts a good one', () => {
  assert.equal(checkQuality({ faceLandmarksList: [] }).reason, 'no_face');
  assert.equal(checkQuality({ faceLandmarksList: [[], []] }).reason, 'multiple_faces');

  const okLandmarks = buildLandmarks({
    1: { x: 0.5, y: 0.5, z: 0 },
    33: { x: 0.35, y: 0.45, z: 0 },
    263: { x: 0.65, y: 0.45, z: 0 },
  });
  assert.equal(checkQuality({ faceLandmarksList: [okLandmarks], meanBrightness: 10 }).reason, 'too_dark');
  assert.equal(checkQuality({ faceLandmarksList: [okLandmarks], meanBrightness: 100 }).ok, true);
});

test('computeJawCornerAngleDegrees reads a right angle as ~90 and a curved jaw as wider', () => {
  const squareish = buildLandmarks({
    172: { x: 0.5, y: 0.5, z: 0 },
    150: { x: 0.5, y: 0.3, z: 0 },
    136: { x: 0.7, y: 0.5, z: 0 },
  });
  const squareAngle = computeJawCornerAngleDegrees(squareish);
  assert.ok(Math.abs(squareAngle - 90) < 1);

  const roundish = buildLandmarks({
    172: { x: 0.5, y: 0.5, z: 0 },
    150: { x: 0.5, y: 0.2, z: 0 },
    136: { x: 0.76, y: 0.65, z: 0 },
  });
  const roundAngle = computeJawCornerAngleDegrees(roundish);
  assert.ok(roundAngle > squareAngle);
});

test('classifyShape is confident when ratios sit at a range center, with no alternate offered', () => {
  const confident = classifyShape({ L: 1.5, J: 0.8, F: 0.9 }, 95);
  assert.equal(confident.shape, 'oval');
  assert.equal(confident.alternateShape, null);
});

test('classifyShape resolves round vs. square purely from the jaw corner angle when ratios are identical', () => {
  const squareRatios = { L: 1.05, J: 0.95, F: 0.95 };
  assert.equal(classifyShape(squareRatios, 92).shape, 'square');
  assert.equal(classifyShape(squareRatios, 140).shape, 'round');
});

test('classifyShape flags a borderline case as uncertain and offers an alternate instead of guessing', () => {
  const borderline = classifyShape({ L: 1.4, J: 0.75, F: 0.925 }, 95);
  assert.equal(borderline.uncertain, true);
  assert.ok(borderline.alternateShape);
});
