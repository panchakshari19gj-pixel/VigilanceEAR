import { useMemo, useState } from 'react';
import type { EarSample } from '../types/telemetry';

interface EarWaveformChartProps {
  samples: EarSample[];
  earThreshold: number;
  marThreshold: number;
}

export function EarWaveformChart({ samples, earThreshold, marThreshold }: EarWaveformChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 920;
  const height = 210;
  const padLeft = 42;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const yMax = 0.5;

  const { earPath, earAreaPath, marPath, marAreaPath, thresholdY, criticalBands, points } = useMemo(() => {
    const len = samples.length;
    const baseY = padTop + plotH;
    if (len === 0) {
      return {
        earPath: '',
        earAreaPath: '',
        marPath: '',
        marAreaPath: '',
        thresholdY: padTop + (1 - earThreshold / yMax) * plotH,
        criticalBands: [] as { x: number; w: number }[],
        points: [] as { x: number; earY: number; marY: number; sample: EarSample }[],
      };
    }

    const mapped = samples.map((s, i) => {
      const x = padLeft + (len === 1 ? plotW : (i / (len - 1)) * plotW);
      const earNorm = Math.max(0, Math.min(1, s.avgEar / yMax));
      const marNorm = Math.max(0, Math.min(1, (s.mar * 0.45) / yMax));
      return {
        x,
        earY: padTop + (1 - earNorm) * plotH,
        marY: padTop + (1 - marNorm) * plotH,
        sample: s,
      };
    });

    const earD = mapped
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.earY.toFixed(1)}`)
      .join(' ');
    const marD = mapped
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.marY.toFixed(1)}`)
      .join(' ');

    const firstX = mapped[0].x.toFixed(1);
    const lastX = mapped[mapped.length - 1].x.toFixed(1);
    const earArea = `${earD} L ${lastX} ${baseY.toFixed(1)} L ${firstX} ${baseY.toFixed(1)} Z`;
    const marArea = `${marD} L ${lastX} ${baseY.toFixed(1)} L ${firstX} ${baseY.toFixed(1)} Z`;

    const bands: { x: number; w: number }[] = [];
    const stepW = len > 1 ? plotW / (len - 1) : 4;
    let bandStart: number | null = null;
    mapped.forEach((pt, idx) => {
      if (pt.sample.state === 'critical' || pt.sample.state === 'warning') {
        if (bandStart === null) bandStart = pt.x;
      } else if (bandStart !== null) {
        bands.push({ x: bandStart, w: Math.max(stepW, pt.x - bandStart) });
        bandStart = null;
      }
      if (idx === mapped.length - 1 && bandStart !== null) {
        bands.push({ x: bandStart, w: Math.max(stepW, pt.x - bandStart) });
      }
    });

    return {
      earPath: earD,
      earAreaPath: earArea,
      marPath: marD,
      marAreaPath: marArea,
      thresholdY: padTop + (1 - Math.max(0, Math.min(1, earThreshold / yMax))) * plotH,
      criticalBands: bands,
      points: mapped,
    };
  }, [samples, earThreshold, plotH, plotW]);

  const hovered = hoverIdx !== null && points[hoverIdx] ? points[hoverIdx] : null;
  const yTicks = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5];

  return (
    <div className="glass-panel rounded-[26px] p-5 flex flex-col justify-between">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
        <div>
          <h3 className="text-sm font-display font-semibold text-white">
            EAR &amp; MAR Signal Overview
          </h3>
          <p className="text-xs text-white/75 mt-0.5">
            Live 120-frame eye aperture &amp; yawn waveform vs threshold ({earThreshold.toFixed(2)})
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-white/85">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-white inline-block" />
            Avg EAR
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-zinc-400 inline-block" />
            MAR (scaled)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t border-dashed border-amber-400 inline-block" />
            Threshold
          </span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[210px] select-none cursor-crosshair"
          onMouseMove={(e) => {
            if (points.length === 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * width;
            const clamped = Math.max(padLeft, Math.min(width - padRight, relX));
            const ratio = (clamped - padLeft) / plotW;
            const idx = Math.round(ratio * (points.length - 1));
            setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="earGlowFill" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.28" />
              <stop offset="65%" stopColor="#D4D4D8" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#09090B" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="marGlowFill" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#A1A1AA" stopOpacity="0.24" />
              <stop offset="70%" stopColor="#52525B" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#09090B" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => {
            const y = padTop + (1 - tick / yMax) * plotH;
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.16)"
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-white/75 text-[10px] font-mono tabular-nums"
                >
                  {tick.toFixed(1)}
                </text>
              </g>
            );
          })}

          {criticalBands.map((band, i) => (
            <rect
              key={i}
              x={band.x}
              y={padTop}
              width={band.w}
              height={plotH}
              fill="rgba(239, 68, 68, 0.16)"
            />
          ))}

          {marAreaPath && <path d={marAreaPath} fill="url(#marGlowFill)" />}
          {earAreaPath && <path d={earAreaPath} fill="url(#earGlowFill)" />}

          <line
            x1={padLeft}
            y1={thresholdY}
            x2={width - padRight}
            y2={thresholdY}
            stroke="#F59E0B"
            strokeWidth={1.2}
            strokeDasharray="4 4"
          />
          <text
            x={width - padRight - 4}
            y={thresholdY - 5}
            textAnchor="end"
            className="fill-amber-300 text-[10px] font-mono tabular-nums"
          >
            THR {earThreshold.toFixed(2)}
          </text>

          {marPath && (
            <path
              d={marPath}
              fill="none"
              stroke="#A1A1AA"
              strokeWidth={1.8}
              strokeLinejoin="round"
            />
          )}

          {earPath && (
            <path
              d={earPath}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={2.2}
              strokeLinejoin="round"
            />
          )}

          {hovered && (
            <g>
              <line
                x1={hovered.x}
                y1={padTop}
                x2={hovered.x}
                y2={height - padBottom}
                stroke="rgba(255, 255, 255, 0.35)"
                strokeWidth={1}
              />
              <circle cx={hovered.x} cy={hovered.earY} r={4} fill="#FFFFFF" stroke="#09090B" strokeWidth={1.5} />
              <circle cx={hovered.x} cy={hovered.marY} r={3.5} fill="#A1A1AA" stroke="#09090B" strokeWidth={1.2} />
            </g>
          )}

          <text x={padLeft} y={height - 6} className="fill-white/75 text-[10px] font-mono">
            -120 frames
          </text>
          <text x={width - padRight} y={height - 6} textAnchor="end" className="fill-white/75 text-[10px] font-mono">
            Live Stream (MAR Alert {marThreshold.toFixed(2)})
          </text>
        </svg>

        {hovered && (
          <div className="mt-2 flex flex-wrap items-center gap-4 px-3 py-1.5 glass-well rounded-lg text-xs font-mono tabular-nums text-zinc-200">
            <span>t: {new Date(hovered.sample.t).toLocaleTimeString()}</span>
            <span className="text-white font-semibold">Avg EAR: {hovered.sample.avgEar.toFixed(3)}</span>
            <span className="text-white/75">
              L/R: {hovered.sample.leftEar.toFixed(3)} / {hovered.sample.rightEar.toFixed(3)}
            </span>
            <span className="text-zinc-300">MAR: {hovered.sample.mar.toFixed(2)}</span>
            <span>PERCLOS: {hovered.sample.perclos.toFixed(1)}%</span>
            <span>Pitch: {hovered.sample.pitch.toFixed(1)}°</span>
          </div>
        )}
      </div>
    </div>
  );
}
