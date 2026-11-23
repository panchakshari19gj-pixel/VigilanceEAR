import {
  Activity,
  BarChart3,
  ClipboardList,
  Eye,
  Sliders,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { AppTab, DrowsinessState } from '../types/telemetry';

interface AppSidebarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  sessionActive: boolean;
  onToggleSession: () => void;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onTestAlarm: () => void;
  liveState: DrowsinessState;
  totalEvents: number;
}

const NAV_ITEMS: { id: AppTab; label: string; icon: typeof Activity }[] = [
  { id: 'monitor', label: 'Live Monitor', icon: Activity },
  { id: 'analytics', label: 'EAR Analytics', icon: BarChart3 },
  { id: 'logs', label: 'User Logs', icon: ClipboardList },
  { id: 'calibration', label: 'Calibration', icon: Sliders },
];

export function AppSidebar({
  activeTab,
  onTabChange,
  sessionActive,
  onToggleSession,
  audioEnabled,
  onToggleAudio,
  onTestAlarm,
  liveState,
  totalEvents,
}: AppSidebarProps) {
  const stateLabel =
    liveState === 'critical'
      ? 'Critical Alert'
      : liveState === 'warning'
        ? 'Fatigue Warning'
        : liveState === 'no_face'
          ? 'No Face Lock'
          : 'Driver Attentive';

  const stateColor =
    liveState === 'critical'
      ? 'text-rose-400'
      : liveState === 'warning'
        ? 'text-amber-300'
        : liveState === 'no_face'
          ? 'text-white/50'
          : 'text-emerald-300';

  return (
    <aside className="glass-sidebar w-full lg:w-[244px] shrink-0 flex flex-col justify-between p-5 rounded-[26px] lg:rounded-[30px] lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <div>
        {/* Brand Wordmark */}
        <button
          type="button"
          onClick={() => onTabChange('monitor')}
          className="flex items-center gap-3 text-left w-full pb-5 mb-5 border-b border-white/12 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-xl"
        >
          <span className="ember-icon-tile w-9 h-9 rounded-full flex items-center justify-center shrink-0">
            <Eye className="w-4 h-4 text-white" />
          </span>
          <span className="text-[15px] font-display font-bold tracking-[0.07em] text-white whitespace-nowrap">
            VIGILANCE·EAR
          </span>
        </button>

        {/* Vertical Obsidian Liquid Crystal Capsule Navigation */}
        <nav aria-label="Primary navigation" className="flex lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 transition-all duration-150 ${
                  isActive
                    ? 'glass-option-active text-white'
                    : 'text-white/65 hover:text-white hover:bg-white/[0.08] border border-transparent'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-white' : 'text-white/55'
                    }`}
                  />
                  <span>{item.label}</span>
                </span>
                {item.id === 'logs' && (
                  <span className="text-[11px] font-mono tabular-nums text-white/65">
                    {totalEvents}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Floating Smoked Glass Live Engine Block */}
      <div className="hidden lg:block mt-6 rounded-[22px] p-4 glass-well">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-semibold text-white">Live Engine</span>
          <span className={`text-[11px] font-mono font-semibold ${stateColor}`}>
            {stateLabel}
          </span>
        </div>

        <p className="text-[11px] text-white/60 leading-relaxed mb-3.5">
          Real-time 478-point landmark monitoring with continuous automatic alert updates.
        </p>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            type="button"
            onClick={onToggleAudio}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-full text-[11px] font-medium cursor-pointer ${
              audioEnabled ? 'glass-option-active text-white' : 'glass-option text-white/75'
            }`}
          >
            {audioEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{audioEnabled ? 'Audio On' : 'Muted'}</span>
          </button>
          <button
            type="button"
            onClick={onTestAlarm}
            className="glass-option py-1.5 px-2.5 rounded-full text-[11px] font-medium text-white cursor-pointer"
          >
            Test Alarm
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleSession}
          className={`w-full py-2.5 px-4 rounded-full text-xs font-semibold tracking-wide text-white cursor-pointer ${
            sessionActive ? 'liquid-cta-danger' : 'liquid-cta'
          }`}
        >
          {sessionActive ? 'END SESSION' : 'START SESSION'}
        </button>
      </div>
    </aside>
  );
}
