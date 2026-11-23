import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '../types/telemetry';

/**
 * Standard 6-point Eye Aspect Ratio (EAR) landmark indices for MediaPipe 478-point FaceMesh.
 * Order: [p1 (outer corner), p2 (upper outer), p3 (upper inner), p4 (inner corner), p5 (lower inner), p6 (lower outer)]
 */
export const RIGHT_EYE_EAR_INDICES = [33, 160, 158, 133, 153, 144] as const;
export const LEFT_EYE_EAR_INDICES = [362, 385, 387, 263, 373, 380] as const;

export const RIGHT_EYE_CONTOUR = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33,
];
export const LEFT_EYE_CONTOUR = [
  362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362,
];

export const MOUTH_INNER_CONTOUR = [
  78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78,
];

export const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
];

export const LEFT_EYEBROW_INDICES = [336, 296, 334, 293, 300, 276, 283, 282, 295, 285];
export const RIGHT_EYEBROW_INDICES = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];

/**
 * Aspect-ratio-corrected 2D Euclidean distance.
 * MediaPipe NormalizedLandmark x is scaled by imageWidth and y by imageHeight, so x must be
 * multiplied by (width / height) to produce true isotropic geometric ratios (EAR & MAR).
 */
function dist2D(a: NormalizedLandmark, b: NormalizedLandmark, aspectRatio = 1): number {
  const dx = (a.x - b.x) * aspectRatio;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Soukupová & Čech (2016) Eye Aspect Ratio:
 * EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)
 */
export function computeEAR(
  landmarks: NormalizedLandmark[],
  indices: readonly [number, number, number, number, number, number],
  aspectRatio = 1
): number {
  if (landmarks.length < 400) return 0;
  const p1 = landmarks[indices[0]];
  const p2 = landmarks[indices[1]];
  const p3 = landmarks[indices[2]];
  const p4 = landmarks[indices[3]];
  const p5 = landmarks[indices[4]];
  const p6 = landmarks[indices[5]];

  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0;

  const safeAspect = Number.isFinite(aspectRatio) && aspectRatio > 0.2 ? aspectRatio : 1;
  const horizontal = dist2D(p1, p4, safeAspect);
  if (horizontal < 1e-5) return 0;

  const verticalA = dist2D(p2, p6, safeAspect);
  const verticalB = dist2D(p3, p5, safeAspect);
  const ear = (verticalA + verticalB) / (2.0 * horizontal);
  return Math.max(0, Math.min(0.6, ear));
}

/**
 * Mouth Aspect Ratio (MAR) for yawn detection using inner lip landmarks.
 * MAR = (||p81 - p178|| + ||p13 - p14|| + ||p311 - p402||) / (3 * ||p78 - p308||)
 */
export function computeMAR(landmarks: NormalizedLandmark[], aspectRatio = 1): number {
  if (landmarks.length < 410) return 0;
  const left = landmarks[78];
  const right = landmarks[308];
  const top1 = landmarks[81];
  const bottom1 = landmarks[178];
  const topMid = landmarks[13];
  const bottomMid = landmarks[14];
  const top2 = landmarks[311];
  const bottom2 = landmarks[402];

  if (!left || !right || !top1 || !bottom1 || !topMid || !bottomMid || !top2 || !bottom2) {
    return 0;
  }

  const safeAspect = Number.isFinite(aspectRatio) && aspectRatio > 0.2 ? aspectRatio : 1;
  const width = dist2D(left, right, safeAspect);
  if (width < 1e-5) return 0;

  const v1 = dist2D(top1, bottom1, safeAspect);
  const v2 = dist2D(topMid, bottomMid, safeAspect);
  const v3 = dist2D(top2, bottom2, safeAspect);
  return Math.max(0, Math.min(1.5, (v1 + v2 + v3) / (3.0 * width)));
}

/**
 * Extracts neural blendshape probabilities (0..1) from MediaPipe FaceLandmarkerResult.
 */
export interface BlendshapeScores {
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
  avgEyeBlink: number;
  jawOpen: number;
}

export function extractBlendshapeScores(
  result: FaceLandmarkerResult | null | undefined
): BlendshapeScores | null {
  const categories = result?.faceBlendshapes?.[0]?.categories;
  if (!categories || categories.length === 0) return null;

  let eyeBlinkLeft = 0;
  let eyeBlinkRight = 0;
  let jawOpen = 0;
  let foundBlink = false;

  for (const cat of categories) {
    if (cat.categoryName === 'eyeBlinkLeft') {
      eyeBlinkLeft = cat.score;
      foundBlink = true;
    } else if (cat.categoryName === 'eyeBlinkRight') {
      eyeBlinkRight = cat.score;
      foundBlink = true;
    } else if (cat.categoryName === 'jawOpen') {
      jawOpen = cat.score;
    }
  }

  if (!foundBlink) return null;

  return {
    eyeBlinkLeft,
    eyeBlinkRight,
    avgEyeBlink: (eyeBlinkLeft + eyeBlinkRight) / 2,
    jawOpen,
  };
}

/**
 * Extracts accurate 3D head pitch (positive = downward nod) and yaw (degrees)
 * from MediaPipe's 4x4 facial transformation matrix, automatically handling
 * row-major or column-major matrix layouts.
 */
export function computeHeadPoseFromMatrix(
  matrixData: ArrayLike<number> | null | undefined
): { pitchDeg: number; yawDeg: number } | null {
  if (!matrixData || matrixData.length < 16) return null;

  // Detect whether translation sits in column 3 (row-major: indices 3,7,11) or row 3 (col-major: 12,13,14)
  const rowMajorTrans = Math.abs(matrixData[11]) + Math.abs(matrixData[3]) + Math.abs(matrixData[7]);
  const colMajorTrans =
    Math.abs(matrixData[14]) + Math.abs(matrixData[12]) + Math.abs(matrixData[13]);
  const isColMajor = colMajorTrans > rowMajorTrans;

  const r02 = isColMajor ? matrixData[8] : matrixData[2];
  const r12 = isColMajor ? matrixData[9] : matrixData[6];
  const r22 = isColMajor ? matrixData[10] : matrixData[10];

  if (!Number.isFinite(r02) || !Number.isFinite(r12) || !Number.isFinite(r22)) {
    return null;
  }

  // Normalize forward vector in case matrix contains uniform scale
  const norm = Math.hypot(r02, r12, r22);
  if (norm < 1e-4) return null;

  const fx = r02 / norm;
  const fy = r12 / norm;
  const fz = r22 / norm;

  // In MediaPipe camera coordinates (+Y up, +Z toward camera), nodding chin down tilts +Z toward -Y (fy < 0)
  const pitchDeg = Math.atan2(-fy, Math.hypot(fx, fz)) * (180 / Math.PI);
  const yawDeg = Math.atan2(fx, Math.abs(fz) < 1e-4 ? 1e-4 : fz) * (180 / Math.PI);

  if (!Number.isFinite(pitchDeg) || !Number.isFinite(yawDeg)) return null;

  return {
    pitchDeg: Number(Math.max(-45, Math.min(45, pitchDeg)).toFixed(1)),
    yawDeg: Number(Math.max(-45, Math.min(45, yawDeg)).toFixed(1)),
  };
}

/**
 * Fallback geometric head pose estimator when 3D transformation matrix is unavailable
 * (e.g., synthetic simulator mode).
 */
export function computeHeadPose(landmarks: NormalizedLandmark[]): { pitchDeg: number; yawDeg: number } {
  if (landmarks.length < 460) return { pitchDeg: 0, yawDeg: 0 };
  const nose = landmarks[1];
  const forehead = landmarks[10];
  const chin = landmarks[152];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];

  if (!nose || !forehead || !chin || !leftCheek || !rightCheek) {
    return { pitchDeg: 0, yawDeg: 0 };
  }

  const faceHeight = Math.max(1e-4, chin.y - forehead.y);
  const noseVerticalRatio = (nose.y - forehead.y) / faceHeight;
  // Neutral nose vertical ratio is ~0.55; nodding down increases ratio toward 0.72+
  const pitchDeg = (noseVerticalRatio - 0.55) * 145;

  const faceWidth = Math.max(1e-4, rightCheek.x - leftCheek.x);
  const midX = (leftCheek.x + rightCheek.x) / 2;
  const yawDeg = ((nose.x - midX) / faceWidth) * 110;

  return {
    pitchDeg: Number(Math.max(-45, Math.min(45, pitchDeg)).toFixed(1)),
    yawDeg: Number(Math.max(-45, Math.min(45, yawDeg)).toFixed(1)),
  };
}

/**
 * Generates an anatomically structured synthetic landmark array (478 indices populated for key facial features)
 * calibrated for 16:9 (960x540) aspect-ratio-corrected computeEAR() and computeMAR().
 */
export function generateSyntheticLandmarks(params: {
  eyeOpenness: number; // 0 = closed, 1 = wide open
  mouthOpenness: number; // 0 = closed, 1 = full yawn
  pitchDeg: number;
  yawDeg: number;
}): NormalizedLandmark[] {
  const { eyeOpenness, mouthOpenness, pitchDeg, yawDeg } = params;
  const pts: NormalizedLandmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));

  const cx = 0.5 + (yawDeg / 120) * 0.12;
  const cy = 0.48 + (pitchDeg / 100) * 0.09;
  const nodSquash = 1 - Math.abs(pitchDeg) * 0.003;

  // Populate face oval (16:9 calibrated proportions)
  const ovalRx = 0.145;
  const ovalRy = 0.285 * nodSquash;
  FACE_OVAL_INDICES.forEach((idx, i) => {
    const angle = (i / (FACE_OVAL_INDICES.length - 1)) * Math.PI * 2 - Math.PI / 2;
    pts[idx] = {
      x: cx + Math.cos(angle) * ovalRx,
      y: cy + Math.sin(angle) * ovalRy,
      z: Math.cos(angle) * -0.02,
    };
  });

  // Explicit pose reference anchors
  pts[10] = { x: cx, y: cy - ovalRy, z: 0 };
  pts[152] = { x: cx, y: cy + ovalRy, z: 0 };
  pts[234] = { x: cx - ovalRx, y: cy + 0.01, z: 0.03 };
  pts[454] = { x: cx + ovalRx, y: cy + 0.01, z: 0.03 };
  pts[1] = {
    x: cx + (yawDeg / 110) * ovalRx * 1.1,
    y: cy - ovalRy + (0.55 + pitchDeg / 145) * (ovalRy * 2),
    z: -0.05,
  };

  // Eye geometry builder calibrated for 16:9 isotropic EAR:
  // At eyeOpenness=0.95 -> EAR ~0.32; at eyeOpenness=0.1 -> EAR ~0.09
  const buildEye = (
    centerX: number,
    centerY: number,
    indices: readonly [number, number, number, number, number, number],
    contour: number[]
  ) => {
    const halfW = 0.036;
    const halfH = 0.003 + eyeOpenness * 0.019;
    const [p1, p2, p3, p4, p5, p6] = indices;

    pts[p1] = { x: centerX - halfW, y: centerY, z: 0 };
    pts[p4] = { x: centerX + halfW, y: centerY, z: 0 };
    pts[p2] = { x: centerX - halfW * 0.36, y: centerY - halfH, z: 0 };
    pts[p3] = { x: centerX + halfW * 0.36, y: centerY - halfH, z: 0 };
    pts[p6] = { x: centerX - halfW * 0.36, y: centerY + halfH, z: 0 };
    pts[p5] = { x: centerX + halfW * 0.36, y: centerY + halfH, z: 0 };

    contour.forEach((idx, i) => {
      if (indices.includes(idx)) return;
      const t = (i / (contour.length - 1)) * Math.PI * 2;
      pts[idx] = {
        x: centerX - Math.cos(t) * halfW,
        y: centerY - Math.sin(t) * halfH * 1.05,
        z: 0,
      };
    });
  };

  const eyeY = cy - 0.055 * nodSquash;
  buildEye(cx - 0.058, eyeY, RIGHT_EYE_EAR_INDICES, RIGHT_EYE_CONTOUR);
  buildEye(cx + 0.058, eyeY, LEFT_EYE_EAR_INDICES, LEFT_EYE_CONTOUR);

  // Eyebrows
  RIGHT_EYEBROW_INDICES.forEach((idx, i) => {
    const t = i / (RIGHT_EYEBROW_INDICES.length - 1);
    pts[idx] = {
      x: cx - 0.098 + t * 0.072,
      y: eyeY - 0.042 - Math.sin(t * Math.PI) * 0.012,
      z: 0,
    };
  });
  LEFT_EYEBROW_INDICES.forEach((idx, i) => {
    const t = i / (LEFT_EYEBROW_INDICES.length - 1);
    pts[idx] = {
      x: cx + 0.026 + t * 0.072,
      y: eyeY - 0.042 - Math.sin(t * Math.PI) * 0.012,
      z: 0,
    };
  });

  // Mouth MAR geometry calibrated for 16:9 isotropic MAR: ~0.09 (closed) to ~0.82 (wide yawn)
  const mouthY = cy + 0.13 * nodSquash;
  const mouthHalfW = 0.044 - mouthOpenness * 0.006;
  const mouthHalfH = 0.005 + mouthOpenness * 0.054;

  pts[78] = { x: cx - mouthHalfW, y: mouthY, z: 0 };
  pts[308] = { x: cx + mouthHalfW, y: mouthY, z: 0 };
  pts[81] = { x: cx - mouthHalfW * 0.45, y: mouthY - mouthHalfH * 0.9, z: 0 };
  pts[178] = { x: cx - mouthHalfW * 0.45, y: mouthY + mouthHalfH * 0.9, z: 0 };
  pts[13] = { x: cx, y: mouthY - mouthHalfH, z: 0 };
  pts[14] = { x: cx, y: mouthY + mouthHalfH, z: 0 };
  pts[311] = { x: cx + mouthHalfW * 0.45, y: mouthY - mouthHalfH * 0.9, z: 0 };
  pts[402] = { x: cx + mouthHalfW * 0.45, y: mouthY + mouthHalfH * 0.9, z: 0 };

  MOUTH_INNER_CONTOUR.forEach((idx, i) => {
    if ([78, 308, 81, 178, 13, 14, 311, 402].includes(idx)) return;
    const t = (i / (MOUTH_INNER_CONTOUR.length - 1)) * Math.PI * 2;
    pts[idx] = {
      x: cx - Math.cos(t) * mouthHalfW,
      y: mouthY - Math.sin(t) * mouthHalfH,
      z: 0,
    };
  });

  return pts;
}
