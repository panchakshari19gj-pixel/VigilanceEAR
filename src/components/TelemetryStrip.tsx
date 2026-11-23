import { Activity, Eye, ScanFace, Timer } from 'lucide-react';
import type { CalibrationConfig, TelemetryFrame } from '../types/telemetry';

interface TelemetryStripProps {
  telemetry: TelemetryFrame;
  calibration: CalibrationConfig;
}

export function TelemetryStrip({ telemetry, calibration }: TelemetryStripProps) {
  const {
    faceDetected,
    leftEar,
    rightEar,
    avgEar,
    mar,
    headPitch,
    perclos,
    blinkRatePerMin,
    totalBlinks,
    eyeClosedDurationMs,
    state,
  } = telemetry;

  const earDelta = faceDetected ? avgEar - calibration.earThreshold : 0;
  const earDeltaText = !faceDetected
    ? 'No Lock'
    : state === 'critical'
      ? `Critical (${earDelta.toFixed(2)})`
      : state === 'warning'
        ? `Low (${earDelta >= 0 ? '+' : ''}${earDelta.toFixed(2)})`
        : `+${earDelta.toFixed(2)} above thr`;

  const earDeltaColor = !faceDetected
    ? 'text-white/50'
    : state === 'critical'
      ? 'text-rose-300'
      : state === 'warning'
        ? 'text-amber-300'
        : 'text-emerald-300';

  const perclosAlert = perclos >= calibration.perclosAlertPct;
  const perclosColor = perclosAlert
    ? 'text-rose-300'
    : perclos >= calibration.perclosAlertPct * 0.65
      ? 'text-amber-300'
      : 'text-white/60';

  const marActive = mar >= calibration.marThreshold;
  const pitchActive = Math.abs(headPitch) >= calibration.pitchThresholdDeg;

  const cards = [
    {
      label: 'Bilateral EAR',
      value: faceDetected ? avgEar.toFixed(3) : '—',
      unit: 'EAR',
      delta: earDeltaText,
      deltaColor: earDeltaColor,
      sub: `L ${faceDetected ? leftEar.toFixed(2) : '—'} · R ${faceDetected ? rightEar.toFixed(2) : '—'}`,
      icon: Eye,
      featuredCobalt: state !== 'critical' && state !== 'warning',
      alertTone: state === 'critical' ? 'critical' : state === 'warning' ? 'warning' : null,
    },
    {
      label: `PERCLOS (${calibration.perclosWindowSec}s)`,
      value: `${perclos.toFixed(1)}`,
      unit: '%',
      delta: perclosAlert ? 'Above Limit' : 'Within Limit',
      deltaColor: perclosColor,
      sub: `Closure ${(eyeClosedDurationMs / 1000).toFixed(2)}s · Max ${calibration.perclosAlertPct}%`,
      icon: Activity,
      featuredCobalt: false,
      alertTone: perclosAlert ? 'warning' : null,
    },
    {
      label: 'Blink Cadence',
      value: `${blinkRatePerMin.toFixed(0)}`,
      unit: '/min',
      delta: blinkRatePerMin > 28 ? 'Elevated' : 'Nominal',
      deltaColor: blinkRatePerMin > 28 ? 'text-amber-300' : 'text-white/60',
      sub: `Total ${totalBlinks} blinks · Norm 12–22/m`,
      icon: Timer,
      featuredCobalt: false,
      alertTone: null,
    },
    {
      label: 'MAR & Head Pitch',
      value: faceDetected ? `${mar.toFixed(2)}` : '—',
      unit: faceDetected ? `${headPitch > 0 ? '+' : ''}${headPitch.toFixed(0)}°` : 'deg',
      delta: marActive ? 'Yawn Open' : pitchActive ? 'Head Nod' : 'Aligned',
      deltaColor: marActive || pitchActive ? 'text-amber-300' : 'text-white/60',
      sub: `Yawn ≥ ${calibration.marThreshold.toFixed(2)} · Pitch ±${calibration.pitchThresholdDeg}°`,
      icon: ScanFace,
      featuredCobalt: false,
      alertTone: marActive || pitchActive ? 'warning' : null,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const badgeStyle =
          card.alertTone === 'critical'
            ? 'bg-gradient-to-b from-rose-500 to-rose-700 border border-rose-300/50 shadow-[0_10px_24px_-6px_rgba(244,63,94,0.55)]'
            : card.alertTone === 'warning'
              ? 'bg-gradient-to-b from-amber-500 to-amber-700 border border-amber-300/50 shadow-[0_10px_24px_-6px_rgba(245,158,11,0.48)]'
              : card.featuredCobalt
                ? 'crystal-stat-pill'
                : 'obsidian-stat-pill';

        return (
          <div
            key={card.label}
            className="glass-panel rounded-[24px] p-4 flex items-center justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-white/65 shrink-0" />
                <span className="text-xs font-medium text-white/70 truncate">{card.label}</span>
              </div>
              <div className={`mt-2 text-xs font-mono font-medium ${card.deltaColor}`}>
                {card.delta}
              </div>
              <div className="mt-1 text-[11px] font-mono tabular-nums text-white/50 truncate">
                {card.sub}
              </div>
            </div>

            {/* Signature Vertical Crystal-Water Readout Block */}
            <div
              className={`min-w-[78px] px-3 py-2.5 rounded-[18px] flex flex-col items-center justify-center shrink-0 text-center ${badgeStyle}`}
            >
              <span className="text-base font-mono font-bold tabular-nums text-white leading-tight">
                {card.value}
              </span>
              <span className="text-[10px] font-mono text-white/80 mt-0.5">{card.unit}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
