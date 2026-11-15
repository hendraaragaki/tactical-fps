// Procedural sound: every effect is synthesised with WebAudio, no audio files and no
// network. Created lazily on the first user gesture so the browser allows it.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(dur, filterFreq, gainValue, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t, Math.random() * 0.3, dur);
    src.stop(t + dur);
  }

  function tone(freq, dur, gainValue, type = 'sine', slideTo = 0, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    shot(kind) {
      if (kind === 'dmr' || kind === 'shotgun') noise(0.22, 900, 0.5);
      else if (kind === 'smg') noise(0.08, 1800, 0.28);
      else noise(0.12, 1400, 0.4);
      tone(140, 0.1, 0.3, 'triangle', 55);
    },
    enemyShot() {
      noise(0.1, 1000, 0.16);
    },
    dry() {
      tone(1400, 0.03, 0.12, 'square');
    },
    reload() {
      tone(700, 0.04, 0.14, 'square');
      tone(500, 0.04, 0.14, 'square', 0, 0.25);
    },
    hit(kill) {
      tone(kill ? 1320 : 990, 0.06, 0.2, 'sine');
      if (kill) tone(1760, 0.09, 0.16, 'sine', 0, 0.06);
    },
    hurt() {
      tone(180, 0.12, 0.25, 'sawtooth', 90);
    },
    beep(urgent) {
      tone(urgent ? 1500 : 1050, 0.07, 0.18, 'sine');
    },
    plantTick() {
      tone(880, 0.05, 0.12, 'sine');
    },
    explosion() {
      noise(0.9, 320, 0.7);
      tone(70, 0.8, 0.5, 'sine', 30);
    },
    roundWin() {
      tone(523, 0.14, 0.2, 'sine');
      tone(659, 0.14, 0.2, 'sine', 0, 0.13);
      tone(784, 0.22, 0.22, 'sine', 0, 0.26);
    },
    roundLose() {
      tone(392, 0.16, 0.2, 'sine');
      tone(311, 0.24, 0.2, 'sine', 0, 0.15);
    },
    step() {
      tone(300, 0.03, 0.05, 'sine');
    },
    buy() {
      tone(880, 0.06, 0.16, 'sine');
      tone(1174, 0.08, 0.16, 'sine', 0, 0.06);
    },
  };
}
