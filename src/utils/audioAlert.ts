class AudioAlertEngine {
  private ctx: AudioContext | null = null;
  private lastWarningAt = 0;
  private lastCriticalAt = 0;
  private lastVoiceAt = 0;
  private gestureHooked = false;

  constructor() {
    this.attachGestureUnlock();
  }

  private attachGestureUnlock(): void {
    if (typeof window === 'undefined' || this.gestureHooked) return;
    this.gestureHooked = true;
    const handleUnlock = () => {
      this.unlock();
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
    };
    window.addEventListener('pointerdown', handleUnlock, { passive: true });
    window.addEventListener('keydown', handleUnlock, { passive: true });
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
          return null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public playToneBurst(
    frequencies: number[],
    durationSec: number,
    volume: number,
    gapSec = 0.08,
    allowResumeSchedule = false
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || volume <= 0.01) return;

    const schedule = () => {
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const safeVol = Math.max(0.02, Math.min(0.85, volume * 0.55));

      frequencies.forEach((freq, idx) => {
        const start = now + idx * (durationSec + gapSec);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(safeVol, start + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + durationSec + 0.02);
      });
    };

    if (ctx.state === 'running') {
      schedule();
    } else if (allowResumeSchedule) {
      void ctx
        .resume()
        .then(() => schedule())
        .catch(() => {});
    }
  }

  public triggerWarning(
    volume: number,
    audioEnabled: boolean,
    voiceEnabled: boolean,
    reason?: string
  ): void {
    const now = Date.now();
    if (now - this.lastWarningAt < 3500) return;
    this.lastWarningAt = now;

    if (audioEnabled) {
      this.playToneBurst([523.25, 659.25], 0.14, volume, 0.07, false);
    }
    if (voiceEnabled) {
      this.speak(reason || 'Fatigue warning. Stay attentive.');
    }
  }

  public triggerCritical(
    volume: number,
    audioEnabled: boolean,
    voiceEnabled: boolean,
    reason?: string
  ): void {
    const now = Date.now();
    if (now - this.lastCriticalAt < 1800) return;
    this.lastCriticalAt = now;

    if (audioEnabled) {
      this.playToneBurst([880, 1174.66, 880, 1174.66], 0.13, volume, 0.05, false);
    }
    if (voiceEnabled) {
      this.speak(reason || 'Alert! Microsleep detected. Wake up.');
    }
  }

  public testAlarm(volume: number): void {
    this.playToneBurst([784, 987.77, 1174.66], 0.14, volume, 0.06, true);
  }

  private speak(text: string): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const now = Date.now();
    if (now - this.lastVoiceAt < 5000) return;
    this.lastVoiceAt = now;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.05;
      utter.pitch = 1.0;
      utter.volume = 0.85;
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore speech synthesis errors in restricted environments
    }
  }
}

export const audioAlert = new AudioAlertEngine();
