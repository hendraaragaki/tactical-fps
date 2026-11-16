// The armoury: five guns and three grenades, each with its own numbers and view model.
// main.js owns the ray and the damage; this module owns the magazine, the reload and
// the spread that punishes firing on the move.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { name: 'P250', price: 0, damage: 26, headMult: 3, mag: 12, reserve: 36, gap: 0.16, reload: 1.3, spreadStill: 0.004, spreadMove: 0.03, auto: false, pellets: 1, kick: 0.03 },
  rifle: { name: 'AK-47', price: 2700, damage: 34, headMult: 3, mag: 30, reserve: 90, gap: 0.096, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, auto: true, pellets: 1, kick: 0.055 },
  smg: { name: 'MP5', price: 1500, damage: 24, headMult: 3, mag: 32, reserve: 96, gap: 0.07, reload: 1.7, spreadStill: 0.004, spreadMove: 0.03, auto: true, pellets: 1, kick: 0.04 },
  dmr: { name: 'AWP', price: 4750, damage: 88, headMult: 3, mag: 5, reserve: 15, gap: 0.9, reload: 2.6, spreadStill: 0.0008, spreadMove: 0.02, auto: false, pellets: 1, kick: 0.11 },
  shotgun: { name: 'MAG-7', price: 1700, damage: 11, headMult: 2, mag: 6, reserve: 18, gap: 0.85, reload: 2.4, spreadStill: 0.05, spreadMove: 0.07, auto: false, pellets: 8, kick: 0.12 },
};
export const GRENADES = {
  frag: { name: 'Frag', price: 300, radius: 5.5, damage: 95 },
  smoke: { name: 'Smoke', price: 300, radius: 4, duration: 12 },
  flash: { name: 'Flash', price: 200, radius: 14, duration: 2.2 },
};
export const SLOTS = ['rifle', 'pistol', 'frag', 'smoke', 'flash'];

// View models: each gun is built from boxes (plus one cylinder for the AWP scope)
// with dark, high-contrast materials so the gun reads as a silhouette against the
// bright dusk ground. Wood furniture on the AK-47 and MAG-7, olive on the AWP,
// gunmetal everywhere else, one ember accent strip per gun. Same group position
// and scale as before, so framing and gameplay are untouched.
function buildGun(def, kind) {
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.45, metalness: 0.55 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x56565e, roughness: 0.35, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.7, metalness: 0.2 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x96602c, roughness: 0.8, metalness: 0.05 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x4a5d3a, roughness: 0.6, metalness: 0.2 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const group = new THREE.Group();
  const add = (w, h, d, x, y, z, mat, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || gunmetal);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    group.add(m);
    return m;
  };
  if (kind === 'pistol') {
    // P250: compact slide over a dark frame, raked grip.
    add(0.07, 0.07, 0.24, 0, 0.01, -0.10, gunmetal);
    add(0.04, 0.04, 0.05, 0, 0.01, -0.24, steel);
    add(0.065, 0.06, 0.20, 0, -0.035, -0.08, dark);
    add(0.06, 0.13, 0.08, 0, -0.11, 0.03, dark, -0.25);
    add(0.012, 0.02, 0.012, 0, 0.055, -0.20, accent);
  } else if (kind === 'smg') {
    // MP5: short compact body, straight mag, thin stock, front sight post.
    add(0.08, 0.10, 0.30, 0, 0, -0.05, gunmetal);
    add(0.035, 0.035, 0.22, 0, 0.02, -0.30, steel);
    add(0.012, 0.05, 0.012, 0, 0.06, -0.40, gunmetal);
    add(0.085, 0.07, 0.16, 0, -0.01, -0.20, dark);
    add(0.05, 0.16, 0.07, 0, -0.12, -0.02, gunmetal, 0.08);
    add(0.06, 0.08, 0.14, 0, -0.01, 0.22, gunmetal);
    add(0.055, 0.11, 0.06, 0, -0.095, 0.08, dark, -0.2);
    add(0.08, 0.015, 0.10, 0, 0.055, -0.05, accent);
  } else if (kind === 'dmr') {
    // AWP: long olive body, big scope on top, muzzle brake, bolt handle.
    add(0.08, 0.10, 0.52, 0, 0, -0.12, olive);
    add(0.035, 0.035, 0.42, 0, 0.02, -0.48, steel);
    add(0.055, 0.055, 0.08, 0, 0.02, -0.68, dark);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.24, 12), dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.095, -0.16);
    group.add(scope);
    add(0.02, 0.03, 0.03, 0, 0.07, -0.06, gunmetal);
    add(0.02, 0.03, 0.03, 0, 0.07, -0.26, gunmetal);
    add(0.06, 0.02, 0.02, 0.06, 0.01, 0.02, steel);
    add(0.075, 0.09, 0.22, 0, -0.01, 0.30, olive);
    add(0.06, 0.10, 0.09, 0, -0.09, -0.04, gunmetal);
    add(0.055, 0.10, 0.06, 0, -0.09, 0.12, dark, -0.2);
  } else if (kind === 'shotgun') {
    // MAG-7: thick receiver, wide wooden pump, short barrel, bead sight.
    add(0.10, 0.11, 0.36, 0, 0, -0.06, gunmetal);
    add(0.05, 0.05, 0.28, 0, 0.03, -0.36, steel);
    add(0.105, 0.09, 0.20, 0, -0.02, -0.28, wood);
    add(0.09, 0.10, 0.20, 0, -0.01, 0.26, wood);
    add(0.06, 0.11, 0.07, 0, -0.10, 0.10, dark, -0.2);
    add(0.012, 0.02, 0.012, 0, 0.065, -0.48, accent);
  } else {
    // AK-47: dark receiver, wooden handguard and stock, curved magazine.
    add(0.09, 0.11, 0.40, 0, 0, -0.08, gunmetal);
    add(0.04, 0.04, 0.32, 0, 0.025, -0.44, steel);
    add(0.015, 0.06, 0.015, 0, 0.06, -0.58, gunmetal);
    add(0.05, 0.05, 0.05, 0, 0.025, -0.60, dark);
    add(0.09, 0.075, 0.20, 0, -0.005, -0.30, wood);
    add(0.085, 0.10, 0.22, 0, -0.015, 0.28, wood);
    add(0.06, 0.12, 0.09, 0, -0.10, -0.06, gunmetal, 0.12);
    add(0.06, 0.12, 0.09, 0, -0.19, -0.02, gunmetal, 0.32);
    add(0.065, 0.05, 0.095, 0, -0.255, 0.03, dark, 0.5);
    add(0.06, 0.12, 0.07, 0, -0.10, 0.12, wood, -0.25);
    add(0.09, 0.015, 0.12, 0, 0.06, -0.10, accent);
  }
  group.position.set(0.24, -0.2, -0.42);
  return group;
}

export function createWeapons(camera) {
  const models = {};
  for (const id of ['pistol', 'rifle', 'smg', 'dmr', 'shotgun']) {
    models[id] = buildGun(WEAPONS[id], id);
    models[id].visible = false;
    camera.add(models[id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'pistol',
    owned: { pistol: true, rifle: false, smg: false, dmr: false, shotgun: false },
    mag: { pistol: 12, rifle: 0, smg: 0, dmr: 0, shotgun: 0 },
    reserve: { pistol: 36, rifle: 0, smg: 0, dmr: 0, shotgun: 0 },
    grenades: { frag: 0, smoke: 0, flash: 0 },
    cooldown: 0,
    reloadLeft: 0,
    reloadFor: null,
    flash: 0,
    kick: 0,
  };
  models.pistol.visible = true;

  function def() {
    return WEAPONS[state.current];
  }
  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0 && state.reloadFor) {
        const id = state.reloadFor;
        const need = WEAPONS[id].mag - state.mag[id];
        const take = Math.min(need, state.reserve[id]);
        state.mag[id] += take;
        state.reserve[id] -= take;
        state.reloadFor = null;
      }
    }
  }

  return {
    state,
    def,
    step,
    currentDef() {
      return def();
    },
    select(id) {
      if (id === state.current) return false;
      if (WEAPONS[id] && !state.owned[id]) return false;
      if (GRENADES[id] && state.grenades[id] <= 0) return false;
      models[state.current].visible = false;
      state.current = id;
      state.reloadLeft = 0;
      state.reloadFor = null;
      if (models[id]) models[id].visible = true;
      return true;
    },
    isGrenade() {
      return !!GRENADES[state.current];
    },
    ready() {
      if (GRENADES[state.current]) return state.grenades[state.current] > 0 && state.cooldown === 0;
      return state.mag[state.current] > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = def().kick;
    },
    takeRound() {
      if (state.mag[state.current] <= 0) return false;
      state.mag[state.current] -= 1;
      return true;
    },
    takeGrenade() {
      if (state.grenades[state.current] <= 0) return false;
      state.grenades[state.current] -= 1;
      state.cooldown = 0.5;
      return true;
    },
    reload() {
      const id = state.current;
      if (!WEAPONS[id] || state.reloadLeft > 0 || state.mag[id] === WEAPONS[id].mag || state.reserve[id] === 0) return;
      state.reloadLeft = WEAPONS[id].reload;
      state.reloadFor = id;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove;
    },
    buy(id) {
      if (WEAPONS[id]) {
        if (state.owned[id]) return false;
        state.owned[id] = true;
        state.mag[id] = WEAPONS[id].mag;
        state.reserve[id] = WEAPONS[id].reserve;
        return true;
      }
      if (GRENADES[id]) {
        if (state.grenades[id] >= 2) return false;
        state.grenades[id] += 1;
        return true;
      }
      return false;
    },
    refillRound() {
      // Between rounds: topped-up reserve for owned guns, grenades stay as bought.
      for (const id of Object.keys(state.owned)) {
        if (!state.owned[id]) continue;
        state.mag[id] = WEAPONS[id].mag;
        state.reserve[id] = WEAPONS[id].reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.reloadFor = null;
      state.flash = 0;
      state.kick = 0;
      if (!state.owned[state.current] && !GRENADES[state.current]) this.select('pistol');
      else if (GRENADES[state.current] && state.grenades[state.current] <= 0) this.select(state.owned.rifle ? 'rifle' : 'pistol');
    },
    resetMatch() {
      state.owned = { pistol: true, rifle: false, smg: false, dmr: false, shotgun: false };
      state.mag = { pistol: 12, rifle: 0, smg: 0, dmr: 0, shotgun: 0 };
      state.reserve = { pistol: 36, rifle: 0, smg: 0, dmr: 0, shotgun: 0 };
      state.grenades = { frag: 0, smoke: 0, flash: 0 };
      this.refillRound();
      models[state.current].visible = false;
      state.current = 'pistol';
      models.pistol.visible = true;
    },
  };
}
