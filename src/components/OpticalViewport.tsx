import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  Download,
  Eye,
  Grid,
  Layers,
  Radio,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { DRIVER_SAMPLE_FRAMES } from '../constants/samples';
import { faceLandmarkerService, type LandmarkerStatus } from '../services/faceLandmarkerService';
import type {
  CalibrationConfig,
  DrowsinessState,
  InputSourceMode,
  NormalizedLandmark,
  SimulatorScenario,
  TelemetryFrame,
} from '../types/telemetry';
import {
  computeEAR,
  computeHeadPose,
  computeHeadPoseFromMatrix,
  computeMAR,
  extractBlendshapeScores,
  generateSyntheticLandmarks,
  LEFT_EYE_EAR_INDICES,
  RIGHT_EYE_EAR_INDICES,
  type BlendshapeScores,
} from '../utils/earMath';
import { renderLandmarkOverlay } from '../utils/landmarkRenderer';

interface OpticalViewportProps {
  sourceMode: InputSourceMode;
  onSourceModeChange: (mode: InputSourceMode) => void;
  activeSampleId: string;
  uploadedMedia: { url: string; kind: 'image' | 'video' } | null;
  simulatorScenario: SimulatorScenario;
  manualSim: { eyeOpenness: number; mouthOpenness: number; pitchDeg: number };
  calibration: CalibrationConfig;
  telemetry: TelemetryFrame;
  onTelemetrySample: (frame: TelemetryFrame) => void;
  onAutoCalibrate?: (baselineEar: number, recommendedThreshold: number) => void;
}

interface VideoFrameMetadataLike {
  presentedFrames?: number;
  mediaTime?: number;
}

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, metadata: VideoFrameMetadataLike) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

interface EvaluateOptions {
  aspectRatio: number;
  blendshapes?: BlendshapeScores | null;
  matrixData?: ArrayLike<number> | null;
  enableSmoothing?: boolean;
  forceCommit?: boolean;
}

export function OpticalViewport({
  sourceMode,
  onSourceModeChange,
  activeSampleId,
  uploadedMedia,
  simulatorScenario,
  manualSim,
  calibration,
  telemetry,
  onTelemetrySample,
  onAutoCalibrate,
}: OpticalViewportProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticImgRef = useRef<HTMLImageElement | null>(null);
  const videoLandmarkerRef = useRef<FaceLandmarker | null>(
    faceLandmarkerService.getCachedVideoLandmarker()
  );

  const [showMesh, setShowMesh] = useState(true);
  const [showEyeVectors, setShowEyeVectors] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [landmarkerStatus, setLandmarkerStatus] = useState<LandmarkerStatus>(
    faceLandmarkerService.getCachedVideoLandmarker() ? 'ready' : 'idle'
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [videoResolution, setVideoResolution] = useState<{ w: number; h: number } | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraRetryNonce, setCameraRetryNonce] = useState(0);
  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number } | null>(null);

  // Quick 3-second inline webcam auto-calibration state
  const [autoCalibrating, setAutoCalibrating] = useState(false);
  const [autoCalProgress, setAutoCalProgress] = useState(0);
  const [autoCalMessage, setAutoCalMessage] = useState<string | null>(null);
  const autoCalSamplesRef = useRef<number[]>([]);
  const latestSignalRef = useRef<{ faceDetected: boolean; avgEar: number; avgBlink: number }>({
    faceDetected: false,
    avgEar: 0,
    avgBlink: 0,
  });

  const trackerRef = useRef({
    eyeClosedStartMs: null as number | null,
    eyeOpenGraceStartMs: null as number | null,
    yawnStartMs: null as number | null,
    nodStartMs: null as number | null,
    wasEyeClosed: false,
    totalBlinks: 0,
    blinkTimestamps: [] as number[],
    perclosSamples: [] as { t: number; closed: boolean }[],
    lastVideoTime: -1,
    lastPresentedFrames: -1,
    lastFrameMs: performance.now(),
    fpsSmoothed: 30,
    lastReactCommitMs: 0,
    lastCommittedState: 'no_face' as DrowsinessState,
    // EMA smoothed signal state
    hasSmoothInit: false,
    smoothLeftEar: 0.3,
    smoothRightEar: 0.3,
    smoothMar: 0.1,
    smoothPitch: 0,
    smoothYaw: 0,
    smoothBlink: 0,
    smoothJawOpen: 0,
  });

  const resetTrackerState = (resetBlinks = false) => {
    const tr = trackerRef.current;
    tr.eyeClosedStartMs = null;
    tr.eyeOpenGraceStartMs = null;
    tr.yawnStartMs = null;
    tr.nodStartMs = null;
    tr.wasEyeClosed = false;
    tr.perclosSamples = [];
    tr.lastVideoTime = -1;
    tr.lastPresentedFrames = -1;
    tr.lastReactCommitMs = 0;
    tr.hasSmoothInit = false;
    tr.smoothBlink = 0;
    tr.smoothJawOpen = 0;
    if (resetBlinks) {
      tr.totalBlinks = 0;
      tr.blinkTimestamps = [];
    }
  };

  const latestRef = useRef({
    calibration,
    simulatorScenario,
    manualSim,
    showMesh,
    showEyeVectors,
    showGrid,
    onTelemetrySample,
    onAutoCalibrate,
  });
  latestRef.current = {
    calibration,
    simulatorScenario,
    manualSim,
    showMesh,
    showEyeVectors,
    showGrid,
    onTelemetrySample,
    onAutoCalibrate,
  };

  const staticAnalysisRef = useRef<{
    landmarks: NormalizedLandmark[];
    aspectRatio: number;
    blendshapes: BlendshapeScores | null;
    matrixData: ArrayLike<number> | null;
    imageLoaded: boolean;
  }>({
    landmarks: [],
    aspectRatio: 16 / 9,
    blendshapes: null,
    matrixData: null,
    imageLoaded: false,
  });

  // 3-second inline webcam eye-baseline auto-calibration timer
  useEffect(() => {
    if (!autoCalibrating) return;
    autoCalSamplesRef.current = [];
    setAutoCalProgress(0);
    setAutoCalMessage(null);

    const start = Date.now();
    const durationMs = 3000;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - start;
      setAutoCalProgress(Math.min(100, (elapsed / durationMs) * 100));

      const sig = latestSignalRef.current;
      // Only sample genuine open-eye frames (exclude blinks)
      if (sig.faceDetected && sig.avgEar > 0.14 && sig.avgBlink < 0.38) {
        autoCalSamplesRef.current.push(sig.avgEar);
      }

      if (elapsed >= durationMs) {
        window.clearInterval(timer);
        setAutoCalibrating(false);
        const samples = autoCalSamplesRef.current;
        if (samples.length >= 5) {
          // Trim bottom/top 15% outliers for rock-solid open-eye baseline
          const sorted = [...samples].sort((a, b) => a - b);
          const trim = Math.floor(sorted.length * 0.15);
          const trimmed = sorted.slice(trim, Math.max(trim + 1, sorted.length - trim));
          const mean = trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length;
          const recommended = Math.max(0.15, Math.min(0.28, Number((mean * 0.72).toFixed(2))));
          latestRef.current.onAutoCalibrate?.(Number(mean.toFixed(3)), recommended);
          setAutoCalMessage(`Calibrated · Open ${mean.toFixed(2)} → Threshold ${recommended.toFixed(2)}`);
          window.setTimeout(() => setAutoCalMessage(null), 4500);
        } else {
          setAutoCalMessage('Look steadily at camera with eyes open to calibrate');
          window.setTimeout(() => setAutoCalMessage(null), 3500);
        }
      }
    }, 80);

    return () => window.clearInterval(timer);
  }, [autoCalibrating]);

  // Synchronous evaluation with aspect-ratio correction, neural blendshape fusion, EMA smoothing, and hysteresis
  const evaluateLandmarks = (
    landmarks: NormalizedLandmark[],
    fps: number,
    options: EvaluateOptions
  ) => {
    const now = Date.now();
    const { calibration: cal } = latestRef.current;
    const tr = trackerRef.current;
    const {
      aspectRatio,
      blendshapes = null,
      matrixData = null,
      enableSmoothing = true,
      forceCommit = false,
    } = options;

    const commitIfNeeded = (frame: TelemetryFrame) => {
      const stateChanged = frame.state !== tr.lastCommittedState;
      if (forceCommit || stateChanged || now - tr.lastReactCommitMs >= 95) {
        tr.lastReactCommitMs = now;
        tr.lastCommittedState = frame.state;
        latestRef.current.onTelemetrySample(frame);
      }
    };

    if (!landmarks || landmarks.length < 400) {
      // Clear active closure timers if face lock is lost so stale microsleep timers never persist
      tr.eyeClosedStartMs = null;
      tr.eyeOpenGraceStartMs = null;
      tr.yawnStartMs = null;
      tr.nodStartMs = null;
      tr.wasEyeClosed = false;
      tr.hasSmoothInit = false;
      latestSignalRef.current = { faceDetected: false, avgEar: 0, avgBlink: 0 };

      const frame: TelemetryFrame = {
        faceDetected: false,
        leftEar: 0,
        rightEar: 0,
        avgEar: 0,
        mar: 0,
        headPitch: 0,
        headYaw: 0,
        perclos: 0,
        blinkRatePerMin: tr.blinkTimestamps.filter((t) => now - t <= 60_000).length,
        totalBlinks: tr.totalBlinks,
        eyeClosedDurationMs: 0,
        yawnDurationMs: 0,
        nodDurationMs: 0,
        state: 'no_face',
        stateReason: 'Position face in frame to lock landmarks',
        landmarks: [],
        fps,
      };
      commitIfNeeded(frame);
      return frame;
    }

    const rawLeftEar = computeEAR(landmarks, LEFT_EYE_EAR_INDICES, aspectRatio);
    const rawRightEar = computeEAR(landmarks, RIGHT_EYE_EAR_INDICES, aspectRatio);
    const rawMar = computeMAR(landmarks, aspectRatio);
    const rawPose = computeHeadPoseFromMatrix(matrixData) ?? computeHeadPose(landmarks);
    const rawBlink = blendshapes?.avgEyeBlink ?? 0;
    const rawJawOpen = blendshapes?.jawOpen ?? 0;

    let leftEar = rawLeftEar;
    let rightEar = rawRightEar;
    let mar = rawMar;
    let pitchDeg = rawPose.pitchDeg;
    let yawDeg = rawPose.yawDeg;
    let avgBlink = rawBlink;
    let jawOpen = rawJawOpen;

    if (enableSmoothing) {
      if (!tr.hasSmoothInit) {
        tr.smoothLeftEar = rawLeftEar;
        tr.smoothRightEar = rawRightEar;
        tr.smoothMar = rawMar;
        tr.smoothPitch = rawPose.pitchDeg;
        tr.smoothYaw = rawPose.yawDeg;
        tr.smoothBlink = rawBlink;
        tr.smoothJawOpen = rawJawOpen;
        tr.hasSmoothInit = true;
      } else {
        const earAlpha = 0.48;
        const poseAlpha = 0.35;
        tr.smoothLeftEar += (rawLeftEar - tr.smoothLeftEar) * earAlpha;
        tr.smoothRightEar += (rawRightEar - tr.smoothRightEar) * earAlpha;
        tr.smoothMar += (rawMar - tr.smoothMar) * earAlpha;
        tr.smoothPitch += (rawPose.pitchDeg - tr.smoothPitch) * poseAlpha;
        tr.smoothYaw += (rawPose.yawDeg - tr.smoothYaw) * poseAlpha;
        tr.smoothBlink += (rawBlink - tr.smoothBlink) * earAlpha;
        tr.smoothJawOpen += (rawJawOpen - tr.smoothJawOpen) * earAlpha;
      }
      leftEar = tr.smoothLeftEar;
      rightEar = tr.smoothRightEar;
      mar = tr.smoothMar;
      pitchDeg = Number(tr.smoothPitch.toFixed(1));
      yawDeg = Number(tr.smoothYaw.toFixed(1));
      avgBlink = tr.smoothBlink;
      jawOpen = tr.smoothJawOpen;
    }

    const avgEar = (leftEar + rightEar) / 2;
    latestSignalRef.current = { faceDetected: true, avgEar, avgBlink };

    // Fused geometric EAR + MediaPipe neural eyeBlink classifier with Schmitt-trigger hysteresis
    let rawEyeClosed: boolean;
    if (blendshapes) {
      const earBelowThresh = avgEar < cal.earThreshold;
      const earDeepClosed = avgEar < cal.earThreshold * 0.8;
      const neuralStrongClosed = avgBlink >= 0.6 && avgEar < cal.earThreshold + 0.05;
      const neuralConfirm = avgBlink >= 0.28;

      if (!tr.wasEyeClosed) {
        rawEyeClosed = (earBelowThresh && (neuralConfirm || earDeepClosed)) || neuralStrongClosed;
      } else {
        // Hysteresis band prevents flickering open/closed right on the threshold
        rawEyeClosed =
          avgEar < cal.earThreshold + 0.024 ||
          (avgBlink >= 0.45 && avgEar < cal.earThreshold + 0.055);
      }
    } else {
      rawEyeClosed = tr.wasEyeClosed
        ? avgEar < cal.earThreshold + 0.014
        : avgEar < cal.earThreshold;
    }

    // Brief 120ms dropout grace during prolonged closure so a 1-frame camera glare blip doesn't reset microsleep timer
    let isEyeClosed = rawEyeClosed;
    if (!rawEyeClosed && tr.wasEyeClosed && tr.eyeClosedStartMs !== null) {
      const clearlyOpen =
        avgEar > cal.earThreshold + 0.05 && (!blendshapes || avgBlink < 0.24);
      const ongoingMs = now - tr.eyeClosedStartMs;
      if (!clearlyOpen && ongoingMs >= 300) {
        if (tr.eyeOpenGraceStartMs === null) {
          tr.eyeOpenGraceStartMs = now;
        }
        if (now - tr.eyeOpenGraceStartMs < 120) {
          isEyeClosed = true;
        }
      }
    } else if (rawEyeClosed) {
      tr.eyeOpenGraceStartMs = null;
    }

    const isYawning = blendshapes
      ? mar >= cal.marThreshold || (jawOpen >= 0.58 && mar >= cal.marThreshold * 0.76)
      : mar >= cal.marThreshold;
    const isNodding = Math.abs(pitchDeg) >= cal.pitchThresholdDeg;

    if (isEyeClosed) {
      if (tr.eyeClosedStartMs === null) {
        tr.eyeClosedStartMs = now;
      }
      tr.wasEyeClosed = true;
    } else {
      if (tr.wasEyeClosed && tr.eyeClosedStartMs !== null) {
        const closedDur = now - tr.eyeClosedStartMs;
        if (closedDur >= 45 && closedDur <= 650) {
          tr.totalBlinks += 1;
          tr.blinkTimestamps.push(now);
        }
      }
      tr.eyeClosedStartMs = null;
      tr.eyeOpenGraceStartMs = null;
      tr.wasEyeClosed = false;
    }

    const eyeClosedDurationMs = tr.eyeClosedStartMs !== null ? now - tr.eyeClosedStartMs : 0;

    if (isYawning) {
      if (tr.yawnStartMs === null) tr.yawnStartMs = now;
    } else {
      tr.yawnStartMs = null;
    }
    const yawnDurationMs = tr.yawnStartMs !== null ? now - tr.yawnStartMs : 0;

    if (isNodding) {
      if (tr.nodStartMs === null) tr.nodStartMs = now;
    } else {
      tr.nodStartMs = null;
    }
    const nodDurationMs = tr.nodStartMs !== null ? now - tr.nodStartMs : 0;

    tr.blinkTimestamps = tr.blinkTimestamps.filter((t) => now - t <= 60_000);
    const blinkRatePerMin = tr.blinkTimestamps.length;

    tr.perclosSamples.push({ t: now, closed: isEyeClosed });
    const windowMs = cal.perclosWindowSec * 1000;
    tr.perclosSamples = tr.perclosSamples.filter((s) => now - s.t <= windowMs);
    const closedCount = tr.perclosSamples.filter((s) => s.closed).length;
    const perclos =
      tr.perclosSamples.length > 0 ? (closedCount / tr.perclosSamples.length) * 100 : 0;

    // Require >= 10s of rolling window AND recent eyelid fatigue (last 8s) before raising PERCLOS warning
    const perclosSpanMs =
      tr.perclosSamples.length > 1 ? now - tr.perclosSamples[0].t : 0;
    const recentSamples = tr.perclosSamples.filter((s) => now - s.t <= 8000);
    const recentClosedPct =
      recentSamples.length > 0
        ? (recentSamples.filter((s) => s.closed).length / recentSamples.length) * 100
        : 0;
    const perclosWarningActive =
      perclos >= cal.perclosAlertPct &&
      perclosSpanMs >= 10_000 &&
      (isEyeClosed || recentClosedPct >= 15);

    let state: DrowsinessState = 'nominal';
    let stateReason = 'Attentive baseline · Eyes open';

    const criticalClosureMs = cal.closureDurationSec * 1000;
    const warningClosureMs = Math.max(350, criticalClosureMs * 0.55);
    const yawnTriggerMs = cal.yawnDurationSec * 1000;

    if (eyeClosedDurationMs >= criticalClosureMs) {
      state = 'critical';
      stateReason = `Microsleep active (${(eyeClosedDurationMs / 1000).toFixed(2)}s < EAR ${cal.earThreshold.toFixed(2)})`;
    } else if (nodDurationMs >= 1100 && isEyeClosed) {
      state = 'critical';
      stateReason = `Forward head nod (${pitchDeg.toFixed(1)}°) with eye closure`;
    } else if (eyeClosedDurationMs >= warningClosureMs) {
      state = 'warning';
      stateReason = `Slow eyelid closure (${(eyeClosedDurationMs / 1000).toFixed(2)}s)`;
    } else if (yawnDurationMs >= yawnTriggerMs) {
      state = 'warning';
      stateReason = `Yawn signature detected (MAR ${mar.toFixed(2)})`;
    } else if (nodDurationMs >= 1100) {
      state = 'warning';
      stateReason = `Head pitch deviation (${pitchDeg.toFixed(1)}°)`;
    } else if (perclosWarningActive) {
      state = 'warning';
      stateReason = `Elevated PERCLOS (${perclos.toFixed(1)}% >= ${cal.perclosAlertPct}%)`;
    }

    const frame: TelemetryFrame = {
      faceDetected: true,
      leftEar,
      rightEar,
      avgEar,
      mar,
      headPitch: pitchDeg,
      headYaw: yawDeg,
      perclos,
      blinkRatePerMin,
      totalBlinks: tr.totalBlinks,
      eyeClosedDurationMs,
      yawnDurationMs,
      nodDurationMs,
      state,
      stateReason,
      landmarks,
      fps,
    };

    commitIfNeeded(frame);
    return frame;
  };

  // Manage Webcam Stream (instant preview with progressive constraints + concurrent MediaPipe load)
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    setCameraError(null);
    setCameraReady(false);
    setVideoResolution(null);

    if (sourceMode === 'webcam') {
      const acquireStream = async (): Promise<MediaStream> => {
        const attempts: MediaStreamConstraints[] = selectedDeviceId
          ? [
              {
                video: {
                  deviceId: { exact: selectedDeviceId },
                  width: { ideal: 640 },
                  height: { ideal: 480 },
                  frameRate: { ideal: 30 },
                },
                audio: false,
              },
              {
                video: { deviceId: { exact: selectedDeviceId } },
                audio: false,
              },
              { video: true, audio: false },
            ]
          : [
              {
                video: {
                  width: { ideal: 640 },
                  height: { ideal: 480 },
                  frameRate: { ideal: 30 },
                  facingMode: { ideal: 'user' },
                },
                audio: false,
              },
              {
                video: { facingMode: 'user' },
                audio: false,
              },
              { video: true, audio: false },
            ];

        let lastError: unknown = null;
        for (const constraints of attempts) {
          try {
            return await navigator.mediaDevices.getUserMedia(constraints);
          } catch (err) {
            lastError = err;
            const errName = err instanceof DOMException ? err.name : '';
            // Do not retry if user explicitly denied permission
            if (errName === 'NotAllowedError' || errName === 'SecurityError') {
              throw err;
            }
          }
        }
        throw lastError ?? new Error('Unable to acquire camera stream');
      };

      const startWebcam = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraError(
            'Camera API unavailable in this browser context. Allow camera access or switch to Samples / Simulator.'
          );
          return;
        }

        // Start MediaPipe initialization concurrently WITHOUT blocking the live video preview
        if (!videoLandmarkerRef.current) {
          setLandmarkerStatus('loading');
          void faceLandmarkerService
            .getVideoLandmarker()
            .then((lm) => {
              if (cancelled) return;
              videoLandmarkerRef.current = lm;
              setLandmarkerStatus('ready');
            })
            .catch((err) => {
              console.error('FaceLandmarker VIDEO init failed:', err);
              if (!cancelled) setLandmarkerStatus('error');
            });
        } else {
          setLandmarkerStatus('ready');
        }

        try {
          const mediaStream = await acquireStream();
          if (cancelled) {
            mediaStream.getTracks().forEach((t) => t.stop());
            return;
          }

          stream = mediaStream;

          // Enumerate cameras now that permission is granted
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            if (!cancelled) {
              const cams = devices.filter((d) => d.kind === 'videoinput');
              setVideoDevices(cams);
              const activeTrackDeviceId = mediaStream.getVideoTracks()[0]?.getSettings().deviceId;
              if (activeTrackDeviceId && !selectedDeviceId) {
                setSelectedDeviceId(activeTrackDeviceId);
              }
            }
          } catch {
            // Ignore enumerateDevices errors on restricted browsers
          }

          const video = videoRef.current;
          if (video) {
            video.srcObject = mediaStream;
            video.muted = true;
            video.playsInline = true;

            if (video.readyState < 1) {
              await new Promise<void>((resolve) => {
                const onMeta = () => {
                  video.removeEventListener('loadedmetadata', onMeta);
                  resolve();
                };
                video.addEventListener('loadedmetadata', onMeta);
                window.setTimeout(resolve, 1200);
              });
            }

            if (cancelled) return;
            await video.play();
            if (cancelled) return;

            if (video.videoWidth > 0 && video.videoHeight > 0) {
              setVideoResolution({ w: video.videoWidth, h: video.videoHeight });
            }
            setCameraReady(true);
          }
        } catch (err) {
          if (cancelled) return;
          const errName = err instanceof DOMException ? err.name : '';
          const msg =
            errName === 'NotAllowedError'
              ? 'Camera permission was denied. Allow webcam access in your browser bar and click Retry Camera.'
              : errName === 'NotFoundError'
                ? 'No camera device was detected on this system.'
                : errName === 'NotReadableError'
                  ? 'Camera is currently in use by another application or tab.'
                  : err instanceof Error
                    ? err.message
                    : 'Unable to access webcam';
          setCameraError(msg);
        }
      };

      void startWebcam();
    } else if (sourceMode === 'upload' && uploadedMedia?.kind === 'video') {
      const startUploadedVideo = async () => {
        if (!videoLandmarkerRef.current) {
          setLandmarkerStatus('loading');
          void faceLandmarkerService
            .getVideoLandmarker()
            .then((lm) => {
              if (cancelled) return;
              videoLandmarkerRef.current = lm;
              setLandmarkerStatus('ready');
            })
            .catch(() => {
              if (!cancelled) setLandmarkerStatus('error');
            });
        } else {
          setLandmarkerStatus('ready');
        }

        try {
          const video = videoRef.current;
          if (video) {
            video.srcObject = null;
            video.src = uploadedMedia.url;
            video.loop = true;
            video.muted = true;
            await video.play();
            if (!cancelled) {
              if (video.videoWidth > 0 && video.videoHeight > 0) {
                setVideoResolution({ w: video.videoWidth, h: video.videoHeight });
              }
              setCameraReady(true);
            }
          }
        } catch {
          if (!cancelled) setLandmarkerStatus('error');
        }
      };
      void startUploadedVideo();
    }

    return () => {
      cancelled = true;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
        videoRef.current.removeAttribute('src');
      }
    };
  }, [sourceMode, uploadedMedia, selectedDeviceId, cameraRetryNonce]);

  // Analyze static Sample Frame or Uploaded Image using MediaPipe IMAGE mode
  useEffect(() => {
    const isStaticImage =
      sourceMode === 'samples' || (sourceMode === 'upload' && uploadedMedia?.kind === 'image');
    if (!isStaticImage) return;

    let cancelled = false;
    const imageUrl =
      sourceMode === 'samples'
        ? (DRIVER_SAMPLE_FRAMES.find((s) => s.id === activeSampleId)?.imageUrl ??
          DRIVER_SAMPLE_FRAMES[0].imageUrl)
        : uploadedMedia?.url;

    if (!imageUrl) return;

    staticAnalysisRef.current.imageLoaded = false;
    setLandmarkerStatus('loading');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      if (cancelled) return;
      staticImgRef.current = img;
      try {
        const result = await faceLandmarkerService.detectImage(img);
        if (cancelled) return;
        setLandmarkerStatus('ready');
        const landmarks = (result.faceLandmarks?.[0] ?? []) as NormalizedLandmark[];
        const aspectRatio =
          img.naturalWidth > 0 && img.naturalHeight > 0
            ? img.naturalWidth / img.naturalHeight
            : 16 / 9;
        staticAnalysisRef.current = {
          landmarks,
          aspectRatio,
          blendshapes: extractBlendshapeScores(result),
          matrixData: result.facialTransformationMatrixes?.[0]?.data ?? null,
          imageLoaded: true,
        };
      } catch (err) {
        console.error('Image landmark detection failed:', err);
        if (!cancelled) setLandmarkerStatus('error');
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        staticAnalysisRef.current.imageLoaded = false;
        setLandmarkerStatus('error');
      }
    };
    img.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [sourceMode, activeSampleId, uploadedMedia]);

  // Reset closure, smoothing & PERCLOS trackers whenever the source, sample, or scenario changes
  useEffect(() => {
    resetTrackerState(false);
    setAutoCalibrating(false);
  }, [sourceMode, activeSampleId, simulatorScenario, uploadedMedia, selectedDeviceId]);

  // Decoupled High-Speed 60fps Video/Canvas Processing Loop (never drops live MediaStream frames)
  useEffect(() => {
    let rafId = 0;
    let rvfcId = 0;
    let stopped = false;
    let lastTickMs = 0;

    resetTrackerState(false);

    const isVideoMode =
      sourceMode === 'webcam' || (sourceMode === 'upload' && uploadedMedia?.kind === 'video');

    // Clear any stale frame from previous source mode immediately
    if (isVideoMode && canvasRef.current) {
      const clearCtx = canvasRef.current.getContext('2d');
      clearCtx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    const processVideoFrame = (metadata?: VideoFrameMetadataLike) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const landmarker =
        videoLandmarkerRef.current ?? faceLandmarkerService.getCachedVideoLandmarker();
      if (!canvas || !video || !landmarker) return;
      videoLandmarkerRef.current = landmarker;
      if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return;

      // For uploaded video files, dedup by currentTime; for live webcam MediaStream,
      // dedup ONLY by presentedFrames (never currentTime, which can stall at 0 in live streams)
      if (sourceMode === 'webcam') {
        if (typeof metadata?.presentedFrames === 'number') {
          if (metadata.presentedFrames === trackerRef.current.lastPresentedFrames) return;
          trackerRef.current.lastPresentedFrames = metadata.presentedFrames;
        }
      } else {
        if (video.currentTime === trackerRef.current.lastVideoTime) return;
        trackerRef.current.lastVideoTime = video.currentTime;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        setVideoResolution((prev) =>
          prev && prev.w === video.videoWidth && prev.h === video.videoHeight
            ? prev
            : { w: video.videoWidth, h: video.videoHeight }
        );
      }

      const nowPerf = performance.now();
      const dt = Math.max(1, nowPerf - trackerRef.current.lastFrameMs);
      trackerRef.current.lastFrameMs = nowPerf;
      trackerRef.current.fpsSmoothed =
        trackerRef.current.fpsSmoothed * 0.85 + (1000 / dt) * 0.15;
      const fps = Math.round(trackerRef.current.fpsSmoothed);

      const { showMesh: mesh, showEyeVectors: vectors, showGrid: grid } = latestRef.current;
      const aspectRatio = video.videoWidth / video.videoHeight;

      try {
        const res = faceLandmarkerService.detectVideoSync(video);
        if (!res) return;
        const landmarks = (res.faceLandmarks?.[0] ?? []) as NormalizedLandmark[];
        const blendshapes = extractBlendshapeScores(res);
        const matrixData = res.facialTransformationMatrixes?.[0]?.data ?? null;

        const frame = evaluateLandmarks(landmarks, fps, {
          aspectRatio,
          blendshapes,
          matrixData,
          enableSmoothing: true,
        });

        renderLandmarkOverlay(ctx, {
          width: canvas.width,
          height: canvas.height,
          landmarks,
          state: frame.state,
          showMesh: mesh,
          showEyeVectors: vectors,
          showGrid: grid,
          mirrorX: sourceMode === 'webcam',
          isSimulator: false,
          clearCanvas: true,
          leftEar: frame.leftEar,
          rightEar: frame.rightEar,
          mar: frame.mar,
        });
      } catch {
        // Ignore transient MediaPipe frame mismatch during camera warm-up
      }
    };

    const videoEl = videoRef.current as VideoWithRVFC | null;

    if (
      isVideoMode &&
      cameraReady &&
      videoEl &&
      typeof videoEl.requestVideoFrameCallback === 'function'
    ) {
      const onVideoFrame = (_now: number, metadata: VideoFrameMetadataLike) => {
        if (stopped) return;
        processVideoFrame(metadata);
        rvfcId = videoEl.requestVideoFrameCallback!(onVideoFrame);
      };
      rvfcId = videoEl.requestVideoFrameCallback(onVideoFrame);
    } else {
      const tick = (ts: number) => {
        if (stopped) return;

        if (isVideoMode) {
          if (ts - lastTickMs >= 16) {
            lastTickMs = ts;
            processVideoFrame();
          }
        } else if (
          sourceMode === 'samples' ||
          (sourceMode === 'upload' && uploadedMedia?.kind === 'image')
        ) {
          if (ts - lastTickMs >= 100) {
            lastTickMs = ts;
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            const img = staticImgRef.current;
            const sa = staticAnalysisRef.current;
            if (canvas && ctx && img && sa.imageLoaded) {
              const targetW = 960;
              const targetH = Math.round(
                (img.naturalHeight / Math.max(1, img.naturalWidth)) * targetW
              );
              if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW;
                canvas.height = targetH;
              }
              const frame = evaluateLandmarks(sa.landmarks, 10, {
                aspectRatio: sa.aspectRatio,
                blendshapes: sa.blendshapes,
                matrixData: sa.matrixData,
                enableSmoothing: false,
              });
              const { showMesh: mesh, showEyeVectors: vectors, showGrid: grid } = latestRef.current;
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              renderLandmarkOverlay(ctx, {
                width: canvas.width,
                height: canvas.height,
                landmarks: sa.landmarks,
                state: frame.state,
                showMesh: mesh,
                showEyeVectors: vectors,
                showGrid: grid,
                mirrorX: false,
                isSimulator: false,
                clearCanvas: false,
                leftEar: frame.leftEar,
                rightEar: frame.rightEar,
                mar: frame.mar,
              });
            }
          }
        } else if (sourceMode === 'simulator') {
          if (ts - lastTickMs >= 16) {
            lastTickMs = ts;
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (canvas && ctx) {
              if (canvas.width !== 960 || canvas.height !== 540) {
                canvas.width = 960;
                canvas.height = 540;
              }

              const tSec = ts / 1000;
              const {
                simulatorScenario: scen,
                manualSim: manual,
                showMesh: mesh,
                showEyeVectors: vectors,
                showGrid: grid,
              } = latestRef.current;

              let eyeOpenness = 0.92;
              let mouthOpenness = 0.04;
              let pitchDeg = Math.sin(tSec * 0.7) * 2.0;
              const yawDeg = Math.sin(tSec * 0.45) * 4.5;

              if (scen === 'alert') {
                const cycle = tSec % 3.5;
                const blink = cycle > 3.32 ? 0.08 : 0.94;
                eyeOpenness = blink + Math.sin(tSec * 2.1) * 0.03;
                mouthOpenness = 0.04;
              } else if (scen === 'fatigued') {
                const cycle = tSec % 2.4;
                const slowBlink = cycle > 1.75 ? 0.12 : 0.56;
                eyeOpenness = slowBlink + Math.sin(tSec * 1.4) * 0.04;
                mouthOpenness = 0.12 + Math.max(0, Math.sin(tSec * 0.6)) * 0.18;
                pitchDeg = 6 + Math.sin(tSec * 0.9) * 5;
              } else if (scen === 'microsleep') {
                const cycle = tSec % 5.5;
                if (cycle < 1.3) {
                  eyeOpenness = 0.55;
                  pitchDeg = 8;
                } else if (cycle < 3.8) {
                  eyeOpenness = 0.06;
                  pitchDeg = 20;
                } else {
                  eyeOpenness = 0.92;
                  pitchDeg = 2;
                }
              } else if (scen === 'yawn_nod') {
                const yawnWave = Math.max(0, Math.sin(tSec * 1.1));
                mouthOpenness = 0.15 + yawnWave * 0.85;
                eyeOpenness = 0.68 - yawnWave * 0.45;
                pitchDeg = 10 + Math.max(0, Math.cos(tSec * 0.9)) * 14;
              } else {
                eyeOpenness = manual.eyeOpenness;
                mouthOpenness = manual.mouthOpenness;
                pitchDeg = manual.pitchDeg;
              }

              const landmarks = generateSyntheticLandmarks({
                eyeOpenness: Math.max(0, Math.min(1, eyeOpenness)),
                mouthOpenness: Math.max(0, Math.min(1, mouthOpenness)),
                pitchDeg,
                yawDeg,
              });

              const frame = evaluateLandmarks(landmarks, 60, {
                aspectRatio: 960 / 540,
                blendshapes: null,
                matrixData: null,
                enableSmoothing: false,
              });
              renderLandmarkOverlay(ctx, {
                width: canvas.width,
                height: canvas.height,
                landmarks,
                state: frame.state,
                showMesh: mesh,
                showEyeVectors: vectors,
                showGrid: grid,
                mirrorX: false,
                isSimulator: true,
                clearCanvas: true,
                leftEar: frame.leftEar,
                rightEar: frame.rightEar,
                mar: frame.mar,
              });
            }
          }
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
    }

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (rvfcId && videoEl && typeof videoEl.cancelVideoFrameCallback === 'function') {
        videoEl.cancelVideoFrameCallback(rvfcId);
      }
    };
  }, [sourceMode, uploadedMedia, cameraReady, landmarkerStatus]);

  const handleCaptureSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) return;

    const video = videoRef.current;
    const isVideoActive =
      (sourceMode === 'webcam' || (sourceMode === 'upload' && uploadedMedia?.kind === 'video')) &&
      video &&
      video.readyState >= 2 &&
      video.videoWidth > 0;

    if (isVideoActive) {
      exportCtx.save();
      if (sourceMode === 'webcam') {
        exportCtx.translate(exportCanvas.width, 0);
        exportCtx.scale(-1, 1);
      }
      exportCtx.drawImage(video, 0, 0, exportCanvas.width, exportCanvas.height);
      exportCtx.restore();
    }

    exportCtx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);

    const url = exportCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `vigilance-ear-frame-${Date.now()}.png`;
    a.click();
  };

  const handleRetryModel = () => {
    setLandmarkerStatus('loading');
    void faceLandmarkerService
      .getVideoLandmarker()
      .then((lm) => {
        videoLandmarkerRef.current = lm;
        setLandmarkerStatus('ready');
      })
      .catch(() => {
        setLandmarkerStatus('error');
      });
  };

  const isVideoFeed =
    sourceMode === 'webcam' || (sourceMode === 'upload' && uploadedMedia?.kind === 'video');

  const isCritical = telemetry.state === 'critical';
  const isWarning = telemetry.state === 'warning';

  return (
    <div className="glass-panel rounded-[26px] overflow-hidden flex flex-col">
      {/* Viewport Top Control Bar with Liquid Clear Glass Capsule Toggles */}
      <div className="px-5 py-3.5 border-b border-white/22 flex flex-wrap items-center justify-between gap-3 bg-white/[0.08]">
        <div className="flex items-center flex-wrap gap-2.5 text-xs font-mono text-white/90">
          <span>
            FEED:{' '}
            <strong className="text-white font-semibold">
              {sourceMode === 'webcam'
                ? videoResolution
                  ? `LIVE WEBCAM (${videoResolution.w}×${videoResolution.h})`
                  : 'LIVE WEBCAM'
                : sourceMode === 'samples'
                  ? 'REFERENCE SAMPLE'
                  : sourceMode === 'simulator'
                    ? `SIMULATOR (${simulatorScenario.toUpperCase()})`
                    : 'UPLOADED MEDIA'}
            </strong>
          </span>
          <span aria-hidden="true" className="text-white/45">·</span>
          <span className="text-white/85">
            {sourceMode === 'simulator'
              ? 'SYNTHETIC MESH'
              : landmarkerStatus === 'loading'
                ? 'LOADING MEDIAPIPE...'
                : landmarkerStatus === 'ready'
                  ? '478-PT + BLENDSHAPES'
                  : landmarkerStatus === 'error'
                    ? 'MODEL ERROR'
                    : 'READY'}
          </span>
          {telemetry.fps > 0 && (
            <>
              <span aria-hidden="true" className="text-white/45">·</span>
              <span className="tabular-nums text-white/90">{telemetry.fps} FPS</span>
            </>
          )}
          {sourceMode === 'webcam' && landmarkerStatus === 'error' && (
            <button
              type="button"
              onClick={handleRetryModel}
              className="glass-option inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] text-amber-200 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry AI</span>
            </button>
          )}
        </div>

        {/* Liquid Glass Capsule Toggle Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {sourceMode === 'webcam' && videoDevices.length > 1 && (
            <select
              aria-label="Select webcam device"
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="glass-well rounded-full px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/65 max-w-[155px] truncate cursor-pointer"
            >
              {videoDevices.map((dev, idx) => (
                <option key={dev.deviceId} value={dev.deviceId} className="bg-[#09090b] text-white">
                  {dev.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          )}

          {sourceMode === 'webcam' && cameraReady && landmarkerStatus === 'ready' && (
            <button
              type="button"
              onClick={() => setAutoCalibrating(true)}
              disabled={autoCalibrating}
              title="Sample your natural open-eye EAR for 3 seconds to lock accurate personal threshold"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap ${
                autoCalibrating ? 'liquid-cta text-white' : 'glass-option-active text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>
                {autoCalibrating ? `Calibrating ${Math.round(autoCalProgress)}%` : 'Auto-Calibrate'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowMesh((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap ${
              showMesh ? 'glass-option-active text-white' : 'glass-option text-white/75'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Mesh</span>
          </button>
          <button
            type="button"
            onClick={() => setShowEyeVectors((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap ${
              showEyeVectors ? 'glass-option-active text-white' : 'glass-option text-white/75'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>EAR Vectors</span>
          </button>
          <button
            type="button"
            onClick={() => setShowGrid((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap ${
              showGrid ? 'glass-option-active text-white' : 'glass-option text-white/75'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Reticle</span>
          </button>
          <button
            type="button"
            onClick={handleCaptureSnapshot}
            title="Download annotated frame snapshot"
            className="glass-option inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Snapshot</span>
          </button>
        </div>
      </div>

      {/* Main Optical Stage */}
      <div
        className="relative aspect-video w-full bg-[#050507]/85 overflow-hidden cursor-crosshair"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setCursorCoords({
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height,
          });
        }}
        onMouseLeave={() => setCursorCoords(null)}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 w-full h-full object-contain ${
            sourceMode === 'webcam' ? '-scale-x-100' : ''
          } ${isVideoFeed && cameraReady ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        />

        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain" />

        {/* Real-Time Non-Blocking Floating Liquid Clear Glass HUD Bar */}
        <div
          role="status"
          aria-live="polite"
          className={`absolute top-3.5 left-3.5 right-3.5 px-4 py-2.5 rounded-full border backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 transition-colors duration-150 ${
            isCritical
              ? 'bg-red-950/62 border-red-200/80 text-red-50 shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),0_8px_28px_rgba(239,68,68,0.45)]'
              : isWarning
                ? 'bg-amber-950/60 border-amber-200/80 text-amber-50 shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),0_8px_24px_rgba(245,158,11,0.38)]'
                : 'bg-black/45 border-white/40 text-white shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.75),0_10px_28px_rgba(0,0,0,0.6)]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {isCritical || isWarning ? (
              <AlertTriangle
                className={`w-4 h-4 shrink-0 ${isCritical ? 'text-red-300' : 'text-amber-300'}`}
              />
            ) : (
              <Radio className="w-4 h-4 shrink-0 text-white" />
            )}
            <div className="min-w-0 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
              <span className="font-display font-bold tracking-wide">
                {isCritical
                  ? 'CRITICAL ALERT'
                  : isWarning
                    ? 'FATIGUE WARNING'
                    : telemetry.faceDetected
                      ? 'LIVE TRACKING · NOMINAL'
                      : 'AWAITING FACE LOCK'}
              </span>
              <span aria-hidden="true" className="opacity-45">|</span>
              <span className="font-mono text-[11px] opacity-95 truncate">
                {telemetry.stateReason}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums shrink-0 opacity-95">
            <span>EAR {telemetry.faceDetected ? telemetry.avgEar.toFixed(3) : '—'}</span>
            <span aria-hidden="true" className="opacity-45">·</span>
            <span>MAR {telemetry.faceDetected ? telemetry.mar.toFixed(2) : '—'}</span>
            <span aria-hidden="true" className="opacity-45">·</span>
            <span>PERCLOS {telemetry.perclos.toFixed(1)}%</span>
          </div>
        </div>

        {/* Auto-Calibration Toast Banner */}
        {(autoCalibrating || autoCalMessage) && (
          <div className="absolute bottom-3.5 left-3.5 px-3.5 py-2 rounded-full bg-black/55 backdrop-blur-xl border border-white/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_8px_24px_rgba(0,0,0,0.65)] text-xs font-mono text-white flex items-center gap-2">
            {autoCalibrating ? (
              <>
                <Sliders className="w-3.5 h-3.5 text-white animate-pulse" />
                <span>Keep eyes open and look naturally at camera ({Math.round(autoCalProgress)}%)</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>{autoCalMessage}</span>
              </>
            )}
          </div>
        )}

        {/* Webcam Starting Indicator */}
        {sourceMode === 'webcam' && !cameraReady && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/68 backdrop-blur-xl">
            <Camera className="w-9 h-9 text-white mb-2.5 animate-pulse" />
            <p className="text-sm font-display font-semibold text-white">Starting Webcam Stream...</p>
            <p className="text-xs text-white/80 mt-1">
              Accept the browser camera permission prompt to begin real-time facial tracking.
            </p>
          </div>
        )}

        {/* Camera Error Fallback */}
        {sourceMode === 'webcam' && cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/74 backdrop-blur-2xl">
            <Camera className="w-10 h-10 text-white mb-3" />
            <h3 className="text-base font-display font-semibold text-white">
              Webcam Stream Unavailable
            </h3>
            <p className="text-xs text-white/85 max-w-md mt-1.5 leading-relaxed">{cameraError}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setCameraRetryNonce((n) => n + 1)}
                className="liquid-cta inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-full cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Camera</span>
              </button>
              <button
                type="button"
                onClick={() => onSourceModeChange('samples')}
                className="glass-option px-4 py-2 text-xs font-medium text-white rounded-full cursor-pointer"
              >
                Analyze Sample Frames
              </button>
              <button
                type="button"
                onClick={() => onSourceModeChange('simulator')}
                className="glass-option px-4 py-2 text-xs font-medium text-white rounded-full cursor-pointer"
              >
                Launch Simulator
              </button>
            </div>
          </div>
        )}

        {/* Upload Empty Prompt */}
        {sourceMode === 'upload' && !uploadedMedia && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/70 backdrop-blur-2xl">
            <h3 className="text-base font-display font-semibold text-white">
              No Media File Selected
            </h3>
            <p className="text-xs text-white/80 max-w-md mt-1.5">
              Choose a driver image or cabin video in the Optical Source Options block below to compute live facial landmarks and Eye Aspect Ratio.
            </p>
          </div>
        )}

        {/* Crosshair Normalized Coordinates HUD */}
        {cursorCoords && (
          <div className="absolute bottom-3 right-3.5 px-3 py-1 rounded-full bg-black/55 backdrop-blur-xl border border-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] text-[11px] font-mono tabular-nums text-white pointer-events-none">
            x: {cursorCoords.x.toFixed(3)} · y: {cursorCoords.y.toFixed(3)}
          </div>
        )}
      </div>
    </div>
  );
}
