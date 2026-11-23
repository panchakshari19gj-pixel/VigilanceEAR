import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Cpu,
  Image as ImageIcon,
  Plus,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { DRIVER_SAMPLE_FRAMES } from '../constants/samples';
import type {
  CalibrationConfig,
  DriverProfile,
  InputSourceMode,
  SimulatorScenario,
} from '../types/telemetry';
import { audioAlert } from '../utils/audioAlert';

interface ControlSidebarProps {
  drivers: DriverProfile[];
  activeDriverId: string;
  onSelectDriver: (id: string) => void;
  onRenameDriver: (driverId: string, name: string) => Promise<void>;
  onCreateDriver: (payload: {
    name: string;
    licenseCode: string;
    vehicleUnit: string;
  }) => Promise<void>;
  sourceMode: InputSourceMode;
  onSourceModeChange: (mode: InputSourceMode) => void;
  activeSampleId: string;
  onSelectSample: (id: string) => void;
  onUploadMedia: (file: File) => void;
  uploadedFileName: string | null;
  simulatorScenario: SimulatorScenario;
  onScenarioChange: (scenario: SimulatorScenario) => void;
  manualSim: { eyeOpenness: number; mouthOpenness: number; pitchDeg: number };
  onManualSimChange: (next: { eyeOpenness: number; mouthOpenness: number; pitchDeg: number }) => void;
  calibration: CalibrationConfig;
  onCalibrationChange: (next: CalibrationConfig) => void;
}

const SOURCE_OPTIONS: { id: InputSourceMode; label: string; desc: string; icon: typeof Camera }[] = [
  { id: 'webcam', label: 'Webcam', desc: '480p Fast Live', icon: Camera },
  { id: 'samples', label: 'Samples', desc: 'Cabin frames', icon: ImageIcon },
  { id: 'simulator', label: 'Simulator', desc: '60fps presets', icon: Cpu },
  { id: 'upload', label: 'Upload', desc: 'Image / Video', icon: Upload },
];

const SIMULATOR_PRESETS: { id: SimulatorScenario; label: string; hint: string }[] = [
  { id: 'alert', label: 'Alert Driving', hint: 'Normal blinks' },
  { id: 'fatigued', label: 'Fatigued Blinks', hint: 'Drooping lids' },
  { id: 'microsleep', label: 'Microsleep', hint: '2.4s closure' },
  { id: 'yawn_nod', label: 'Yawn & Nod', hint: 'High MAR + pitch' },
  { id: 'manual', label: 'Manual Sliders', hint: 'Custom aperture' },
];

export function ControlSidebar({
  drivers,
  activeDriverId,
  onSelectDriver,
  onRenameDriver,
  onCreateDriver,
  sourceMode,
  onSourceModeChange,
  activeSampleId,
  onSelectSample,
  onUploadMedia,
  uploadedFileName,
  simulatorScenario,
  onScenarioChange,
  manualSim,
  onManualSimChange,
  calibration,
  onCalibrationChange,
}: ControlSidebarProps) {
  const [addingDriver, setAddingDriver] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLicense, setNewLicense] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [creating, setCreating] = useState(false);

  const activeDriver = drivers.find((d) => d.id === activeDriverId) ?? drivers[0];

  const [inlineName, setInlineName] = useState(activeDriver?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameSavedCue, setNameSavedCue] = useState(false);
  const savingNameRef = useRef(false);

  useEffect(() => {
    setInlineName(activeDriver?.name ?? '');
    setNameSavedCue(false);
  }, [activeDriver?.id, activeDriver?.name]);

  const commitInlineName = async () => {
    if (!activeDriver || savingNameRef.current) return;
    const trimmed = inlineName.trim();
    if (!trimmed) {
      setInlineName(activeDriver.name);
      return;
    }
    if (trimmed === activeDriver.name) return;

    savingNameRef.current = true;
    setSavingName(true);
    try {
      await onRenameDriver(activeDriver.id, trimmed);
      setNameSavedCue(true);
      window.setTimeout(() => setNameSavedCue(false), 2000);
    } catch {
      setInlineName(activeDriver.name);
    } finally {
      savingNameRef.current = false;
      setSavingName(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await onCreateDriver({
        name: newName.trim(),
        licenseCode: newLicense.trim() || `DL-${Math.floor(1000 + Math.random() * 9000)}`,
        vehicleUnit: newUnit.trim() || 'UNIT-04 · Cabin Cam',
      });
      setNewName('');
      setNewLicense('');
      setNewUnit('');
      setAddingDriver(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {/* Liquid Glass Block 1: Optical Source & Mode Options */}
      <section className="glass-panel rounded-[26px] p-5 flex flex-col justify-between gap-3.5">
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-display font-semibold text-white">
              Optical Source Options
            </h2>
            <span className="text-[11px] font-mono text-white/65">4 Modes</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {SOURCE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = sourceMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSourceModeChange(opt.id)}
                  className={`flex items-center gap-2.5 p-3 rounded-2xl text-left cursor-pointer ${
                    active ? 'glass-option-active text-white' : 'glass-option text-white/90'
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      active
                        ? 'ember-icon-tile text-white'
                        : 'bg-white/[0.1] border border-white/22 text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{opt.label}</div>
                    <div className="text-[10px] text-white/65 truncate">{opt.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Contextual Crystal Glass Sub-Options */}
        {sourceMode === 'samples' && (
          <div className="pt-3 border-t border-white/20 space-y-2">
            <span className="text-[11px] font-medium text-white/85 block">
              Reference Cabin Frames
            </span>
            <div className="grid grid-cols-1 gap-2">
              {DRIVER_SAMPLE_FRAMES.map((sample) => {
                const selected = sample.id === activeSampleId;
                return (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => onSelectSample(sample.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl cursor-pointer ${
                      selected
                        ? 'glass-option-active text-white'
                        : 'glass-option text-white/90'
                    }`}
                  >
                    <div className="text-xs font-semibold">{sample.label}</div>
                    <div className="text-[11px] text-white/75 mt-0.5 truncate">
                      {sample.caption}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {sourceMode === 'simulator' && (
          <div className="pt-3 border-t border-white/20 space-y-3">
            <span className="text-[11px] font-medium text-white/85 block">
              Simulator Scenario Blocks
            </span>
            <div className="grid grid-cols-2 gap-2">
              {SIMULATOR_PRESETS.map((preset) => {
                const active = simulatorScenario === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onScenarioChange(preset.id)}
                    className={`px-3 py-2 text-left rounded-xl cursor-pointer ${
                      active
                        ? 'glass-option-active text-white'
                        : 'glass-option text-white/90'
                    } ${preset.id === 'manual' ? 'col-span-2' : ''}`}
                  >
                    <div className="text-xs font-semibold truncate">{preset.label}</div>
                    <div className="text-[10px] text-white/75 truncate">{preset.hint}</div>
                  </button>
                );
              })}
            </div>

            {simulatorScenario === 'manual' && (
              <div className="glass-well rounded-2xl p-3 space-y-2.5">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/85">Eyelid Aperture</span>
                    <span className="font-mono tabular-nums text-white">
                      {Math.round(manualSim.eyeOpenness * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={manualSim.eyeOpenness}
                    onChange={(e) =>
                      onManualSimChange({ ...manualSim, eyeOpenness: parseFloat(e.target.value) })
                    }
                    className="w-full accent-white cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/85">Mouth Openness</span>
                    <span className="font-mono tabular-nums text-zinc-200">
                      {Math.round(manualSim.mouthOpenness * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={manualSim.mouthOpenness}
                    onChange={(e) =>
                      onManualSimChange({ ...manualSim, mouthOpenness: parseFloat(e.target.value) })
                    }
                    className="w-full accent-white cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/85">Head Pitch Angle</span>
                    <span className="font-mono tabular-nums text-white">
                      {manualSim.pitchDeg.toFixed(0)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-15}
                    max={30}
                    step={1}
                    value={manualSim.pitchDeg}
                    onChange={(e) =>
                      onManualSimChange({ ...manualSim, pitchDeg: parseFloat(e.target.value) })
                    }
                    className="w-full accent-white cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {sourceMode === 'upload' && (
          <div className="pt-3 border-t border-white/[0.14]">
            <label className="glass-option block w-full text-center px-3 py-4 rounded-xl border-dashed cursor-pointer">
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadMedia(file);
                  e.currentTarget.value = '';
                }}
              />
              <span className="text-xs font-semibold text-white block">
                Select Driver Image or Video
              </span>
              <span className="text-[11px] text-white/75 block mt-1 truncate">
                {uploadedFileName ? `Loaded: ${uploadedFileName}` : 'Supports JPG, PNG, MP4, WebM'}
              </span>
            </label>
          </div>
        )}
      </section>

      {/* Liquid Glass Block 2: Threshold Calibration Sliders */}
      <section className="glass-panel rounded-[26px] p-5 flex flex-col justify-between gap-3.5">
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-display font-semibold text-white">
              Detection Thresholds
            </h2>
            <button
              type="button"
              onClick={() =>
                onCalibrationChange({
                  ...calibration,
                  earThreshold: 0.21,
                  closureDurationSec: 1.2,
                  marThreshold: 0.58,
                  pitchThresholdDeg: 18,
                })
              }
              className="glass-option px-3 py-1 rounded-full text-[11px] font-medium text-white cursor-pointer"
            >
              Reset
            </button>
          </div>

          <div className="space-y-3">
            <div className="glass-well rounded-xl p-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-200">EAR Closure Threshold</span>
                <span className="font-mono tabular-nums text-white font-semibold">
                  {calibration.earThreshold.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.14}
                max={0.32}
                step={0.01}
                value={calibration.earThreshold}
                onChange={(e) =>
                  onCalibrationChange({ ...calibration, earThreshold: parseFloat(e.target.value) })
                }
                className="w-full accent-white cursor-pointer"
              />
            </div>

            <div className="glass-well rounded-xl p-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-200">Microsleep Trigger Time</span>
                <span className="font-mono tabular-nums text-rose-300 font-semibold">
                  {calibration.closureDurationSec.toFixed(2)} s
                </span>
              </div>
              <input
                type="range"
                min={0.4}
                max={3.0}
                step={0.1}
                value={calibration.closureDurationSec}
                onChange={(e) =>
                  onCalibrationChange({
                    ...calibration,
                    closureDurationSec: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-white cursor-pointer"
              />
            </div>

            <div className="glass-well rounded-xl p-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-200">Yawn MAR / Pitch Limit</span>
                <span className="font-mono tabular-nums text-white font-semibold">
                  {calibration.marThreshold.toFixed(2)} · ±{calibration.pitchThresholdDeg}°
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="range"
                  aria-label="Yawn MAR threshold"
                  min={0.45}
                  max={0.85}
                  step={0.01}
                  value={calibration.marThreshold}
                  onChange={(e) =>
                    onCalibrationChange({ ...calibration, marThreshold: parseFloat(e.target.value) })
                  }
                  className="w-full accent-white cursor-pointer"
                />
                <input
                  type="range"
                  aria-label="Head pitch limit"
                  min={10}
                  max={35}
                  step={1}
                  value={calibration.pitchThresholdDeg}
                  onChange={(e) =>
                    onCalibrationChange({
                      ...calibration,
                      pitchThresholdDeg: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-white cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Liquid Glass Block 3: Active Driver Profile with Inline Editable Driver Name */}
      <section className="glass-panel rounded-[26px] p-5 flex flex-col justify-between gap-4 md:col-span-2 xl:col-span-1">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-display font-semibold text-white">
              Active Driver Profile
            </h2>
            <button
              type="button"
              onClick={() => setAddingDriver((v) => !v)}
              className="glass-option inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium text-white cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3 h-3" />
              {addingDriver ? 'Close' : 'Add Driver'}
            </button>
          </div>

          {/* Inline Editable Driver Name Field */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void commitInlineName();
            }}
            className="space-y-1.5"
          >
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor="inline-driver-name" className="text-white/80 font-medium">
                Driver Name (Write Your Name)
              </label>
              {nameSavedCue && (
                <span className="inline-flex items-center gap-1 font-mono text-emerald-300">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                id="inline-driver-name"
                type="text"
                value={inlineName}
                onChange={(e) => setInlineName(e.target.value)}
                onBlur={() => void commitInlineName()}
                placeholder="Type your name..."
                className="flex-1 min-w-0 glass-well rounded-full px-3.5 py-2 text-xs text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-white/65"
              />
              <button
                type="submit"
                onMouseDown={(e) => e.preventDefault()}
                disabled={savingName || !inlineName.trim() || inlineName.trim() === activeDriver?.name}
                className="glass-option-active disabled:opacity-45 px-4 py-2 rounded-full text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
              >
                {savingName ? '...' : 'Save'}
              </button>
            </div>
          </form>

          {/* Saved Profile Switcher */}
          <div>
            <label className="text-[11px] text-white/80 block mb-1" htmlFor="driver-select">
              Switch Saved Profile
            </label>
            <select
              id="driver-select"
              value={activeDriverId}
              onChange={(e) => onSelectDriver(e.target.value)}
              className="w-full glass-well rounded-full px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/65"
            >
              {drivers.map((d) => (
                <option key={d.id} value={d.id} className="bg-[#09090b] text-white">
                  {d.name} ({d.licenseCode})
                </option>
              ))}
            </select>

            {activeDriver && (
              <div className="mt-2 flex items-center gap-2 text-[11px] text-white/75 font-mono tabular-nums">
                <span className="truncate">{activeDriver.vehicleUnit}</span>
                <span aria-hidden="true">·</span>
                <span className="shrink-0 text-white/95">
                  Base EAR {activeDriver.baselineEar.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {addingDriver && (
            <form onSubmit={handleAddSubmit} className="pt-3 border-t border-white/15 space-y-2">
              <input
                type="text"
                placeholder="New driver full name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="w-full glass-well rounded-full px-3.5 py-1.5 text-xs text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/65"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="License ID"
                  value={newLicense}
                  onChange={(e) => setNewLicense(e.target.value)}
                  className="w-full glass-well rounded-full px-3.5 py-1.5 text-xs text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/65"
                />
                <input
                  type="text"
                  placeholder="Vehicle Unit"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  className="w-full glass-well rounded-full px-3.5 py-1.5 text-xs text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/65"
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="liquid-cta w-full py-2 px-4 disabled:opacity-50 text-white font-semibold text-xs rounded-full cursor-pointer"
              >
                {creating ? 'Saving...' : 'Save New Driver'}
              </button>
            </form>
          )}
        </div>

        {/* Audio & Voice Synthesizer Liquid Glass Capsules */}
        <div className="pt-3 border-t border-white/[0.14] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white">Real-Time Audio Alerts</span>
            <button
              type="button"
              onClick={() => {
                audioAlert.unlock();
                audioAlert.testAlarm(calibration.alarmVolume);
              }}
              className="glass-option px-3 py-1 rounded-full text-[11px] font-medium text-white cursor-pointer"
            >
              Test Tone
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                audioAlert.unlock();
                onCalibrationChange({ ...calibration, audioEnabled: !calibration.audioEnabled });
              }}
              className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs font-medium cursor-pointer ${
                calibration.audioEnabled
                  ? 'glass-option-active text-white'
                  : 'glass-option text-white/70'
              }`}
            >
              {calibration.audioEnabled ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
              <span>{calibration.audioEnabled ? 'Audio On' : 'Muted'}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onCalibrationChange({ ...calibration, voiceEnabled: !calibration.voiceEnabled })
              }
              className={`py-2 px-3 rounded-full text-xs font-medium cursor-pointer ${
                calibration.voiceEnabled
                  ? 'glass-option-active text-white'
                  : 'glass-option text-white/70'
              }`}
            >
              {calibration.voiceEnabled ? 'Voice Cue On' : 'Voice Cue Off'}
            </button>
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-white/80">Alarm Gain</span>
              <span className="font-mono tabular-nums text-white">
                {Math.round(calibration.alarmVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={calibration.alarmVolume}
              onChange={(e) =>
                onCalibrationChange({ ...calibration, alarmVolume: parseFloat(e.target.value) })
              }
              className="w-full accent-white cursor-pointer"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
