import { useMemo } from 'react';
import type { DriverProfile, DrowsinessLogEvent, MonitoringSession } from '../types/telemetry';

interface AnalyticsViewProps {
  drivers: DriverProfile[];
  events: DrowsinessLogEvent[];
  sessions: MonitoringSession[];
}

export function AnalyticsView({ drivers, events, sessions }: AnalyticsViewProps) {
  const stats = useMemo(() => {
    const byType = {
      microsleep: 0,
      fatigue_warning: 0,
      yawn_detected: 0,
      head_nod: 0,
      perclos_alert: 0,
    };

    events.forEach((e) => {
      if (e.type in byType) {
        byType[e.type as keyof typeof byType] += 1;
      }
    });

    const total = Math.max(1, events.length);

    const perDriver = drivers.map((d) => {
      const dEvents = events.filter((e) => e.driverId === d.id);
      const dSessions = sessions.filter((s) => s.driverId === d.id);
      const minEar =
        dEvents.length > 0 ? Math.min(...dEvents.map((e) => e.earValue)) : d.baselineEar;
      const criticalCount = dEvents.filter((e) => e.severity === 'critical').length;
      const safetyPct = Math.max(
        12,
        Math.min(100, Math.round(100 - criticalCount * 18 - dEvents.length * 4))
      );
      return {
        driver: d,
        sessionCount: dSessions.length,
        eventCount: dEvents.length,
        criticalCount,
        minEar,
        safetyPct,
      };
    });

    return { byType, total, perDriver };
  }, [drivers, events, sessions]);

  const breakdownRows = [
    { label: 'Microsleep Episodes', count: stats.byType.microsleep, color: 'from-red-600 to-rose-400' },
    { label: 'Fatigue Warnings', count: stats.byType.fatigue_warning, color: 'from-amber-500 to-amber-300' },
    { label: 'Yawn Signatures (MAR)', count: stats.byType.yawn_detected, color: 'from-zinc-500 to-white' },
    { label: 'Head Pitch Nods', count: stats.byType.head_nod, color: 'from-zinc-600 to-zinc-200' },
    { label: 'PERCLOS Thresholds', count: stats.byType.perclos_alert, color: 'from-zinc-400 to-white' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 glass-panel rounded-[26px] p-6">
          <h1 className="text-lg font-display font-semibold text-white">
            Eye Aspect Ratio (EAR) Landmark Geometry
          </h1>
          <p className="text-xs text-white/65 mt-1 leading-relaxed">
            Based on Soukupová &amp; Čech (2016), six anatomical landmarks per eye quantify vertical eyelid aperture relative to horizontal palpebral fissure width, remaining invariant to camera distance and slight head roll.
          </p>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
            <div className="glass-well rounded-2xl p-4 flex flex-col items-center">
              <svg viewBox="0 0 280 140" className="w-full max-w-[260px] h-auto">
                <path
                  d="M 30 70 Q 95 22 140 22 Q 185 22 250 70 Q 185 118 140 118 Q 95 118 30 70 Z"
                  fill="rgba(255, 255, 255, 0.08)"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
                <line
                  x1="30"
                  y1="70"
                  x2="250"
                  y2="70"
                  stroke="rgba(255, 255, 255, 0.42)"
                  strokeWidth="1.2"
                  strokeDasharray="4 3"
                />
                <line x1="95" y1="30" x2="95" y2="110" stroke="#D4D4D8" strokeWidth="1.6" />
                <line x1="185" y1="30" x2="185" y2="110" stroke="#D4D4D8" strokeWidth="1.6" />

                {[
                  { x: 30, y: 70, label: 'p₁', dx: -14, dy: 4 },
                  { x: 95, y: 30, label: 'p₂', dx: -6, dy: -10 },
                  { x: 185, y: 30, label: 'p₃', dx: -6, dy: -10 },
                  { x: 250, y: 70, label: 'p₄', dx: 8, dy: 4 },
                  { x: 185, y: 110, label: 'p₅', dx: -6, dy: 16 },
                  { x: 95, y: 110, label: 'p₆', dx: -6, dy: 16 },
                ].map((pt) => (
                  <g key={pt.label}>
                    <circle cx={pt.x} cy={pt.y} r="4.5" fill="#FFFFFF" stroke="#09090B" strokeWidth="1.5" />
                    <text
                      x={pt.x + pt.dx}
                      y={pt.y + pt.dy}
                      className="fill-white/90 text-[12px] font-mono"
                    >
                      {pt.label}
                    </text>
                  </g>
                ))}
              </svg>
              <span className="text-[11px] font-mono text-white/75 mt-2">
                L: [362, 385, 387, 263, 373, 380] · R: [33, 160, 158, 133, 153, 144]
              </span>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 glass-well rounded-2xl font-mono text-xs text-white">
                <div className="text-white/70 text-[11px] mb-1">Scalar EAR Equation</div>
                <div className="text-white font-semibold">
                  EAR = (||p₂ - p₆|| + ||p₃ - p₅||) / (2 · ||p₁ - p₄||)
                </div>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-white/15">
                  <span className="text-white/80">Nominal Alert State</span>
                  <span className="font-mono text-emerald-300">EAR &gt; 0.25</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/15">
                  <span className="text-white/80">Drowsy / Heavy Eyelids</span>
                  <span className="font-mono text-amber-200">0.20 – 0.25</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/15">
                  <span className="text-white/80">Microsleep Closure</span>
                  <span className="font-mono text-red-300">EAR &lt; 0.21 (&ge; 1.2s)</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-white/80">Yawn Mouth Aperture</span>
                  <span className="font-mono text-white">MAR &ge; 0.58</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lg:col-span-5 glass-panel rounded-[26px] p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-display font-semibold text-white">
              Logged Fatigue Event Distribution
            </h2>
            <p className="text-xs text-white/65 mt-1">
              Aggregate breakdown across {events.length} persisted real-time telemetry events.
            </p>

            <div className="mt-5 space-y-3.5">
              {breakdownRows.map((row) => {
                const pct = Math.round((row.count / stats.total) * 100);
                return (
                  <div key={row.label} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-white">{row.label}</span>
                      <span className="font-mono tabular-nums text-white/75">
                        {row.count} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 glass-well rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${row.color} rounded-full`}
                        style={{ width: `${Math.max(row.count > 0 ? 5 : 0, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/15 grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-white/70 block">Total Logged Events</span>
              <span className="text-xl font-mono font-bold tabular-nums text-white mt-0.5 block">
                {events.length}
              </span>
            </div>
            <div>
              <span className="text-xs text-white/70 block">Tracked Sessions</span>
              <span className="text-xl font-mono font-bold tabular-nums text-white mt-0.5 block">
                {sessions.length}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Per-Driver Safety Summary Table */}
      <section className="glass-panel rounded-[26px] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/15 bg-white/[0.04]">
          <h2 className="text-sm font-display font-semibold text-white">
            Driver Alertness &amp; Baseline Comparison
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/15 text-[11px] font-mono text-white/75">
                <th className="py-3 px-5 font-medium">Driver</th>
                <th className="py-3 px-5 font-medium">Vehicle Unit</th>
                <th className="py-3 px-5 font-medium text-right">Baseline EAR</th>
                <th className="py-3 px-5 font-medium text-right">Lowest EAR</th>
                <th className="py-3 px-5 font-medium text-right">Total Alerts</th>
                <th className="py-3 px-5 font-medium">Safety Index</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/12 text-xs">
              {stats.perDriver.map((row) => (
                <tr key={row.driver.id} className="hover:bg-white/[0.08] transition-colors">
                  <td className="py-3 px-5 font-medium text-white">
                    {row.driver.name}
                    <span className="ml-2 text-[11px] font-mono text-white/65">
                      {row.driver.licenseCode}
                    </span>
                  </td>
                  <td className="py-3 px-5 font-mono text-white/70">{row.driver.vehicleUnit}</td>
                  <td className="py-3 px-5 text-right font-mono tabular-nums text-white">
                    {row.driver.baselineEar.toFixed(3)}
                  </td>
                  <td className="py-3 px-5 text-right font-mono tabular-nums text-zinc-300">
                    {row.minEar.toFixed(3)}
                  </td>
                  <td className="py-3 px-5 text-right font-mono tabular-nums text-white">
                    {row.eventCount}
                  </td>
                  <td className="py-3 px-5 w-48">
                    <div className="flex items-center gap-3">
                      <span className="font-mono tabular-nums text-white w-9">
                        {row.safetyPct}%
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/15 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-zinc-400 via-zinc-200 to-white"
                          style={{ width: `${row.safetyPct}%` }}
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
    </div>
  );
}
