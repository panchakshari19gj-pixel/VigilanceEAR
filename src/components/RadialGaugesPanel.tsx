import type { CalibrationConfig, DriverProfile, TelemetryFrame } from '../types/telemetry';

interface RadialGaugesPanelProps {
  telemetry: TelemetryFrame;
  calibration: CalibrationConfig;
  activeDriver: DriverProfile | undefined;
  recentEventCount: number;
}

export function RadialGaugesPanel({
  telemetry,
  calibration,
  activeDriver,
  recentEventCount,
}: RadialGaugesPanelProps) {
  const baseline = activeDriver?.baselineEar ?? 0.30;

  const alertnessPct = (() => {
    if (!telemetry.faceDetected) return 0;
    const earScore = Math.max(
      0,
      Math.min(
        1,
        (telemetry.avgEar - (calibration.earThreshold - 0.08)) /
          (baseline - (calibration.earThreshold - 0.08))
      )
    );
    const perclosPenalty = Math.min(0.45, (telemetry.perclos / 100) * 1.1);
    const marPenalty = telemetry.mar >= calibration.marThreshold ? 0.22 : 0;
    const pitchPenalty = Math.abs(telemetry.headPitch) >= calibration.pitchThresholdDeg ? 0.18 : 0;
    const raw = (earScore * 0.92 + 0.08 - perclosPenalty - marPenalty - pitchPenalty) * 100;
    return Math.round(Math.max(0, Math.min(100, raw)));
  })();

  const flowScore = telemetry.faceDetected ? Number((alertnessPct / 10).toFixed(1)) : 0;

  const r1 = 54;
  const semiCircumference = Math.PI * r1;
  const dashOffset1 = semiCircumference * (1 - alertnessPct / 100);

  const r2 = 46;
  const fullCirc2 = 2 * Math.PI * r2;
  const arcLen2 = fullCirc2 * 0.75;
  const dashOffset2 = arcLen2 * (1 - flowScore / 10);

  const stateHeadline = !telemetry.faceDetected
    ? 'Awaiting Face'
    : telemetry.state === 'critical'
      ? 'Critical Drowsiness'
      : telemetry.state === 'warning'
        ? 'Fatigue Warning'
        : 'Nominal Alertness';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
      {/* Gauge 1: Real-Time Alertness Index */}
      <div className="glass-panel rounded-[26px] p-5 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-display font-semibold text-white">Alertness Index</h3>
          <span
            className={`text-[11px] font-mono font-medium ${
              telemetry.state === 'critical'
                ? 'text-rose-400'
                : telemetry.state === 'warning'
                  ? 'text-amber-300'
                  : 'text-emerald-300'
            }`}
          >
            {stateHeadline}
          </span>
        </div>

        <div className="mt-2 flex flex-col items-center">
          <svg viewBox="0 0 150 92" className="w-full max-w-[190px] h-auto overflow-visible">
            <defs>
              <linearGradient id="alertnessArcGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#52525B" />
                <stop offset="55%" stopColor="#D4D4D8" />
                <stop offset="100%" stopColor="#FFFFFF" />
              </linearGradient>
            </defs>
            <path
              d="M 21 76 A 54 54 0 0 1 129 76"
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="10"
              strokeLinecap="round"
            />
            <path
              d="M 21 76 A 54 54 0 0 1 129 76"
              fill="none"
              stroke="url(#alertnessArcGrad)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={semiCircumference}
              strokeDashoffset={dashOffset1}
              className="transition-[stroke-dashoffset] duration-200"
            />
          </svg>

          <div className="-mt-7 text-center">
            <div className="text-2xl font-mono font-bold tabular-nums text-white">
              {alertnessPct}%
            </div>
            <div className="text-[11px] text-white/60 mt-0.5">
              Live EAR vs {baseline.toFixed(2)} baseline
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-white/55">
          <span>0%</span>
          <span>Live Optic Score</span>
          <span>100%</span>
        </div>
      </div>

      {/* Gauge 2: Vigilance Score + Obsidian Glass Stat Wells */}
      <div className="glass-panel rounded-[26px] p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-display font-semibold text-white">Vigilance Telemetry</h3>
          <span className="text-[11px] font-mono text-white/55">Real-Time</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2.5 flex-1 min-w-0">
            <div className="glass-well rounded-2xl px-3.5 py-2.5">
              <div className="text-[11px] text-white/60">Eye Closure</div>
              <div className="text-sm font-mono font-semibold tabular-nums text-white mt-0.5">
                {(telemetry.eyeClosedDurationMs / 1000).toFixed(2)} sec
              </div>
            </div>
            <div className="glass-well rounded-2xl px-3.5 py-2.5">
              <div className="text-[11px] text-white/60">Logged Alerts</div>
              <div className="text-sm font-mono font-semibold tabular-nums text-white/90 mt-0.5">
                {recentEventCount} events
              </div>
            </div>
          </div>

          <div className="relative w-[112px] h-[112px] shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 112 112" className="w-full h-full -rotate-[225deg]">
              <defs>
                <linearGradient id="flowScoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="48%" stopColor="#D4D4D8" />
                  <stop offset="100%" stopColor="#52525B" />
                </linearGradient>
              </defs>
              <circle
                cx="56"
                cy="56"
                r={r2}
                fill="none"
                stroke="rgba(255, 255, 255, 0.12)"
                strokeWidth="9"
                strokeDasharray={`${arcLen2} ${fullCirc2}`}
                strokeLinecap="round"
              />
              <circle
                cx="56"
                cy="56"
                r={r2}
                fill="none"
                stroke="url(#flowScoreGrad)"
                strokeWidth="9"
                strokeDasharray={`${arcLen2} ${fullCirc2}`}
                strokeDashoffset={dashOffset2}
                strokeLinecap="round"
                className="transition-[stroke-dashoffset] duration-200"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-mono font-bold tabular-nums text-white leading-none">
                {flowScore.toFixed(1)}
              </span>
              <span className="text-[10px] text-white/60 mt-1">Focus Score</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
