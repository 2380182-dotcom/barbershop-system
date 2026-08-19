// ---------------------------------------------------------------------
// ALL face-scan tuning knobs live here, and only here — see brief section
// 6.2/6.3. Every number below is a starting guess, not a measured value.
// Before this feature runs in front of paying customers: collect 30-50
// real photos with an agreed-by-eye shape, run them through classify.js,
// and adjust these numbers until the classifier agrees. Until that pass
// is done, treat this as a demo, not a product feature.
// ---------------------------------------------------------------------

export const THRESHOLDS = {
  // Quality gate — reject and ask for a retry rather than measure a bad frame.
  maxFaceCount: 1,
  turnedFaceMaxDiffPercent: 15, // |leftEyeToNose - rightEyeToNose| / avg, as a percent
  minBrightness: 40, // mean luma, 0-255
  minLandmarkConfidence: 0.5, // MediaPipe face-detection confidence, 0-1

  // Round vs. square are separated by the jaw corner angle, not the ratios
  // (which are nearly identical for both) — near 90 degrees reads square,
  // more obtuse/curved reads round.
  squareJawCornerMaxDegrees: 100,

  // Expected L (length/cheekbone), J (jaw/cheekbone), F (forehead/cheekbone)
  // ranges per shape. Guesses — see the note above.
  shapeRatios: {
    oval: { L: [1.4, 1.6], J: [0.75, 0.85], F: [0.85, 0.95] },
    round: { L: [1.0, 1.15], J: [0.85, 1.0], F: [0.85, 1.0] },
    square: { L: [1.0, 1.15], J: [0.9, 1.05], F: [0.9, 1.05] },
    oblong: { L: [1.6, 1.85], J: [0.75, 0.9], F: [0.8, 0.95] },
    heart: { L: [1.3, 1.5], J: [0.65, 0.8], F: [0.95, 1.1] },
    diamond: { L: [1.3, 1.5], J: [0.7, 0.85], F: [0.75, 0.9] },
  },

  // If the best and second-best shape's fit scores are within this percent
  // of each other, it's a toss-up — say so and offer both.
  uncertaintyMarginPercent: 15,
};

export const SUGGESTED_STYLES = {
  oval: [
    { sides: '#2 mid fade', top: '40mm, textured' },
    { sides: '#1 low fade', top: '35mm, side part' },
    { sides: 'Scissor only', top: '50mm' },
  ],
  round: [
    { sides: '#3 high fade', top: '35mm, height on top' },
    { sides: '#2 mid fade', top: '40mm, volume up top' },
    { sides: '#4 taper', top: '30mm, side part' },
  ],
  square: [
    { sides: '#2 mid fade', top: '30mm, textured crop' },
    { sides: 'Scissor only', top: '30mm' },
    { sides: '#1 low fade', top: '35mm, slick back' },
  ],
  oblong: [
    { sides: '#1 low fade', top: '25mm fringe, shorter length' },
    { sides: '#2 mid fade', top: '30mm, textured' },
    { sides: 'Scissor only', top: '35mm, side part' },
  ],
  heart: [
    { sides: '#2 mid fade', top: '35mm, textured fringe' },
    { sides: '#3 high fade', top: '25mm, short crop' },
    { sides: '#1 low fade', top: '40mm, side part, volume at jaw level' },
  ],
  diamond: [
    { sides: '#2 mid fade', top: '35mm, textured, fringe' },
    { sides: 'Scissor only', top: '40mm' },
    { sides: '#1 low fade', top: '35mm, side swept' },
  ],
};
