// Audio: every sound is synthesized with WebAudio, so the game ships no audio
// files and needs no network. The context is created lazily on the first user
// gesture and every call is guarded, so a headless capture never throws. v2
// adds footstep ticks (timed to the walk cycle) and a round-start horn.
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noiseBuffer(seconds) {
    const c = ensure();
    if (!c) return null;
    const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * seconds)), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ seconds = 0.12, freq = 1800, gain = 0.5, type = 'bandpass', q = 0.8, slideTo = null, delay = 0 }) {
    const c = ensure();
    if (!c || !enabled) return;
    try {
      const t0 = c.currentTime + delay;
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(seconds + 0.05);
      const filter = c.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(freq, t0);
      if (slideTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + seconds);
      filter.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start(t0);
      src.stop(t0 + seconds + 0.05);
    } catch {
      /* audio is cosmetic; never break the game */
    }
  }

  function tone({ freq = 440, to = null, seconds = 0.12, gain = 0.25, type = 'sine', delay = 0 }) {
    const c = ensure();
    if (!c || !enabled) return;
    try {
      const t0 = c.currentTime + delay;
      const osc = c.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + seconds);
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + seconds + 0.02);
    } catch {
      /* audio is cosmetic; never break the game */
    }
  }

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    },
    setEnabled(value) {
      enabled = value;
    },
    shot(kind) {
      if (kind === 'sniper') {
        burst({ seconds: 0.28, freq: 900, gain: 0.9, slideTo: 120 });
        tone({ freq: 150, to: 55, seconds: 0.22, gain: 0.5, type: 'triangle' });
      } else if (kind === 'shotgun') {
        burst({ seconds: 0.22, freq: 1100, gain: 0.85, slideTo: 140 });
        tone({ freq: 120, to: 50, seconds: 0.18, gain: 0.45, type: 'triangle' });
      } else if (kind === 'smg') {
        burst({ seconds: 0.08, freq: 2400, gain: 0.42, slideTo: 500 });
      } else if (kind === 'pistol') {
        burst({ seconds: 0.1, freq: 1900, gain: 0.55, slideTo: 300 });
      } else {
        burst({ seconds: 0.11, freq: 1600, gain: 0.6, slideTo: 260 });
      }
    },
    dryFire() {
      tone({ freq: 1400, seconds: 0.03, gain: 0.15, type: 'square' });
    },
    reload() {
      tone({ freq: 900, seconds: 0.04, gain: 0.16, type: 'square' });
      tone({ freq: 620, seconds: 0.05, gain: 0.16, type: 'square', delay: 0.22 });
      tone({ freq: 1100, seconds: 0.05, gain: 0.18, type: 'square', delay: 0.45 });
    },
    hit() {
      tone({ freq: 1250, seconds: 0.05, gain: 0.22, type: 'square' });
    },
    kill() {
      tone({ freq: 880, seconds: 0.07, gain: 0.25, type: 'sine' });
      tone({ freq: 1320, seconds: 0.1, gain: 0.22, type: 'sine', delay: 0.07 });
    },
    hurt() {
      tone({ freq: 220, to: 90, seconds: 0.16, gain: 0.35, type: 'sawtooth' });
    },
    plantBeep() {
      tone({ freq: 1560, seconds: 0.06, gain: 0.2, type: 'square' });
    },
    defuseBeep() {
      tone({ freq: 1040, seconds: 0.06, gain: 0.2, type: 'square' });
    },
    explosion() {
      burst({ seconds: 1.1, freq: 420, gain: 1.0, slideTo: 45, type: 'lowpass' });
      tone({ freq: 70, to: 28, seconds: 0.9, gain: 0.7, type: 'sine' });
    },
    grenadeThrow() {
      burst({ seconds: 0.08, freq: 3000, gain: 0.2 });
    },
    bounce() {
      tone({ freq: 300, to: 180, seconds: 0.05, gain: 0.18, type: 'triangle' });
    },
    buy() {
      tone({ freq: 660, seconds: 0.06, gain: 0.2, type: 'sine' });
      tone({ freq: 990, seconds: 0.09, gain: 0.2, type: 'sine', delay: 0.06 });
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => tone({ freq: f, seconds: 0.16, gain: 0.22, type: 'triangle', delay: i * 0.11 }));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => tone({ freq: f, seconds: 0.18, gain: 0.2, type: 'triangle', delay: i * 0.12 }));
    },
    click() {
      tone({ freq: 800, seconds: 0.03, gain: 0.15, type: 'square' });
    },
    /** A soft boot tick; the caller times it to the walk cycle. */
    footstep(running) {
      burst({ seconds: 0.05, freq: running ? 700 : 480, gain: running ? 0.14 : 0.09, type: 'lowpass' });
    },
    /** Two-note horn when a round goes live. */
    roundStart() {
      tone({ freq: 392, seconds: 0.14, gain: 0.2, type: 'triangle' });
      tone({ freq: 523, seconds: 0.2, gain: 0.2, type: 'triangle', delay: 0.13 });
    },
  };
}
