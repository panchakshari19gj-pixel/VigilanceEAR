import type { EarSample, TelemetryFrame } from '../types/telemetry';

interface IntervalBarsChartProps {
  samples: EarSample[];
  telemetry: TelemetryFrame;
  earThreshold: number;
  marThreshold: number;
}

export function IntervalBarsChart({
  samples,
  telemetry,
  earThreshold,
  marThreshold,
}: IntervalBarsChartProps) {
  const barCount = 10;
  const bars = Array.from({ length: barCount }, (_, idx) => {
    if (samples.length === 0) {
      return { value: 0, state: 'nominal' as const };
    }
    const sampleIdx = Math.min(
      samples.length - 1,
      Math.floor((idx / Math.max(1, barCount - 1)) * (samples.length - 1))
    );
    const s = samples[sampleIdx];
    return {
      value: s?.avgEar ?? 0,
      state: s?.state ?? 'nominal',
    };
  });

  const miniStats = [
    {
      label: 'Left EAR',
      value: telemetry.faceDetected ? telemetry.leftEar.toFixed(3) : '—',
      pct: Math.min(100, Math.round((telemetry.leftEar / 0.42) * 100)),
      accent: 'from-zinc-500 via-zinc-200 to-white',
    },
    {
      label: 'Right EAR',
      value: telemetry.faceDetected ? telemetry.rightEar.toFixed(3) : '—',
      pct: Math.min(100, Math.round((telemetry.rightEar / 0.42) * 100)),
      accent: 'from-zinc-500 via-zinc-200 to-white',
    },
    {
      label: 'Mouth MAR',
      value: telemetry.faceDetected ? telemetry.mar.toFixed(2) : '—',
      pct: Math.min(100, Math.round((telemetry.mar / 1.0) * 100)),
      accent:
        telemetry.mar >= marThreshold
          ? 'from-amber-500 to-rose-500'
          : 'from-white/45 to-white',
    },
    {
      label: 'Head Pitch',
      value: telemetry.faceDetected ? `${telemetry.headPitch.toFixed(1)}°` : '—',
      pct: Math.min(100, Math.round((Math.abs(telemetry.headPitch) / 35) * 100)),
      accent: 'from-zinc-400 to-white/95',
    },
  ];

  return (
    <div className="glass-panel rounded-[26px] p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-display font-semibold text-white">
            Eye Aperture Distribution
          </h3>
          <p className="text-xs text-white/60 mt-0.5">Live 10-interval EAR bar profile</p>
        </div>
        <span className="text-[11px] font-mono text-white/65 tabular-nums">
          THR {earThreshold.toFixed(2)}
        </span>
      </div>

      <div className="glass-well rounded-2xl px-4 py-4 h-[156px] flex items-end justify-between gap-2">
        {bars.map((bar, i) => {
          const heightPct = Math.max(10, Math.min(100, Math.round((bar.value / 0.42) * 100)));
          const barGradient =
            bar.state === 'critical' || bar.value < earThreshold
              ? 'bg-gradient-to-t from-rose-600 via-rose-400 to-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.48)]'
              : bar.state === 'warning'
                ? 'bg-gradient-to-t from-amber-500 via-amber-300 to-amber-100 shadow-[0_0_10px_rgba(245,158,11,0.42)]'
                : i % 2 === 0
                  ? 'bg-gradient-to-t from-zinc-500 via-zinc-200 to-white shadow-[0_0_12px_rgba(255,255,255,0.34)]'
                  : 'bg-gradient-to-t from-white/30 via-white/75 to-white shadow-[0_0_10px_rgba(255,255,255,0.22)]';

          return (
            <div key={i} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5">
              <div
                className={`w-2 sm:w-2.5 rounded-full transition-all duration-150 ${barGradient}`}
                style={{ height: `${heightPct}%` }}
                title={`EAR ${bar.value.toFixed(3)}`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {miniStats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <div className="text-[11px] text-white/60 truncate">{stat.label}</div>
            <div className="text-sm font-mono font-semibold tabular-nums text-white mt-0.5">
              {stat.value}
            </div>
            <div className="mt-1.5 h-1 w-full rounded-full bg-white/15 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${stat.accent} transition-all duration-150`}
                style={{ width: `${Math.max(6, stat.pct)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
