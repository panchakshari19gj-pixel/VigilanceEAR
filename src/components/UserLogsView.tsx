import { useEffect, useMemo, useState } from 'react';
import { Download, Search, Trash2, X } from 'lucide-react';
import type {
  DriverProfile,
  DrowsinessLogEvent,
  EventSeverity,
  EventType,
  MonitoringSession,
} from '../types/telemetry';

interface UserLogsViewProps {
  drivers: DriverProfile[];
  events: DrowsinessLogEvent[];
  sessions: MonitoringSession[];
  loading: boolean;
  initialSearch?: string;
  onDeleteEvent: (id: string) => Promise<void>;
  onClearEvents: (driverId?: string) => Promise<void>;
}

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  microsleep: 'Microsleep Episode',
  fatigue_warning: 'Fatigue Warning',
  yawn_detected: 'Yawn Detected',
  head_nod: 'Head Pitch Nod',
  perclos_alert: 'PERCLOS Threshold',
  session_start: 'Session Started',
  session_end: 'Session Ended',
};

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatSessionDuration(startIso: string, endIso: string | null): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const diffSec = Math.max(0, Math.round((end - start) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }
  return `${mins}m ${secs}s`;
}

export function UserLogsView({
  drivers,
  events,
  sessions,
  loading,
  initialSearch = '',
  onDeleteEvent,
  onClearEvents,
}: UserLogsViewProps) {
  const [driverFilter, setDriverFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | EventSeverity>('all');
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [inspectedEvent, setInspectedEvent] = useState<DrowsinessLogEvent | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setSearchQuery(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    if (!inspectedEvent) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInspectedEvent(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inspectedEvent]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (driverFilter !== 'all' && ev.driverId !== driverFilter) return false;
      if (severityFilter !== 'all' && ev.severity !== severityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches =
          ev.driverName.toLowerCase().includes(q) ||
          ev.vehicleUnit.toLowerCase().includes(q) ||
          ev.notes.toLowerCase().includes(q) ||
          EVENT_TYPE_LABELS[ev.type].toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [events, driverFilter, severityFilter, searchQuery]);

  const filteredSessions = useMemo(() => {
    if (driverFilter === 'all') return sessions;
    return sessions.filter((s) => s.driverId === driverFilter);
  }, [sessions, driverFilter]);

  const handleExportCsv = () => {
    const headers = [
      'id',
      'timestamp',
      'driverName',
      'vehicleUnit',
      'type',
      'severity',
      'earValue',
      'marValue',
      'perclos',
      'headPitch',
      'durationMs',
      'sourceMode',
      'notes',
    ];
    const rows = filteredEvents.map((e) =>
      [
        e.id,
        e.timestamp,
        `"${e.driverName.replace(/"/g, '""')}"`,
        `"${e.vehicleUnit.replace(/"/g, '""')}"`,
        e.type,
        e.severity,
        e.earValue,
        e.marValue,
        e.perclos,
        e.headPitch,
        e.durationMs,
        e.sourceMode,
        `"${e.notes.replace(/"/g, '""')}"`,
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vigilance-ear-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(filteredEvents, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vigilance-ear-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header & Liquid Glass Filter Controls */}
      <div className="glass-panel rounded-[26px] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.14]">
          <div>
            <h1 className="text-lg font-display font-semibold text-white">
              Real-Time Driver Fatigue &amp; Alert Logs
            </h1>
            <p className="text-xs text-white/75 mt-0.5">
              Continuous live audit trail of Eye Aspect Ratio drops, yawns, head nods, and session history.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredEvents.length === 0}
              className="glass-option inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-40 rounded-full cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              disabled={filteredEvents.length === 0}
              className="glass-option inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-40 rounded-full cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                disabled={filteredEvents.length === 0}
                className="glass-option inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-red-200 hover:border-red-400/50 disabled:opacity-40 rounded-full cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Logs</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={async () => {
                    await onClearEvents(driverFilter);
                    setConfirmClear(false);
                  }}
                  className="liquid-cta-danger px-3.5 py-1.5 text-xs font-semibold text-white rounded-full cursor-pointer whitespace-nowrap"
                >
                  Confirm Clear
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-2.5 py-1.5 text-xs text-white/70 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-white/55 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search driver, vehicle unit, or telemetry note..."
              className="w-full glass-well rounded-full pl-9 pr-4 py-2 text-xs text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-white/65"
            />
          </div>

          <select
            aria-label="Filter by driver"
            value={driverFilter}
            onChange={(e) => setDriverFilter(e.target.value)}
            className="glass-well rounded-full px-4 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/65"
          >
            <option value="all" className="bg-[#09090b] text-white">
              All Drivers ({drivers.length})
            </option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id} className="bg-[#09090b] text-white">
                {d.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 glass-well rounded-full">
            {(['all', 'critical', 'warning', 'info'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`px-3.5 py-1 text-xs font-medium rounded-full capitalize cursor-pointer whitespace-nowrap ${
                  severityFilter === sev
                    ? 'glass-option-active text-white'
                    : 'text-white/65 hover:text-white'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Event Logs Table */}
      <div className="glass-panel rounded-[26px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/20 bg-white/[0.06] text-[11px] font-mono text-white/80">
                <th className="py-3 px-4 font-medium">Timestamp</th>
                <th className="py-3 px-4 font-medium">Driver &amp; Unit</th>
                <th className="py-3 px-4 font-medium">Real-Time Event</th>
                <th className="py-3 px-4 font-medium text-right">EAR</th>
                <th className="py-3 px-4 font-medium text-right">MAR</th>
                <th className="py-3 px-4 font-medium text-right">PERCLOS</th>
                <th className="py-3 px-4 font-medium text-right">Duration</th>
                <th className="py-3 px-4 font-medium">Source</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/15 text-xs">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={9} className="py-3 px-4">
                      <div className="h-4 bg-white/[0.06] rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 px-6 text-center text-white/75">
                    <p className="text-sm font-medium text-white">No matching fatigue events logged</p>
                    <p className="text-xs text-white/75 mt-1">
                      Real-time drowsiness, yawn, and head-nod alerts log here automatically during monitoring.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredEvents.map((ev) => {
                  const sevClass =
                    ev.severity === 'critical'
                      ? 'text-red-400'
                      : ev.severity === 'warning'
                        ? 'text-amber-300'
                        : 'text-white/90';
                  const sevGlyph =
                    ev.severity === 'critical' ? '✖' : ev.severity === 'warning' ? '▲' : '●';

                  return (
                    <tr key={ev.id} className="hover:bg-white/10 transition-colors">
                      <td className="py-3 px-4 font-mono tabular-nums text-white/85 whitespace-nowrap">
                        {new Date(ev.timestamp).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-white whitespace-nowrap">{ev.driverName}</div>
                        <div className="text-[11px] font-mono text-white/65 whitespace-nowrap">
                          {ev.vehicleUnit}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className={`font-medium whitespace-nowrap ${sevClass}`}>
                          {sevGlyph} {EVENT_TYPE_LABELS[ev.type]}
                        </div>
                        <div className="text-[11px] text-white/70 truncate max-w-[260px]">
                          {ev.notes || `Captured via ${ev.sourceMode}`}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-white">
                        {ev.earValue.toFixed(3)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-300">
                        {ev.marValue.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-white">
                        {ev.perclos.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-white/85 whitespace-nowrap">
                        {formatDurationMs(ev.durationMs)}
                      </td>
                      <td className="py-3 px-4 font-mono uppercase text-[11px] text-white/75 whitespace-nowrap">
                        {ev.sourceMode}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => setInspectedEvent(ev)}
                            className="text-xs text-white/85 hover:text-white cursor-pointer"
                          >
                            Inspect
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeleteEvent(ev.id)}
                            aria-label="Delete event"
                            className="text-white/65 hover:text-red-300 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monitoring Sessions History */}
      <div className="glass-panel rounded-[26px] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/20 bg-white/[0.06]">
          <h2 className="text-sm font-display font-semibold text-white">
            Driver Monitoring Sessions ({filteredSessions.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/20 text-[11px] font-mono text-white/80">
                <th className="py-2.5 px-4 font-medium">Started</th>
                <th className="py-2.5 px-4 font-medium">Driver</th>
                <th className="py-2.5 px-4 font-medium">Source</th>
                <th className="py-2.5 px-4 font-medium text-right">Duration</th>
                <th className="py-2.5 px-4 font-medium text-right">Blinks</th>
                <th className="py-2.5 px-4 font-medium text-right">Alerts / Crit</th>
                <th className="py-2.5 px-4 font-medium text-right">Min EAR</th>
                <th className="py-2.5 px-4 font-medium text-right">Peak PERCLOS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/15 text-xs">
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 px-4 text-center text-white/75">
                    No recorded sessions for this filter.
                  </td>
                </tr>
              ) : (
                filteredSessions.map((s) => (
                  <tr key={s.id} className="hover:bg-white/10 transition-colors">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-white/85 whitespace-nowrap">
                      {new Date(s.startedAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-medium text-white">{s.driverName}</span>
                      <span className="text-white/70 font-mono text-[11px] ml-2">
                        {s.vehicleUnit}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-white/75 uppercase text-[11px]">
                      {s.sourceMode}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-white/85">
                      {s.endedAt ? formatSessionDuration(s.startedAt, s.endedAt) : 'Live Now'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-white/85">
                      {s.totalBlinks}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      <span className="text-amber-200">{s.alertCount}</span>
                      <span className="text-white/45 mx-1">/</span>
                      <span className="text-red-300">{s.criticalCount}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-white">
                      {s.minEar.toFixed(3)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-white/85">
                      {s.peakPerclos.toFixed(1)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Event Telemetry Inspection Modal */}
      {inspectedEvent && (
        <div
          className="fixed inset-0 z-50 bg-black/72 backdrop-blur-xl flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Inspect telemetry event"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInspectedEvent(null);
          }}
        >
          <div className="glass-panel rounded-[28px] max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.14] pb-3">
              <div>
                <h3 className="text-base font-display font-semibold text-white">
                  {EVENT_TYPE_LABELS[inspectedEvent.type]}
                </h3>
                <p className="text-xs font-mono text-white/60 mt-0.5">
                  {inspectedEvent.id} · {new Date(inspectedEvent.timestamp).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedEvent(null)}
                aria-label="Close inspection dialog"
                className="glass-option w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 glass-well rounded-2xl">
                <span className="text-white/60 block">Driver</span>
                <span className="font-medium text-white mt-0.5 block">
                  {inspectedEvent.driverName}
                </span>
              </div>
              <div className="p-3 glass-well rounded-2xl">
                <span className="text-white/60 block">Vehicle Unit</span>
                <span className="font-mono text-white/90 mt-0.5 block">
                  {inspectedEvent.vehicleUnit}
                </span>
              </div>
              <div className="p-3 glass-well rounded-2xl">
                <span className="text-white/60 block">Recorded EAR</span>
                <span className="font-mono tabular-nums text-white text-sm font-semibold mt-0.5 block">
                  {inspectedEvent.earValue.toFixed(3)}
                </span>
              </div>
              <div className="p-3 glass-well rounded-2xl">
                <span className="text-white/60 block">Mouth MAR / Pitch</span>
                <span className="font-mono tabular-nums text-zinc-200 text-sm font-semibold mt-0.5 block">
                  {inspectedEvent.marValue.toFixed(2)} / {inspectedEvent.headPitch.toFixed(1)}°
                </span>
              </div>
              <div className="p-3 glass-well rounded-2xl">
                <span className="text-white/60 block">PERCLOS Window</span>
                <span className="font-mono tabular-nums text-white mt-0.5 block">
                  {inspectedEvent.perclos.toFixed(1)}%
                </span>
              </div>
              <div className="p-3 glass-well rounded-2xl">
                <span className="text-white/60 block">Episode Duration</span>
                <span className="font-mono tabular-nums text-white mt-0.5 block">
                  {formatDurationMs(inspectedEvent.durationMs)}
                </span>
              </div>
            </div>

            <div className="p-3.5 glass-well rounded-2xl text-xs text-white/90">
              <span className="text-white/60 block mb-1">Telemetry Notes</span>
              {inspectedEvent.notes || 'No supplemental notes recorded.'}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setInspectedEvent(null)}
                className="glass-option px-5 py-2 text-white text-xs font-medium rounded-full cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
