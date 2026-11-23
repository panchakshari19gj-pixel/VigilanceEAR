import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bell, Radio, Search, User } from 'lucide-react';
import obsidianWaterBackdrop from './assets/images/obsidian_liquid_water_backdrop_1795331436634.jpg';
import { AnalyticsView } from './components/AnalyticsView';
import { AppSidebar } from './components/AppSidebar';
import { CalibrationView } from './components/CalibrationView';
import { ControlSidebar } from './components/ControlSidebar';
import { EarWaveformChart } from './components/EarWaveformChart';
import { IntervalBarsChart } from './components/IntervalBarsChart';
import { OpticalViewport } from './components/OpticalViewport';
import { RadialGaugesPanel } from './components/RadialGaugesPanel';
import { TelemetryStrip } from './components/TelemetryStrip';
import { UserLogsView } from './components/UserLogsView';
import { apiClient } from './services/apiClient';
import { faceLandmarkerService } from './services/faceLandmarkerService';
import type {
  AppTab,
  CalibrationConfig,
  DriverProfile,
  DrowsinessLogEvent,
  EarSample,
  EventSeverity,
  EventType,
  InputSourceMode,
  MonitoringSession,
  SimulatorScenario,
  TelemetryFrame,
} from './types/telemetry';
import { audioAlert } from './utils/audioAlert';

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

const INITIAL_TELEMETRY: TelemetryFrame = {
  faceDetected: false,
  leftEar: 0,
  rightEar: 0,
  avgEar: 0,
  mar: 0,
  headPitch: 0,
  headYaw: 0,
  perclos: 0,
  blinkRatePerMin: 0,
  totalBlinks: 0,
  eyeClosedDurationMs: 0,
  yawnDurationMs: 0,
  nodDurationMs: 0,
  state: 'no_face',
  stateReason: 'Initializing facial landmarker',
  landmarks: [],
  fps: 0,
};

const TAB_TITLES: Record<AppTab, string> = {
  monitor: 'Live Monitor',
  analytics: 'EAR Analytics',
  logs: 'User Logs',
  calibration: 'Calibration',
};

const EVENT_LABELS: Record<EventType, string> = {
  microsleep: 'Microsleep Critical Alert',
  fatigue_warning: 'Fatigue Closure Warning',
  yawn_detected: 'Yawn Signature Detected',
  head_nod: 'Forward Head Nod Alert',
  perclos_alert: 'PERCLOS Limit Exceeded',
  session_start: 'Monitoring Session Started',
  session_end: 'Monitoring Session Ended',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('monitor');
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [activeDriverId, setActiveDriverId] = useState<string>('drv-01');
  const [sessions, setSessions] = useState<MonitoringSession[]>([]);
  const [events, setEvents] = useState<DrowsinessLogEvent[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(true);
  const [globalSearch, setGlobalSearch] = useState<string>('');

  const [calibration, setCalibration] = useState<CalibrationConfig>(DEFAULT_CALIBRATION);
  const [sourceMode, setSourceMode] = useState<InputSourceMode>('samples');
  const [activeSampleId, setActiveSampleId] = useState<string>('sample-alert');
  const [uploadedMedia, setUploadedMedia] = useState<{
    url: string;
    kind: 'image' | 'video';
    name: string;
  } | null>(null);

  const [simulatorScenario, setSimulatorScenario] = useState<SimulatorScenario>('alert');
  const [manualSim, setManualSim] = useState({
    eyeOpenness: 0.85,
    mouthOpenness: 0.08,
    pitchDeg: 0,
  });

  const [telemetry, setTelemetry] = useState<TelemetryFrame>(INITIAL_TELEMETRY);
  const [waveformSamples, setWaveformSamples] = useState<EarSample[]>([]);

  const [sessionActive, setSessionActive] = useState<boolean>(false);
  const [activeSession, setActiveSession] = useState<MonitoringSession | null>(null);

  const lastWaveformPushRef = useRef(0);
  const lastLogByTypeRef = useRef<Record<string, number>>({});
  const sessionStatsRef = useRef({
    minEar: 0.45,
    earSum: 0,
    earCount: 0,
    peakPerclos: 0,
    alertCount: 0,
    criticalCount: 0,
    yawnCount: 0,
    totalBlinks: 0,
  });

  const stateRef = useRef({
    activeDriverId,
    drivers,
    calibration,
    sourceMode,
    sessionActive,
    activeSession,
  });
  stateRef.current = {
    activeDriverId,
    drivers,
    calibration,
    sourceMode,
    sessionActive,
    activeSession,
  };

  // Load initial persistent backend state
  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      setLoadingLogs(true);
      try {
        const [dList, sList, eList, cal] = await Promise.all([
          apiClient.getDrivers(),
          apiClient.getSessions(),
          apiClient.getEvents(),
          apiClient.getCalibration(),
        ]);
        if (!mounted) return;
        setDrivers(dList);
        if (dList.length > 0) setActiveDriverId(dList[0].id);
        setSessions(sList);
        setEvents(eList);
        setCalibration(cal);
        // Pre-warm MediaPipe video landmarker in the background so switching to Webcam starts fast
        window.setTimeout(() => faceLandmarkerService.prewarmVideoLandmarker(), 600);
      } catch (err) {
        console.error('Failed to load initial telemetry store:', err);
      } finally {
        if (mounted) setLoadingLogs(false);
      }
    };
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  // Persist calibration changes debounced and clean up pending timers on unmount
  const calTimerRef = useRef<number | null>(null);
  const uploadedUrlRef = useRef<string | null>(null);
  uploadedUrlRef.current = uploadedMedia?.url ?? null;

  useEffect(() => {
    return () => {
      if (calTimerRef.current) window.clearTimeout(calTimerRef.current);
      if (uploadedUrlRef.current) URL.revokeObjectURL(uploadedUrlRef.current);
    };
  }, []);

  // Reset waveform buffer cleanly whenever switching optical input source
  useEffect(() => {
    setWaveformSamples([]);
  }, [sourceMode]);

  const handleCalibrationChange = useCallback((next: CalibrationConfig) => {
    setCalibration(next);
    if (calTimerRef.current) window.clearTimeout(calTimerRef.current);
    calTimerRef.current = window.setTimeout(() => {
      void apiClient.saveCalibration(next).catch(() => {});
    }, 300);
  }, []);

  const activeDriver = useMemo(
    () => drivers.find((d) => d.id === activeDriverId) ?? drivers[0],
    [drivers, activeDriverId]
  );

  const handleToggleSession = useCallback(async () => {
    audioAlert.unlock();
    if (!sessionActive) {
      const driver = activeDriver ?? drivers[0];
      if (!driver) return;
      try {
        const created = await apiClient.startSession({
          driverId: driver.id,
          sourceMode,
          earThreshold: calibration.earThreshold,
        });
        sessionStatsRef.current = {
          minEar: 0.45,
          earSum: 0,
          earCount: 0,
          peakPerclos: 0,
          alertCount: 0,
          criticalCount: 0,
          yawnCount: 0,
          totalBlinks: telemetry.totalBlinks,
        };
        setActiveSession(created);
        setSessions((prev) => [created, ...prev]);
        setSessionActive(true);

        const startEvent = await apiClient.createEvent({
          sessionId: created.id,
          driverId: driver.id,
          driverName: driver.name,
          vehicleUnit: driver.vehicleUnit,
          timestamp: new Date().toISOString(),
          type: 'session_start',
          severity: 'info',
          earValue: telemetry.faceDetected ? telemetry.avgEar : driver.baselineEar,
          marValue: telemetry.mar,
          perclos: telemetry.perclos,
          headPitch: telemetry.headPitch,
          durationMs: 0,
          sourceMode,
          acknowledged: true,
          acknowledgedAt: new Date().toISOString(),
          ackLatencyMs: 0,
          notes: `Monitoring session started (${sourceMode} feed, EAR threshold ${calibration.earThreshold.toFixed(2)}).`,
        });
        setEvents((prev) => [startEvent, ...prev]);
      } catch (err) {
        console.error('Failed to start session:', err);
      }
    } else {
      if (activeSession) {
        const st = sessionStatsRef.current;
        const avgEar = st.earCount > 0 ? st.earSum / st.earCount : 0.28;
        const endedIso = new Date().toISOString();
        try {
          const updated = await apiClient.updateSession(activeSession.id, {
            endedAt: endedIso,
            totalBlinks: Math.max(0, telemetry.totalBlinks - st.totalBlinks),
            alertCount: st.alertCount,
            criticalCount: st.criticalCount,
            yawnCount: st.yawnCount,
            minEar: st.earCount > 0 ? st.minEar : 0.25,
            avgEar,
            peakPerclos: st.peakPerclos,
          });
          setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));

          const driver =
            drivers.find((d) => d.id === activeSession.driverId) ?? activeDriver ?? drivers[0];
          if (driver) {
            const endEvent = await apiClient.createEvent({
              sessionId: activeSession.id,
              driverId: driver.id,
              driverName: driver.name,
              vehicleUnit: driver.vehicleUnit,
              timestamp: endedIso,
              type: 'session_end',
              severity: 'info',
              earValue: telemetry.faceDetected ? telemetry.avgEar : avgEar,
              marValue: telemetry.mar,
              perclos: st.peakPerclos,
              headPitch: telemetry.headPitch,
              durationMs: Math.max(
                0,
                new Date(endedIso).getTime() - new Date(activeSession.startedAt).getTime()
              ),
              sourceMode,
              acknowledged: true,
              acknowledgedAt: endedIso,
              ackLatencyMs: 0,
              notes: `Monitoring session ended (avg EAR ${avgEar.toFixed(3)}, peak PERCLOS ${st.peakPerclos.toFixed(1)}%).`,
            });
            setEvents((prev) => [endEvent, ...prev]);
          }
        } catch (err) {
          console.error('Failed to finalize session:', err);
        }
      }
      setSessionActive(false);
      setActiveSession(null);
    }
  }, [sessionActive, activeDriver, drivers, sourceMode, calibration.earThreshold, telemetry, activeSession]);

  const logTelemetryEvent = useCallback(
    async (
      type: EventType,
      severity: EventSeverity,
      frame: TelemetryFrame,
      durationMs: number,
      notes: string
    ): Promise<DrowsinessLogEvent | null> => {
      const { activeDriverId: dId, drivers: dList, sourceMode: src, activeSession: ses } =
        stateRef.current;
      const driver = dList.find((d) => d.id === dId) ?? dList[0];
      if (!driver) return null;

      try {
        const nowIso = new Date().toISOString();
        const created = await apiClient.createEvent({
          sessionId: ses?.id ?? 'ses-live',
          driverId: driver.id,
          driverName: driver.name,
          vehicleUnit: driver.vehicleUnit,
          timestamp: nowIso,
          type,
          severity,
          earValue: frame.avgEar,
          marValue: frame.mar,
          perclos: frame.perclos,
          headPitch: frame.headPitch,
          durationMs,
          sourceMode: src,
          acknowledged: true,
          acknowledgedAt: nowIso,
          ackLatencyMs: 0,
          notes,
        });
        setEvents((prev) => [created, ...prev]);
        return created;
      } catch (err) {
        console.error('Failed to record event:', err);
        return null;
      }
    },
    []
  );

  // Continuous real-time telemetry handler (auto-logs & plays real-time alerts with zero acknowledge prompts)
  const handleTelemetrySample = useCallback(
    (frame: TelemetryFrame) => {
      setTelemetry(frame);

      const now = Date.now();
      const { calibration: cal, sessionActive: isRecording } = stateRef.current;

      if (frame.faceDetected && now - lastWaveformPushRef.current >= 65) {
        lastWaveformPushRef.current = now;
        setWaveformSamples((prev) => {
          const next = [
            ...prev,
            {
              t: now,
              leftEar: frame.leftEar,
              rightEar: frame.rightEar,
              avgEar: frame.avgEar,
              mar: frame.mar,
              pitch: frame.headPitch,
              perclos: frame.perclos,
              state: frame.state,
            },
          ];
          return next.length > 120 ? next.slice(next.length - 120) : next;
        });
      }

      if (isRecording && frame.faceDetected) {
        const st = sessionStatsRef.current;
        st.minEar = Math.min(st.minEar, frame.avgEar);
        st.earSum += frame.avgEar;
        st.earCount += 1;
        st.peakPerclos = Math.max(st.peakPerclos, frame.perclos);
      }

      if (frame.state === 'critical' || frame.state === 'warning') {
        const isCritical = frame.state === 'critical';
        if (isCritical) {
          audioAlert.triggerCritical(
            cal.alarmVolume,
            cal.audioEnabled,
            cal.voiceEnabled,
            'Alert! Microsleep detected. Wake up.'
          );
        } else {
          audioAlert.triggerWarning(
            cal.alarmVolume,
            cal.audioEnabled,
            cal.voiceEnabled,
            frame.stateReason
          );
        }

        let eventType: EventType = 'fatigue_warning';
        let durationMs = frame.eyeClosedDurationMs;
        if (isCritical) {
          eventType = 'microsleep';
          durationMs = Math.max(frame.eyeClosedDurationMs, frame.nodDurationMs);
        } else if (frame.yawnDurationMs >= cal.yawnDurationSec * 1000) {
          eventType = 'yawn_detected';
          durationMs = frame.yawnDurationMs;
        } else if (frame.nodDurationMs >= 1000) {
          eventType = 'head_nod';
          durationMs = frame.nodDurationMs;
        } else if (frame.perclos >= cal.perclosAlertPct) {
          eventType = 'perclos_alert';
          durationMs = cal.perclosWindowSec * 1000;
        }

        const lastLogged = lastLogByTypeRef.current[eventType] ?? 0;
        const cooldownMs = eventType === 'perclos_alert' ? 15000 : 6000;
        if (now - lastLogged >= cooldownMs) {
          lastLogByTypeRef.current[eventType] = now;
          if (isRecording) {
            if (isCritical) sessionStatsRef.current.criticalCount += 1;
            else sessionStatsRef.current.alertCount += 1;
            if (eventType === 'yawn_detected') sessionStatsRef.current.yawnCount += 1;
          }
          void logTelemetryEvent(
            eventType,
            isCritical ? 'critical' : 'warning',
            frame,
            durationMs,
            frame.stateReason
          );
        }
      }
    },
    [logTelemetryEvent]
  );

  const handleCreateDriver = useCallback(
    async (payload: { name: string; licenseCode: string; vehicleUnit: string }) => {
      try {
        const driver = await apiClient.createDriver(payload);
        setDrivers((prev) => [driver, ...prev]);
        setActiveDriverId(driver.id);
      } catch (err) {
        console.error('Failed to create driver:', err);
        throw err;
      }
    },
    []
  );

  const handleRenameDriver = useCallback(async (driverId: string, name: string) => {
    try {
      const updated = await apiClient.updateDriver(driverId, { name });
      setDrivers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setSessions((prev) =>
        prev.map((s) => (s.driverId === updated.id ? { ...s, driverName: updated.name } : s))
      );
      setEvents((prev) =>
        prev.map((e) => (e.driverId === updated.id ? { ...e, driverName: updated.name } : e))
      );
      setActiveSession((prev) =>
        prev && prev.driverId === updated.id ? { ...prev, driverName: updated.name } : prev
      );
    } catch (err) {
      console.error('Failed to rename driver:', err);
      throw err;
    }
  }, []);

  const handleSaveBaselineToDriver = useCallback(async (driverId: string, baselineEar: number) => {
    try {
      const updated = await apiClient.updateDriver(driverId, { baselineEar });
      setDrivers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (err) {
      console.error('Failed to save driver baseline:', err);
    }
  }, []);

  const handleAutoCalibrate = useCallback(
    (baselineEar: number, recommendedThreshold: number) => {
      const { calibration: cal, activeDriverId: dId } = stateRef.current;
      handleCalibrationChange({
        ...cal,
        earThreshold: recommendedThreshold,
      });
      if (dId) {
        void handleSaveBaselineToDriver(dId, baselineEar);
      }
    },
    [handleCalibrationChange, handleSaveBaselineToDriver]
  );

  const handleUploadMedia = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    setUploadedMedia((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { url, kind, name: file.name };
    });
    setSourceMode('upload');
  }, []);

  const handleDeleteEvent = useCallback(async (id: string) => {
    try {
      await apiClient.deleteEvent(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  }, []);

  const handleClearEvents = useCallback(async (driverId?: string) => {
    try {
      await apiClient.clearEvents(driverId);
      if (driverId && driverId !== 'all') {
        setEvents((prev) => prev.filter((e) => e.driverId !== driverId));
      } else {
        setEvents([]);
      }
    } catch (err) {
      console.error('Failed to clear events:', err);
    }
  }, []);

  // Build driver roster summary for bottom-left glass table (matching reference CS Leaderboard)
  const driverRoster = useMemo(() => {
    return drivers.map((d) => {
      const dEvents = events.filter((e) => e.driverId === d.id);
      const isCurrent = d.id === activeDriverId;
      const earReading =
        isCurrent && telemetry.faceDetected ? telemetry.avgEar : d.baselineEar;
      const alertScore = Math.max(
        18,
        Math.min(
          100,
          Math.round(
            (earReading / Math.max(0.24, d.baselineEar)) * 100 -
              dEvents.filter((e) => e.severity === 'critical').length * 10
          )
        )
      );
      return {
        driver: d,
        isCurrent,
        earReading,
        eventCount: dEvents.length,
        alertScore,
      };
    });
  }, [drivers, events, activeDriverId, telemetry.faceDetected, telemetry.avgEar]);

  return (
    <div className="min-h-screen app-ambient-canvas text-white flex flex-col lg:flex-row overflow-x-clip">
      {/* Full-Bleed Obsidian Black & Crystal-Clear Liquid Water Optical Backdrop */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <img
          src={obsidianWaterBackdrop}
          alt=""
          referrerPolicy="no-referrer"
          className="liquid-backdrop-img w-full h-full object-cover opacity-85"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 85% 75% at 50% 45%, rgba(0, 0, 0, 0.22) 0%, rgba(2, 2, 4, 0.56) 65%, rgba(0, 0, 0, 0.82) 100%)',
          }}
        />
      </div>

      {/* Floating Obsidian Liquid Crystal Navigation Dock */}
      <div className="relative z-10 p-3 pb-0 lg:p-4 lg:pr-0 shrink-0">
        <AppSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          sessionActive={sessionActive}
          onToggleSession={() => void handleToggleSession()}
          audioEnabled={calibration.audioEnabled}
          onToggleAudio={() => {
            audioAlert.unlock();
            handleCalibrationChange({ ...calibration, audioEnabled: !calibration.audioEnabled });
          }}
          onTestAlarm={() => {
            audioAlert.unlock();
            audioAlert.testAlarm(calibration.alarmVolume);
          }}
          liveState={telemetry.state}
          totalEvents={events.length}
        />
      </div>

      {/* Main Workspace Canvas */}
      <div className="relative z-10 flex-1 min-w-0 flex flex-col">
        {/* Floating Obsidian Liquid Water Top Utility Capsule */}
        <div className="px-4 sm:px-6 pt-4 max-w-[1520px] w-full mx-auto">
          <header className="glass-panel rounded-[24px] lg:rounded-full px-5 py-3 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-medium text-white/65">
              <span>VigilanceEAR</span>
              <span aria-hidden="true" className="text-white/30">/</span>
              <span className="text-white font-semibold">{TAB_TITLES[activeTab]}</span>
              {sessionActive && (
                <>
                  <span aria-hidden="true" className="text-white/30">·</span>
                  <span className="font-mono text-white">Session {activeSession?.id}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (globalSearch.trim()) setActiveTab('logs');
                }}
                className="relative"
              >
                <Search className="w-3.5 h-3.5 text-white/55 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="Search..."
                  className="glass-well rounded-full pl-9 pr-4 py-1.5 text-xs text-white placeholder:text-white/45 w-44 sm:w-56 focus:outline-none focus:ring-2 focus:ring-white/65"
                />
              </form>

              <button
                type="button"
                onClick={() => setActiveTab('calibration')}
                className="glass-option inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium text-white cursor-pointer whitespace-nowrap"
              >
                <span className="w-5 h-5 rounded-full ember-icon-tile flex items-center justify-center shrink-0">
                  <User className="w-3 h-3 text-white" />
                </span>
                <span className="truncate max-w-[130px]">{activeDriver?.name ?? 'Driver'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleToggleSession()}
                className={`lg:hidden px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap cursor-pointer text-white ${
                  sessionActive ? 'liquid-cta-danger' : 'liquid-cta'
                }`}
              >
                {sessionActive ? 'End Session' : 'Start Session'}
              </button>
            </div>
          </header>
        </div>

        {/* Active View Content */}
        <main className="flex-1 px-4 sm:px-6 py-5 space-y-5 max-w-[1520px] w-full mx-auto">
          {(activeTab === 'monitor' || activeTab === 'calibration' || sessionActive) && (
            <div
              aria-hidden={activeTab !== 'monitor'}
              className={
                activeTab === 'monitor'
                  ? 'space-y-5'
                  : 'fixed -left-[9999px] top-0 w-[640px] opacity-0 pointer-events-none'
              }
            >
              {/* Row 1: 4-Column Liquid Glass KPI Strip */}
              <TelemetryStrip telemetry={telemetry} calibration={calibration} />

              {/* Row 2: Focal Optical Landmark Viewport + Real-Time Radial Gauges */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
                <div className="xl:col-span-8 flex flex-col">
                  <OpticalViewport
                    sourceMode={sourceMode}
                    onSourceModeChange={setSourceMode}
                    activeSampleId={activeSampleId}
                    uploadedMedia={uploadedMedia}
                    simulatorScenario={simulatorScenario}
                    manualSim={manualSim}
                    calibration={calibration}
                    telemetry={telemetry}
                    onTelemetrySample={handleTelemetrySample}
                    onAutoCalibrate={handleAutoCalibrate}
                  />
                </div>
                <div className="xl:col-span-4 flex flex-col justify-between">
                  <RadialGaugesPanel
                    telemetry={telemetry}
                    calibration={calibration}
                    activeDriver={activeDriver}
                    recentEventCount={events.length}
                  />
                </div>
              </div>

              {/* Row 3: Crystal Glass Option Blocks (Sources, Thresholds, Driver & Audio) */}
              <ControlSidebar
                drivers={drivers}
                activeDriverId={activeDriverId}
                onSelectDriver={setActiveDriverId}
                onRenameDriver={handleRenameDriver}
                onCreateDriver={handleCreateDriver}
                sourceMode={sourceMode}
                onSourceModeChange={setSourceMode}
                activeSampleId={activeSampleId}
                onSelectSample={setActiveSampleId}
                onUploadMedia={handleUploadMedia}
                uploadedFileName={uploadedMedia?.name ?? null}
                simulatorScenario={simulatorScenario}
                onScenarioChange={setSimulatorScenario}
                manualSim={manualSim}
                onManualSimChange={setManualSim}
                calibration={calibration}
                onCalibrationChange={handleCalibrationChange}
              />

              {/* Row 4: Dual Charts */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <div className="xl:col-span-7">
                  <EarWaveformChart
                    samples={waveformSamples}
                    earThreshold={calibration.earThreshold}
                    marThreshold={calibration.marThreshold}
                  />
                </div>
                <div className="xl:col-span-5">
                  <IntervalBarsChart
                    samples={waveformSamples}
                    telemetry={telemetry}
                    earThreshold={calibration.earThreshold}
                    marThreshold={calibration.marThreshold}
                  />
                </div>
              </div>

              {/* Row 5: Driver Roster Table + Real-Time Alert Stream */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                {/* Left: Driver Alertness Table */}
                <section className="xl:col-span-7 glass-panel rounded-[26px] p-5 overflow-hidden">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-sm font-display font-semibold text-white">
                        Active Fleet Driver Readiness
                      </h3>
                      <p className="text-xs text-white/55 mt-0.5">
                        Click any driver row to switch active monitoring profile
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('analytics')}
                      className="text-xs text-white/80 hover:text-white cursor-pointer whitespace-nowrap"
                    >
                      Full Analytics →
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/15 text-[11px] font-mono text-white/55">
                          <th className="py-2 pr-3 font-medium">Driver</th>
                          <th className="py-2 px-3 font-medium">Unit</th>
                          <th className="py-2 px-3 font-medium text-right">EAR</th>
                          <th className="py-2 pl-3 font-medium">Readiness</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10 text-xs">
                        {driverRoster.map((row) => (
                          <tr
                            key={row.driver.id}
                            onClick={() => setActiveDriverId(row.driver.id)}
                            className={`cursor-pointer transition-colors ${
                              row.isCurrent ? 'bg-white/[0.11]' : 'hover:bg-white/[0.06]'
                            }`}
                          >
                            <td className="py-3 pr-3 font-medium text-white whitespace-nowrap">
                              {row.driver.name}
                              {row.isCurrent && (
                                <span className="ml-2 text-[10px] font-mono text-white/85">
                                  ACTIVE
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 font-mono text-white/60 whitespace-nowrap">
                              {row.driver.vehicleUnit}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-white">
                              {row.earReading.toFixed(3)}
                            </td>
                            <td className="py-3 pl-3 w-40">
                              <div className="flex items-center gap-2.5">
                                <span className="font-mono tabular-nums text-white w-9">
                                  {row.alertScore}%
                                </span>
                                <div className="flex-1 h-1.5 rounded-full bg-white/15 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-zinc-400 via-zinc-200 to-white transition-all duration-200"
                                    style={{ width: `${row.alertScore}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Right: Continuous Real-Time Alert Stream */}
                <section className="xl:col-span-5 glass-panel rounded-[26px] p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div>
                        <h3 className="text-sm font-display font-semibold text-white">
                          Real-Time Alerts &amp; Events
                        </h3>
                        <p className="text-xs text-white/60 mt-0.5">
                          Updates automatically without acknowledgment prompts
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('logs')}
                        className="text-xs text-white/80 hover:text-white cursor-pointer whitespace-nowrap"
                      >
                        View All ({events.length}) →
                      </button>
                    </div>

                    {events.length === 0 ? (
                      <p className="text-xs text-white/60 py-6 text-center">
                        Live alerts will stream here automatically when drowsiness or yawn signatures occur.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {events.slice(0, 6).map((ev) => {
                          const isCrit = ev.severity === 'critical';
                          const isWarn = ev.severity === 'warning';
                          return (
                            <div key={ev.id} className="flex items-start gap-3">
                              <span
                                className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 backdrop-blur-md ${
                                  isCrit
                                    ? 'bg-rose-500/24 text-rose-200 border border-rose-400/45'
                                    : isWarn
                                      ? 'bg-amber-500/22 text-amber-200 border border-amber-400/45'
                                      : 'bg-white/[0.12] text-white border border-white/30'
                                }`}
                              >
                                {isCrit || isWarn ? (
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                ) : ev.type === 'session_start' ? (
                                  <Radio className="w-3.5 h-3.5" />
                                ) : (
                                  <Bell className="w-3.5 h-3.5" />
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-xs font-medium text-white truncate">
                                    {EVENT_LABELS[ev.type]} · {ev.driverName}
                                  </span>
                                  <span className="text-[11px] font-mono tabular-nums text-white/85 shrink-0">
                                    EAR {ev.earValue.toFixed(3)}
                                  </span>
                                </div>
                                <div className="text-[11px] font-mono text-white/55 mt-0.5 flex items-center gap-2">
                                  <span>
                                    {new Date(ev.timestamp).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit',
                                    })}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate">{ev.notes || ev.sourceMode}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <UserLogsView
              drivers={drivers}
              events={events}
              sessions={sessions}
              loading={loadingLogs}
              initialSearch={globalSearch}
              onDeleteEvent={handleDeleteEvent}
              onClearEvents={handleClearEvents}
            />
          )}

          {activeTab === 'calibration' && (
            <CalibrationView
              activeDriver={activeDriver}
              telemetry={telemetry}
              calibration={calibration}
              onCalibrationChange={handleCalibrationChange}
              onSaveBaselineToDriver={handleSaveBaselineToDriver}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView drivers={drivers} events={events} sessions={sessions} />
          )}
        </main>
      </div>
    </div>
  );
}
