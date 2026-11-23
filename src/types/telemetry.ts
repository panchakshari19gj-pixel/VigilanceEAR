export type DrowsinessState = 'nominal' | 'warning' | 'critical' | 'no_face';

export type InputSourceMode = 'webcam' | 'samples' | 'simulator' | 'upload';

export type SimulatorScenario = 'alert' | 'fatigued' | 'microsleep' | 'yawn_nod' | 'manual';

export type EventType =
  | 'microsleep'
  | 'fatigue_warning'
  | 'yawn_detected'
  | 'head_nod'
  | 'perclos_alert'
  | 'session_start'
  | 'session_end';

export type EventSeverity = 'info' | 'warning' | 'critical';

export type AppTab = 'monitor' | 'logs' | 'calibration' | 'analytics';

export interface DriverProfile {
  id: string;
  name: string;
  licenseCode: string;
  vehicleUnit: string;
  baselineEar: number;
  createdAt: string;
}

export interface DrowsinessLogEvent {
  id: string;
  sessionId: string;
  driverId: string;
  driverName: string;
  vehicleUnit: string;
  timestamp: string;
  type: EventType;
  severity: EventSeverity;
  earValue: number;
  marValue: number;
  perclos: number;
  headPitch: number;
  durationMs: number;
  sourceMode: InputSourceMode;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  ackLatencyMs: number | null;
  notes: string;
}

export interface MonitoringSession {
  id: string;
  driverId: string;
  driverName: string;
  vehicleUnit: string;
  startedAt: string;
  endedAt: string | null;
  sourceMode: InputSourceMode;
  totalBlinks: number;
  alertCount: number;
  criticalCount: number;
  yawnCount: number;
  minEar: number;
  avgEar: number;
  peakPerclos: number;
  earThreshold: number;
}

export interface CalibrationConfig {
  earThreshold: number;
  closureDurationSec: number;
  marThreshold: number;
  yawnDurationSec: number;
  pitchThresholdDeg: number;
  perclosWindowSec: number;
  perclosAlertPct: number;
  alarmVolume: number;
  audioEnabled: boolean;
  voiceEnabled: boolean;
}

export interface EarSample {
  t: number;
  leftEar: number;
  rightEar: number;
  avgEar: number;
  mar: number;
  pitch: number;
  perclos: number;
  state: DrowsinessState;
}

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

export interface TelemetryFrame {
  faceDetected: boolean;
  leftEar: number;
  rightEar: number;
  avgEar: number;
  mar: number;
  headPitch: number;
  headYaw: number;
  perclos: number;
  blinkRatePerMin: number;
  totalBlinks: number;
  eyeClosedDurationMs: number;
  yawnDurationMs: number;
  nodDurationMs: number;
  state: DrowsinessState;
  stateReason: string;
  landmarks: NormalizedLandmark[];
  fps: number;
}
