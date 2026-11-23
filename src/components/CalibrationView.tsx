import { useEffect, useRef, useState } from 'react';
import { Check, Sliders } from 'lucide-react';
import type { CalibrationConfig, DriverProfile, TelemetryFrame } from '../types/telemetry';

interface CalibrationViewProps {
  activeDriver: DriverProfile | undefined;
  telemetry: TelemetryFrame;
  calibration: CalibrationConfig;
  onCalibrationChange: (next: CalibrationConfig) => void;
  onSaveBaselineToDriver: (driverId: string, baselineEar: number) => Promise<void>;
}

export function CalibrationView({
  activeDriver,
  telemetry,
  calibration,
  onCalibrationChange,
  onSaveBaselineToDriver,
}: CalibrationViewProps) {
  const [calibrating, setCalibrating] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [capturedMean, setCapturedMean] = useState<number | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);

  const samplesRef = useRef<number[]>([]);
  const latestEarRef = useRef({ faceDetected: telemetry.faceDetected, avgEar: telemetry.avgEar });
  latestEarRef.current = { faceDetected: telemetry.faceDetected, avgEar: telemetry.avgEar };

  useEffect(() => {
    if (!calibrating) return;
    samplesRef.current = [];
    setProgressPct(0);
    setCapturedMean(null);
    setSavedBanner(false);

    const start = Date.now();
    const duration = 4000;
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgressPct(pct);

      if (latestEarRef.current.faceDetected && latestEarRef.current.avgEar > 0.1) {
        samplesRef.current.push(latestEarRef.current.avgEar);
      }

      if (elapsed >= duration) {
        window.clearInterval(interval);
        setCalibrating(false);
        if (samplesRef.current.length > 0) {
          const mean =
            samplesRef.current.reduce((acc, v) => acc + v, 0) / samplesRef.current.length;
          setCapturedMean(Number(mean.toFixed(3)));
        } else {
          setCapturedMean(0.30);
        }
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [calibrating]);

  const recommendedThreshold = capturedMean ? Number((capturedMean * 0.72).toFixed(2)) : null;

  const handleApplyBaseline = async () => {
    if (!capturedMean || !recommendedThreshold || !activeDriver) return;
    onCalibrationChange({
      ...calibration,
      earThreshold: Math.max(0.15, Math.min(0.3, recommendedThreshold)),
    });
    await onSaveBaselineToDriver(activeDriver.id, capturedMean);
    setSavedBanner(true);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <section className="lg:col-span-7 glass-panel rounded-[26px] p-6 space-y-5">
        <div>
          <h1 className="text-lg font-display font-semibold text-white">
            Personal Open-Eye EAR Baseline Calibration
          </h1>
          <p className="text-xs text-white/65 mt-1 leading-relaxed">
            Natural eyelid aperture varies across drivers (0.24 to 0.38 EAR). Calibrating a 4-second open-eye baseline sets the microsleep closure threshold at 72% of the driver&apos;s natural open-eye EAR.
          </p>
        </div>

        <div className="glass-well rounded-2xl p-4 grid grid-cols-3 gap-4">
          <div>
            <span className="text-xs text-white/65 block">Driver Profile</span>
            <span className="text-sm font-medium text-white mt-1 block">
              {activeDriver?.name ?? 'Default Driver'}
            </span>
          </div>
          <div>
            <span className="text-xs text-white/65 block">Stored Baseline EAR</span>
            <span className="text-lg font-mono font-bold tabular-nums text-white mt-0.5 block">
              {activeDriver ? activeDriver.baselineEar.toFixed(3) : '0.300'}
            </span>
          </div>
          <div>
            <span className="text-xs text-white/65 block">Live Sensor EAR</span>
            <span className="text-lg font-mono font-bold tabular-nums text-white mt-0.5 block">
              {telemetry.faceDetected ? telemetry.avgEar.toFixed(3) : 'No Lock'}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-white/80">
            <span>{calibrating ? 'Sampling open-eye landmarks...' : 'Ready to sample'}</span>
            <span className="tabular-nums">{Math.round(progressPct)}%</span>
          </div>
          <div className="w-full h-2.5 glass-well rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-zinc-400 via-zinc-200 to-white transition-all duration-100"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCalibrating(true)}
              disabled={calibrating}
              className="liquid-cta inline-flex items-center gap-2 px-5 py-2.5 disabled:opacity-50 text-white font-semibold text-xs rounded-full cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{calibrating ? 'Measuring (Keep Eyes Open)...' : 'Run 4s Baseline Capture'}</span>
            </button>

            {capturedMean !== null && recommendedThreshold !== null && (
              <button
                type="button"
                onClick={handleApplyBaseline}
                className="glass-option-active inline-flex items-center gap-2 px-5 py-2.5 text-white font-semibold text-xs rounded-full cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply Recommended Threshold ({recommendedThreshold.toFixed(2)})</span>
              </button>
            )}
          </div>

          {capturedMean !== null && (
            <div className="p-3 glass-well rounded-xl text-xs font-mono text-zinc-200">
              Measured Open-Eye Mean:{' '}
              <strong className="text-white">{capturedMean.toFixed(3)} EAR</strong> · Recommended
              Threshold (0.72×):{' '}
              <strong className="text-white">{recommendedThreshold?.toFixed(2)} EAR</strong>
            </div>
          )}

          {savedBanner && (
            <div className="text-xs text-emerald-400 font-medium">
              ✓ Baseline EAR and threshold saved to driver profile and backend configuration.
            </div>
          )}
        </div>
      </section>

      <section className="lg:col-span-5 glass-panel rounded-[26px] p-6 space-y-5">
        <div>
          <h2 className="text-base font-display font-semibold text-white">
            PERCLOS &amp; Escalation Windows
          </h2>
          <p className="text-xs text-white/65 mt-1">
            Configure the rolling window used to compute Percentage of Eyelid Closure (PERCLOS) and real-time warning escalation timing.
          </p>
        </div>

        <div className="space-y-3.5">
          <div className="glass-well rounded-xl p-3.5">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-zinc-200">PERCLOS Integration Window</span>
              <span className="font-mono tabular-nums text-white font-semibold">
                {calibration.perclosWindowSec} s
              </span>
            </div>
            <input
              type="range"
              min={15}
              max={120}
              step={5}
              value={calibration.perclosWindowSec}
              onChange={(e) =>
                onCalibrationChange({
                  ...calibration,
                  perclosWindowSec: parseInt(e.target.value, 10),
                })
              }
              className="w-full accent-white cursor-pointer"
            />
          </div>

          <div className="glass-well rounded-xl p-3.5">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-zinc-200">PERCLOS Warning Ceiling</span>
              <span className="font-mono tabular-nums text-white font-semibold">
                {calibration.perclosAlertPct}%
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={50}
              step={1}
              value={calibration.perclosAlertPct}
              onChange={(e) =>
                onCalibrationChange({
                  ...calibration,
                  perclosAlertPct: parseInt(e.target.value, 10),
                })
              }
              className="w-full accent-white cursor-pointer"
            />
          </div>

          <div className="glass-well rounded-xl p-3.5">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-zinc-200">Yawn Sustain Duration</span>
              <span className="font-mono tabular-nums text-white font-semibold">
                {calibration.yawnDurationSec.toFixed(1)} s
              </span>
            </div>
            <input
              type="range"
              min={0.6}
              max={3.0}
              step={0.1}
              value={calibration.yawnDurationSec}
              onChange={(e) =>
                onCalibrationChange({
                  ...calibration,
                  yawnDurationSec: parseFloat(e.target.value),
                })
              }
              className="w-full accent-white cursor-pointer"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
