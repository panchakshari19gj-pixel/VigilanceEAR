import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import type {
  CalibrationConfig,
  DriverProfile,
  DrowsinessLogEvent,
  MonitoringSession,
} from './src/types/telemetry.ts';

interface TelemetryStore {
  drivers: DriverProfile[];
  sessions: MonitoringSession[];
  events: DrowsinessLogEvent[];
  calibration: CalibrationConfig;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'telemetry-store.json');

const DEFAULT_CALIBRATION: CalibrationConfig = {
  earThreshold: 0.21,
  closureDurationSec: 1.2,
  marThreshold: 0.58,
  yawnDurationSec: 1.4,
  pitchThresholdDeg: 18,
  perclosWindowSec: 60,
  perclosAlertPct: 25,
  alarmVolume: 0.7,
  audioEnabled: true,
  voiceEnabled: false,
};

function createInitialStore(): TelemetryStore {
  const now = Date.now();
  const min = 60 * 1000;
  const hour = 60 * min;

  const drivers: DriverProfile[] = [
    {
      id: 'drv-01',
      name: 'Arjun Menon',
      licenseCode: 'DL-4092-IN',
      vehicleUnit: 'UNIT-V84 · Long-Haul',
      baselineEar: 0.31,
      createdAt: new Date(now - 14 * 24 * hour).toISOString(),
    },
    {
      id: 'drv-02',
      name: 'Elena Rostova',
      licenseCode: 'CDL-8821-EU',
      vehicleUnit: 'UNIT-V19 · Night Transit',
      baselineEar: 0.29,
      createdAt: new Date(now - 9 * 24 * hour).toISOString(),
    },
    {
      id: 'drv-03',
      name: 'Marcus Vance',
      licenseCode: 'CDL-5174-US',
      vehicleUnit: 'UNIT-V62 · Regional Fleet',
      baselineEar: 0.32,
      createdAt: new Date(now - 4 * 24 * hour).toISOString(),
    },
  ];

  const sessions: MonitoringSession[] = [
    {
      id: 'ses-1001',
      driverId: 'drv-01',
      driverName: 'Arjun Menon',
      vehicleUnit: 'UNIT-V84 · Long-Haul',
      startedAt: new Date(now - 3.5 * hour).toISOString(),
      endedAt: new Date(now - 2.1 * hour).toISOString(),
      sourceMode: 'webcam',
      totalBlinks: 942,
      alertCount: 3,
      criticalCount: 1,
      yawnCount: 2,
      minEar: 0.142,
      avgEar: 0.278,
      peakPerclos: 28.4,
      earThreshold: 0.22,
    },
    {
      id: 'ses-1002',
      driverId: 'drv-02',
      driverName: 'Elena Rostova',
      vehicleUnit: 'UNIT-V19 · Night Transit',
      startedAt: new Date(now - 1.8 * hour).toISOString(),
      endedAt: new Date(now - 0.6 * hour).toISOString(),
      sourceMode: 'webcam',
      totalBlinks: 688,
      alertCount: 2,
      criticalCount: 0,
      yawnCount: 1,
      minEar: 0.189,
      avgEar: 0.264,
      peakPerclos: 19.2,
      earThreshold: 0.22,
    },
  ];

  const events: DrowsinessLogEvent[] = [
    {
      id: 'evt-9004',
      sessionId: 'ses-1002',
      driverId: 'drv-02',
      driverName: 'Elena Rostova',
      vehicleUnit: 'UNIT-V19 · Night Transit',
      timestamp: new Date(now - 52 * min).toISOString(),
      type: 'fatigue_warning',
      severity: 'warning',
      earValue: 0.194,
      marValue: 0.31,
      perclos: 19.2,
      headPitch: 9.4,
      durationMs: 920,
      sourceMode: 'webcam',
      acknowledged: true,
      acknowledgedAt: new Date(now - 52 * min + 2800).toISOString(),
      ackLatencyMs: 2800,
      notes: 'Extended blink closure approaching 1.0s threshold.',
    },
    {
      id: 'evt-9003',
      sessionId: 'ses-1002',
      driverId: 'drv-02',
      driverName: 'Elena Rostova',
      vehicleUnit: 'UNIT-V19 · Night Transit',
      timestamp: new Date(now - 74 * min).toISOString(),
      type: 'yawn_detected',
      severity: 'warning',
      earValue: 0.231,
      marValue: 0.71,
      perclos: 14.5,
      headPitch: 6.2,
      durationMs: 1850,
      sourceMode: 'webcam',
      acknowledged: true,
      acknowledgedAt: new Date(now - 74 * min + 4100).toISOString(),
      ackLatencyMs: 4100,
      notes: 'Sustained MAR > 0.62 yawn signature detected.',
    },
    {
      id: 'evt-9002',
      sessionId: 'ses-1001',
      driverId: 'drv-01',
      driverName: 'Arjun Menon',
      vehicleUnit: 'UNIT-V84 · Long-Haul',
      timestamp: new Date(now - 148 * min).toISOString(),
      type: 'microsleep',
      severity: 'critical',
      earValue: 0.142,
      marValue: 0.24,
      perclos: 28.4,
      headPitch: 21.5,
      durationMs: 1740,
      sourceMode: 'webcam',
      acknowledged: true,
      acknowledgedAt: new Date(now - 148 * min + 1950).toISOString(),
      ackLatencyMs: 1950,
      notes: 'Bilateral EAR dropped below 0.22 for 1.74s with forward pitch nod.',
    },
    {
      id: 'evt-9001',
      sessionId: 'ses-1001',
      driverId: 'drv-01',
      driverName: 'Arjun Menon',
      vehicleUnit: 'UNIT-V84 · Long-Haul',
      timestamp: new Date(now - 175 * min).toISOString(),
      type: 'yawn_detected',
      severity: 'warning',
      earValue: 0.218,
      marValue: 0.68,
      perclos: 16.0,
      headPitch: 7.8,
      durationMs: 1620,
      sourceMode: 'webcam',
      acknowledged: true,
      acknowledgedAt: new Date(now - 175 * min + 3200).toISOString(),
      ackLatencyMs: 3200,
      notes: 'Repeated yawning cadence observed during highway segment.',
    },
  ];

  return {
    drivers,
    sessions,
    events,
    calibration: DEFAULT_CALIBRATION,
  };
}

function loadStore(): TelemetryStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      const initial = createInitialStore();
      fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<TelemetryStore>;
    return {
      drivers: Array.isArray(parsed.drivers) && parsed.drivers.length > 0 ? parsed.drivers : createInitialStore().drivers,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      calibration: { ...DEFAULT_CALIBRATION, ...(parsed.calibration ?? {}) },
    };
  } catch (err) {
    console.error('Failed to load telemetry store, using fresh defaults:', err);
    return createInitialStore();
  }
}

function saveStore(store: TelemetryStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tempPath, STORE_PATH);
  } catch (err) {
    console.error('Failed to persist telemetry store:', err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  // Serve MediaPipe WASM files locally so vision tasks work reliably without external CDN failures
  const wasmDir = path.resolve(process.cwd(), 'node_modules/@mediapipe/tasks-vision/wasm');
  if (fs.existsSync(wasmDir)) {
    app.use('/mediapipe/wasm', express.static(wasmDir));
  }

  let store = loadStore();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Drivers / Users
  app.get('/api/drivers', (_req, res) => {
    res.json({ drivers: store.drivers });
  });

  app.post('/api/drivers', (req, res) => {
    const { name, licenseCode, vehicleUnit, baselineEar } = req.body ?? {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Driver name is required' });
      return;
    }
    const driver: DriverProfile = {
      id: `drv-${Date.now().toString(36)}`,
      name: name.trim(),
      licenseCode: typeof licenseCode === 'string' && licenseCode.trim() ? licenseCode.trim() : `ID-${Math.floor(1000 + Math.random() * 9000)}`,
      vehicleUnit: typeof vehicleUnit === 'string' && vehicleUnit.trim() ? vehicleUnit.trim() : 'UNIT-01 · Active Cabin',
      baselineEar: typeof baselineEar === 'number' && baselineEar > 0.15 && baselineEar < 0.45 ? Number(baselineEar.toFixed(3)) : 0.30,
      createdAt: new Date().toISOString(),
    };
    store.drivers = [driver, ...store.drivers];
    saveStore(store);
    res.status(201).json({ driver });
  });

  app.patch('/api/drivers/:id', (req, res) => {
    const { id } = req.params;
    const idx = store.drivers.findIndex((d) => d.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Driver not found' });
      return;
    }
    const { baselineEar, vehicleUnit, name } = req.body ?? {};
    const nextName = typeof name === 'string' && name.trim() ? name.trim() : undefined;
    const nextUnit = typeof vehicleUnit === 'string' && vehicleUnit.trim() ? vehicleUnit.trim() : undefined;
    const nextBaseline =
      typeof baselineEar === 'number' && Number.isFinite(baselineEar)
        ? Number(Math.max(0.15, Math.min(0.45, baselineEar)).toFixed(3))
        : undefined;

    store.drivers[idx] = {
      ...store.drivers[idx],
      ...(nextBaseline !== undefined ? { baselineEar: nextBaseline } : {}),
      ...(nextUnit !== undefined ? { vehicleUnit: nextUnit } : {}),
      ...(nextName !== undefined ? { name: nextName } : {}),
    };

    // Propagate driver rename / unit update across persisted sessions & events
    if (nextName !== undefined || nextUnit !== undefined) {
      store.sessions = store.sessions.map((s) =>
        s.driverId === id
          ? {
              ...s,
              ...(nextName !== undefined ? { driverName: nextName } : {}),
              ...(nextUnit !== undefined ? { vehicleUnit: nextUnit } : {}),
            }
          : s
      );
      store.events = store.events.map((e) =>
        e.driverId === id
          ? {
              ...e,
              ...(nextName !== undefined ? { driverName: nextName } : {}),
              ...(nextUnit !== undefined ? { vehicleUnit: nextUnit } : {}),
            }
          : e
      );
    }

    saveStore(store);
    res.json({ driver: store.drivers[idx] });
  });

  app.delete('/api/drivers/:id', (req, res) => {
    const { id } = req.params;
    if (store.drivers.length <= 1) {
      res.status(400).json({ error: 'At least one driver profile must remain active.' });
      return;
    }
    store.drivers = store.drivers.filter((d) => d.id !== id);
    saveStore(store);
    res.json({ ok: true });
  });

  // Sessions
  app.get('/api/sessions', (req, res) => {
    const { driverId } = req.query;
    let sessions = store.sessions;
    if (typeof driverId === 'string' && driverId && driverId !== 'all') {
      sessions = sessions.filter((s) => s.driverId === driverId);
    }
    res.json({ sessions });
  });

  app.post('/api/sessions', (req, res) => {
    const payload = req.body ?? {};
    const driver = store.drivers.find((d) => d.id === payload.driverId) ?? store.drivers[0];
    const session: MonitoringSession = {
      id: `ses-${Date.now().toString(36)}`,
      driverId: driver.id,
      driverName: driver.name,
      vehicleUnit: driver.vehicleUnit,
      startedAt: new Date().toISOString(),
      endedAt: null,
      sourceMode: payload.sourceMode ?? 'webcam',
      totalBlinks: 0,
      alertCount: 0,
      criticalCount: 0,
      yawnCount: 0,
      minEar: typeof payload.earThreshold === 'number' ? payload.earThreshold : 0.3,
      avgEar: 0.3,
      peakPerclos: 0,
      earThreshold: typeof payload.earThreshold === 'number' ? payload.earThreshold : store.calibration.earThreshold,
    };
    store.sessions = [session, ...store.sessions].slice(0, 100);
    saveStore(store);
    res.status(201).json({ session });
  });

  app.patch('/api/sessions/:id', (req, res) => {
    const { id } = req.params;
    const idx = store.sessions.findIndex((s) => s.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const patch = req.body ?? {};
    const safeNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    store.sessions[idx] = {
      ...store.sessions[idx],
      ...(patch.endedAt !== undefined ? { endedAt: patch.endedAt } : {}),
      ...(safeNum(patch.totalBlinks) ? { totalBlinks: Math.max(0, Math.round(patch.totalBlinks)) } : {}),
      ...(safeNum(patch.alertCount) ? { alertCount: Math.max(0, Math.round(patch.alertCount)) } : {}),
      ...(safeNum(patch.criticalCount) ? { criticalCount: Math.max(0, Math.round(patch.criticalCount)) } : {}),
      ...(safeNum(patch.yawnCount) ? { yawnCount: Math.max(0, Math.round(patch.yawnCount)) } : {}),
      ...(safeNum(patch.minEar) ? { minEar: Number(patch.minEar.toFixed(3)) } : {}),
      ...(safeNum(patch.avgEar) ? { avgEar: Number(patch.avgEar.toFixed(3)) } : {}),
      ...(safeNum(patch.peakPerclos) ? { peakPerclos: Number(patch.peakPerclos.toFixed(1)) } : {}),
    };
    saveStore(store);
    res.json({ session: store.sessions[idx] });
  });

  // Event Logs
  app.get('/api/events', (req, res) => {
    const { driverId, severity, type, search } = req.query;
    let events = store.events;

    if (typeof driverId === 'string' && driverId && driverId !== 'all') {
      events = events.filter((e) => e.driverId === driverId);
    }
    if (typeof severity === 'string' && severity && severity !== 'all') {
      events = events.filter((e) => e.severity === severity);
    }
    if (typeof type === 'string' && type && type !== 'all') {
      events = events.filter((e) => e.type === type);
    }
    if (typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      events = events.filter(
        (e) =>
          e.driverName.toLowerCase().includes(q) ||
          e.vehicleUnit.toLowerCase().includes(q) ||
          e.notes.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q)
      );
    }

    res.json({ events });
  });

  app.post('/api/events', (req, res) => {
    const p = req.body ?? {};
    const driver = store.drivers.find((d) => d.id === p.driverId) ?? store.drivers[0];
    const toNum = (v: unknown, fallback = 0) =>
      typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    const event: DrowsinessLogEvent = {
      id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      sessionId: typeof p.sessionId === 'string' ? p.sessionId : 'ses-live',
      driverId: driver.id,
      driverName: driver.name,
      vehicleUnit: driver.vehicleUnit,
      timestamp: typeof p.timestamp === 'string' ? p.timestamp : new Date().toISOString(),
      type: p.type ?? 'fatigue_warning',
      severity: p.severity ?? 'warning',
      earValue: Number(toNum(p.earValue).toFixed(3)),
      marValue: Number(toNum(p.marValue).toFixed(3)),
      perclos: Number(toNum(p.perclos).toFixed(1)),
      headPitch: Number(toNum(p.headPitch).toFixed(1)),
      durationMs: Math.max(0, Math.round(toNum(p.durationMs))),
      sourceMode: p.sourceMode ?? 'webcam',
      acknowledged: Boolean(p.acknowledged),
      acknowledgedAt: p.acknowledgedAt ?? null,
      ackLatencyMs: typeof p.ackLatencyMs === 'number' && Number.isFinite(p.ackLatencyMs) ? p.ackLatencyMs : null,
      notes: typeof p.notes === 'string' ? p.notes : '',
    };

    store.events = [event, ...store.events].slice(0, 500);
    saveStore(store);
    res.status(201).json({ event });
  });

  app.patch('/api/events/:id/ack', (req, res) => {
    const { id } = req.params;
    const idx = store.events.findIndex((e) => e.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    const existing = store.events[idx];
    const ackTime = new Date().toISOString();
    const latency = Math.max(0, new Date(ackTime).getTime() - new Date(existing.timestamp).getTime());
    store.events[idx] = {
      ...existing,
      acknowledged: true,
      acknowledgedAt: ackTime,
      ackLatencyMs: existing.ackLatencyMs ?? latency,
    };
    saveStore(store);
    res.json({ event: store.events[idx] });
  });

  app.delete('/api/events/:id', (req, res) => {
    const { id } = req.params;
    store.events = store.events.filter((e) => e.id !== id);
    saveStore(store);
    res.json({ ok: true });
  });

  app.delete('/api/events', (req, res) => {
    const { driverId } = req.query;
    if (typeof driverId === 'string' && driverId && driverId !== 'all') {
      store.events = store.events.filter((e) => e.driverId !== driverId);
    } else {
      store.events = [];
    }
    saveStore(store);
    res.json({ ok: true });
  });

  // Calibration persistence
  app.get('/api/calibration', (_req, res) => {
    res.json({ calibration: store.calibration });
  });

  app.put('/api/calibration', (req, res) => {
    const p = req.body && typeof req.body === 'object' ? req.body : {};
    const clampNum = (v: unknown, min: number, max: number, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;

    store.calibration = {
      earThreshold: Number(clampNum(p.earThreshold, 0.12, 0.35, store.calibration.earThreshold).toFixed(2)),
      closureDurationSec: Number(clampNum(p.closureDurationSec, 0.3, 4.0, store.calibration.closureDurationSec).toFixed(2)),
      marThreshold: Number(clampNum(p.marThreshold, 0.35, 1.0, store.calibration.marThreshold).toFixed(2)),
      yawnDurationSec: Number(clampNum(p.yawnDurationSec, 0.5, 4.0, store.calibration.yawnDurationSec).toFixed(2)),
      pitchThresholdDeg: Math.round(clampNum(p.pitchThresholdDeg, 8, 40, store.calibration.pitchThresholdDeg)),
      perclosWindowSec: Math.round(clampNum(p.perclosWindowSec, 15, 120, store.calibration.perclosWindowSec)),
      perclosAlertPct: Math.round(clampNum(p.perclosAlertPct, 10, 60, store.calibration.perclosAlertPct)),
      alarmVolume: Number(clampNum(p.alarmVolume, 0.05, 1.0, store.calibration.alarmVolume).toFixed(2)),
      audioEnabled: typeof p.audioEnabled === 'boolean' ? p.audioEnabled : store.calibration.audioEnabled,
      voiceEnabled: typeof p.voiceEnabled === 'boolean' ? p.voiceEnabled : store.calibration.voiceEnabled,
    };
    saveStore(store);
    res.json({ calibration: store.calibration });
  });

  // Explicit JSON 404 for unknown API endpoints
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Vite / Static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VigilanceEAR server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
