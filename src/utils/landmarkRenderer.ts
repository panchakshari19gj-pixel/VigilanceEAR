import type { DrowsinessState, NormalizedLandmark } from '../types/telemetry';
import {
  FACE_OVAL_INDICES,
  LEFT_EYEBROW_INDICES,
  LEFT_EYE_CONTOUR,
  LEFT_EYE_EAR_INDICES,
  MOUTH_INNER_CONTOUR,
  RIGHT_EYEBROW_INDICES,
  RIGHT_EYE_CONTOUR,
  RIGHT_EYE_EAR_INDICES,
} from './earMath';

export interface RenderLandmarkOptions {
  width: number;
  height: number;
  landmarks: NormalizedLandmark[];
  state: DrowsinessState;
  showMesh: boolean;
  showEyeVectors: boolean;
  showGrid: boolean;
  mirrorX: boolean;
  isSimulator?: boolean;
  clearCanvas?: boolean;
  leftEar: number;
  rightEar: number;
  mar: number;
}

function mapPt(pt: NormalizedLandmark, width: number, height: number, mirrorX: boolean) {
  return {
    x: (mirrorX ? 1 - pt.x : pt.x) * width,
    y: pt.y * height,
  };
}

function strokePolyline(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  indices: number[],
  width: number,
  height: number,
  mirrorX: boolean,
  strokeStyle: string,
  lineWidth = 1.25
) {
  if (indices.length < 2) return;
  ctx.beginPath();
  let started = false;
  for (const idx of indices) {
    const pt = landmarks[idx];
    if (!pt) continue;
    const p = mapPt(pt, width, height, mirrorX);
    if (!started) {
      ctx.moveTo(p.x, p.y);
      started = true;
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

export function renderLandmarkOverlay(
  ctx: CanvasRenderingContext2D,
  opts: RenderLandmarkOptions
): void {
  const {
    width,
    height,
    landmarks,
    state,
    showMesh,
    showEyeVectors,
    showGrid,
    mirrorX,
    isSimulator,
    clearCanvas = true,
    leftEar,
    rightEar,
    mar,
  } = opts;

  if (clearCanvas) {
    ctx.clearRect(0, 0, width, height);
  }

  if (isSimulator) {
    // Deep obsidian crystal optical background matching the dark black liquid water glass UI
    const bgGrad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.45,
      20,
      width * 0.5,
      height * 0.5,
      width * 0.65
    );
    bgGrad.addColorStop(0, '#16171B');
    bgGrad.addColorStop(0.55, '#09090C');
    bgGrad.addColorStop(1, '#020203');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
  }

  // Optional optical calibration reticle grid
  if (showGrid) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    const step = 64;
    for (let x = step; x < width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = step; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    // Center reticle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.beginPath();
    ctx.moveTo(width / 2 - 14, height / 2);
    ctx.lineTo(width / 2 + 14, height / 2);
    ctx.moveTo(width / 2, height / 2 - 14);
    ctx.lineTo(width / 2, height / 2 + 14);
    ctx.stroke();
    ctx.restore();
  }

  if (!landmarks || landmarks.length < 468) return;

  const accentColor =
    state === 'critical'
      ? '#EF4444'
      : state === 'warning'
        ? '#F59E0B'
        : '#F4F4F5';

  const subtleColor =
    state === 'critical'
      ? 'rgba(239, 68, 68, 0.48)'
      : state === 'warning'
        ? 'rgba(245, 158, 11, 0.45)'
        : 'rgba(255, 255, 255, 0.34)';

  // Face bounding brackets
  const ovalPts = FACE_OVAL_INDICES.map((i) => landmarks[i])
    .filter((pt): pt is NormalizedLandmark => Boolean(pt))
    .map((pt) => mapPt(pt, width, height, mirrorX));
  if (ovalPts.length < 4) return;

  const xs = ovalPts.map((p) => p.x);
  const ys = ovalPts.map((p) => p.y);
  const minX = Math.min(...xs) - 18;
  const maxX = Math.max(...xs) + 18;
  const minY = Math.min(...ys) - 18;
  const maxY = Math.max(...ys) + 18;
  const bracketLen = 18;

  ctx.save();
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(minX, minY + bracketLen);
  ctx.lineTo(minX, minY);
  ctx.lineTo(minX + bracketLen, minY);
  ctx.moveTo(maxX - bracketLen, minY);
  ctx.lineTo(maxX, minY);
  ctx.lineTo(maxX, minY + bracketLen);
  ctx.moveTo(minX, maxY - bracketLen);
  ctx.lineTo(minX, maxY);
  ctx.lineTo(minX + bracketLen, maxY);
  ctx.moveTo(maxX - bracketLen, maxY);
  ctx.lineTo(maxX, maxY);
  ctx.lineTo(maxX, maxY - bracketLen);
  ctx.stroke();

  if (showMesh) {
    strokePolyline(ctx, landmarks, FACE_OVAL_INDICES, width, height, mirrorX, subtleColor, 1.2);
    strokePolyline(ctx, landmarks, LEFT_EYEBROW_INDICES, width, height, mirrorX, subtleColor, 1.3);
    strokePolyline(ctx, landmarks, RIGHT_EYEBROW_INDICES, width, height, mirrorX, subtleColor, 1.3);
    strokePolyline(
      ctx,
      landmarks,
      MOUTH_INNER_CONTOUR,
      width,
      height,
      mirrorX,
      'rgba(228, 228, 231, 0.72)',
      1.3
    );

    if (!isSimulator) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
      for (let i = 0; i < landmarks.length; i += 3) {
        const pt = landmarks[i];
        if (!pt) continue;
        const p = mapPt(pt, width, height, mirrorX);
        ctx.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6);
      }
    } else if (landmarks[1] && landmarks[10]) {
      const nose = mapPt(landmarks[1], width, height, mirrorX);
      const top = mapPt(landmarks[10], width, height, mirrorX);
      ctx.beginPath();
      ctx.moveTo(top.x, top.y + (nose.y - top.y) * 0.48);
      ctx.lineTo(nose.x, nose.y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  // Eye contours
  strokePolyline(ctx, landmarks, RIGHT_EYE_CONTOUR, width, height, mirrorX, accentColor, 1.9);
  strokePolyline(ctx, landmarks, LEFT_EYE_CONTOUR, width, height, mirrorX, accentColor, 1.9);

  if (showEyeVectors) {
    const drawEyeChords = (
      indices: readonly [number, number, number, number, number, number],
      earVal: number,
      label: string
    ) => {
      const rawPts = indices.map((idx) => landmarks[idx]);
      if (rawPts.some((pt) => !pt)) return;
      const pts = rawPts.map((pt) => mapPt(pt, width, height, mirrorX));
      const [p1, p2, p3, p4, p5, p6] = pts;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.62)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p6.x, p6.y);
      ctx.moveTo(p3.x, p3.y);
      ctx.lineTo(p5.x, p5.y);
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.3, 0, Math.PI * 2);
        ctx.fill();
      });

      const labelX = Math.min(p1.x, p4.x);
      const labelY = Math.min(p2.y, p3.y) - 10;
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillStyle = accentColor;
      ctx.fillText(`${label} ${earVal.toFixed(3)}`, labelX, Math.max(14, labelY));
    };

    drawEyeChords(RIGHT_EYE_EAR_INDICES, rightEar, 'R-EAR');
    drawEyeChords(LEFT_EYE_EAR_INDICES, leftEar, 'L-EAR');

    if (landmarks[78] && landmarks[14]) {
      const mouthLeft = mapPt(landmarks[78], width, height, mirrorX);
      const mouthBottom = mapPt(landmarks[14], width, height, mirrorX);
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillStyle = mar > 0.6 ? '#F59E0B' : 'rgba(244, 244, 245, 0.88)';
      ctx.fillText(`MAR ${mar.toFixed(2)}`, mouthLeft.x, mouthBottom.y + 18);
    }
  }

  ctx.restore();
}
