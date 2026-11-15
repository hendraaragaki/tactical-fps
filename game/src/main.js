// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. main.js owns the match, the shooting and the round flow; the modules own
// their own jobs. ?shot=start|play|buy|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { createMatch, PHASE, WIN_ROUNDS, ROUND_SECONDS, BUY_SECONDS, BOMB_FUSE, PLANT_SECONDS, DEFUSE_SECONDS, WIN_BONUS, LOSS_BONUS, KILL_BONUS, PLANT_BONUS } from './state.js';
import { createWorld, SITES, ATTACKER_SPAWN, BOT_SPAWNS, siteAt, nodePos } from './map.js';
import { createBots } from './bots.js';
import { createWeapons, WEAPONS, GRENADES, SLOTS } from './weapons.js';
import { createBomb } from './bomb.js';
import { createGrenades } from './grenades.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createPlayer } from './player.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { PALETTE } from './palette.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 22, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);
// A small warm light on the camera so the view model never sits in the dark.
const viewLight = new THREE.PointLight(new THREE.Color('#ffe0b8'), 0.9, 1.5);
viewLight.position.set(0.2, 0.1, -0.3);
camera.add(viewLight);

const world = createWorld(scene);
const bots = createBots(scene, BOT_SPAWNS, random);
const weapons = createWeapons(camera);
const bomb = createBomb();
const grenades = createGrenades(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const origin = new THREE.Vector3();
const target = new THREE.Vector3();
const sphere = new THREE.Sphere();
const ray = new THREE.Ray();

const match = createMatch();
const body = player.state;
let health = 100;
let alive = true;
let bloom = 0;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let stepAcc = 0;
let buyOpen = false;
let roundEndLeft = 0;

const bombEvents = {
  onPlant(site) {
    match.money += PLANT_BONUS;
    hud.setMoney(match.money);
    hud.setBomb(`BOMB PLANTED · SITE ${site}`);
    hud.banner('Bomb planted', 'Hold the site until it blows', 3000);
    hud.killfeed(`You planted the bomb on site ${site}  +$${PLANT_BONUS}`);
    bots.rotateTo(SITES[site], elapsed);
    audio.plantTick();
  },
  onExplode() {
    effects.explosion(SITES[bomb.bomb.site].center);
    audio.explosion();
    endRound('you', 'Bomb detonated');
  },
  onDefuse() {
    hud.setBomb('');
    endRound('foe', 'Bomb defused');
  },
  onBeep(fuseLeft) {
    audio.beep(fuseLeft <= 10);
  },
};

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function muzzleWorld(out) {
  return camera.localToWorld(out.set(0.24, -0.18, -0.95));
}

function segmentBlockedBySmoke(from, to) {
  for (const smoke of grenades.smokes) {
    // Distance from the smoke centre to the segment; under the radius means blocked.
    const cx = smoke.pos.x;
    const cy = 1.2;
    const cz = smoke.pos.z;
    const abx = to.x - from.x;
    const aby = to.y - from.y;
    const abz = to.z - from.z;
    const len2 = abx * abx + aby * aby + abz * abz || 1;
    let t = ((cx - from.x) * abx + (cy - from.y) * aby + (cz - from.z) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = from.x + abx * t - cx;
    const py = from.y + aby * t - cy;
    const pz = from.z + abz * t - cz;
    if (px * px + py * py + pz * pz < smoke.radius * smoke.radius) return true;
  }
  return false;
}

function losBlocked(from, to) {
  if (segmentBlockedBySmoke(from, to)) return true;
  direction.copy(to).sub(from);
  const dist = direction.length();
  direction.normalize();
  raycaster.set(from, direction);
  raycaster.far = dist;
  const hit = raycaster.intersectObjects(world.shootables, false)[0];
  return !!hit;
}

function isFree(x, z) {
  const probe = new THREE.Box3(new THREE.Vector3(x - 0.4, 0.05, z - 0.4), new THREE.Vector3(x + 0.4, 1.6, z + 0.4));
  for (const c of world.colliders) if (probe.intersectsBox(c)) return false;
  return true;
}

function shoot(spread) {
  if (!weapons.takeRound()) {
    audio.dry();
    return false;
  }
  const def = weapons.def();
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  const pellets = def.pellets;
  let hitSomething = false;
  for (let p = 0; p < pellets; p += 1) {
    const dir = direction.clone();
    if (pellets > 1) {
      dir.x += (random() * 2 - 1) * 0.05;
      dir.y += (random() * 2 - 1) * 0.05;
      dir.z += (random() * 2 - 1) * 0.05;
      dir.normalize();
    }
    raycaster.set(camera.position, dir);
    raycaster.far = 90;
    const hit = raycaster.intersectObjects(shootables, false)[0];
    const end = hit ? hit.point : camera.position.clone().addScaledVector(dir, 60);
    muzzleWorld(origin);
    effects.tracer(origin, end);
    if (hit) {
      hitSomething = true;
      effects.sparksAt(hit.point);
      const bot = hit.object.userData.bot;
      if (bot) {
        const head = hit.object.userData.part === 'head';
        const dmg = def.damage * (head ? def.headMult : 1);
        const killed = bots.damage(bot, dmg);
        hud.hitMarker(killed, head);
        audio.hit(killed);
        if (killed) {
          match.money += KILL_BONUS;
          match.kills.you += 1;
          hud.setMoney(match.money);
          hud.killfeed(`You ▸ ${bot.name} [${def.name}]  +$${KILL_BONUS}`);
          hud.setAlive(bots.aliveCount());
          if (bots.aliveCount() === 0 && bomb.bomb.state !== 'planted' && bomb.bomb.state !== 'defusing') {
            endRound('you', 'Squad eliminated');
          }
        }
      }
    }
  }
  if (!hitSomething) bloom = Math.min(0.02, bloom + 0.002);
  else bloom = Math.min(0.02, bloom + 0.004);
  weapons.pullTrigger();
  player.recoil(def.kick * 0.16 + random() * 0.004, (random() * 2 - 1) * 0.004);
  audio.shot(weapons.state.current);
  bots.hear(body.position.x, body.position.z, elapsed);
  hud.setAmmo(weapons.state.mag[weapons.state.current], weapons.state.reserve[weapons.state.current], def.name, weapons.state.grenades);
  return true;
}

function botShoot(bot, damage) {
  origin.set(bot.position.x, 1.45, bot.position.z);
  target.set(body.position.x, body.position.y + 1.15, body.position.z);
  direction.copy(target).sub(origin);
  const dist = direction.length();
  direction.normalize();
  const spread = 0.022 + Math.min(1, player.groundSpeed() / 5.2) * 0.02 + (dist > 18 ? 0.012 : 0);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  raycaster.set(origin, direction);
  raycaster.far = 90;
  const wall = raycaster.intersectObjects(world.shootables, false)[0];
  // Player as two spheres: chest and head.
  ray.origin.copy(origin);
  ray.direction.copy(direction);
  sphere.center.set(body.position.x, body.position.y + 1.05, body.position.z);
  sphere.radius = 0.42;
  const chestT = ray.intersectSphere(sphere, new THREE.Vector3());
  sphere.center.set(body.position.x, body.position.y + 1.55, body.position.z);
  sphere.radius = 0.2;
  const headT = ray.intersectSphere(sphere, new THREE.Vector3());
  let hitPoint = null;
  let hitDamage = 0;
  if (chestT && (!wall || wall.distance > origin.distanceTo(chestT))) {
    hitPoint = chestT;
    hitDamage = damage;
  } else if (headT && (!wall || wall.distance > origin.distanceTo(headT))) {
    hitPoint = headT;
    hitDamage = Math.round(damage * 1.5);
  }
  const end = hitPoint || (wall ? wall.point : origin.clone().addScaledVector(direction, 50));
  effects.tracer(origin, end);
  if (hitPoint) {
    effects.sparksAt(hitPoint);
    damagePlayer(hitDamage, bot);
  } else if (wall) {
    effects.sparksAt(wall.point);
  }
  if (dist < 30) audio.enemyShot();
}

function damagePlayer(amount, bot) {
  if (!alive) return;
  health -= amount;
  hud.setHealth(health);
  hud.damageFlash();
  audio.hurt();
  if (health <= 0) {
    health = 0;
    alive = false;
    hud.setHealth(0);
    hud.banner('You are down', bomb.bomb.state === 'planted' ? 'The bomb is still ticking' : '', 3000);
    if (document.pointerLockElement) document.exitPointerLock();
    if (bomb.bomb.state !== 'planted' && bomb.bomb.state !== 'defusing') {
      endRound('foe', 'You were eliminated');
    }
  }
}

function damageRadius(pos, radius, maxDamage, fromPlayer) {
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.position.x - pos.x, bot.position.z - pos.z);
    if (d < radius) {
      const dmg = Math.round(maxDamage * (1 - (d / radius) * 0.75));
      const killed = bots.damage(bot, dmg);
      if (killed && fromPlayer) {
        match.money += KILL_BONUS;
        match.kills.you += 1;
        hud.setMoney(match.money);
        hud.killfeed(`You ▸ ${bot.name} [Frag]  +$${KILL_BONUS}`);
        hud.setAlive(bots.aliveCount());
        if (bots.aliveCount() === 0 && bomb.bomb.state !== 'planted') endRound('you', 'Squad eliminated');
      }
    }
  }
  if (alive) {
    const d = Math.hypot(body.position.x - pos.x, body.position.z - pos.z);
    if (d < radius) damagePlayer(Math.round(maxDamage * (1 - (d / radius) * 0.75)) * 0.6, null);
  }
}

const botCtx = {
  get playerPos() {
    return body.position;
  },
  get playerAlive() {
    return alive;
  },
  // Bots only see and shoot during live play (buy time and round end are a ceasefire).
  get canEngage() {
    return match.phase === PHASE.LIVE;
  },
  losBlocked,
  isFree,
  nodePos,
  shootFrom(bot, damage) {
    botShoot(bot, damage);
  },
};

const grenadeCtx = {
  get now() {
    return elapsed;
  },
  onSmoke(pos) {
    effects.smokeAt(pos, GRENADES.smoke.radius);
  },
  onFrag(pos) {
    effects.explosion(pos);
    audio.explosion();
    damageRadius(pos, GRENADES.frag.radius, GRENADES.frag.damage, true);
    bots.hear(pos.x, pos.z, elapsed);
  },
  onFlash(pos) {
    const now = elapsed;
    for (const bot of bots.bots) {
      if (!bot.alive) continue;
      const d = bot.position.distanceTo(pos);
      if (d > GRENADES.flash.radius) continue;
      const fwd = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
      const toFlash = new THREE.Vector3(pos.x - bot.position.x, 0, pos.z - bot.position.z).normalize();
      if (fwd.dot(toFlash) > -0.2) bot.blindUntil = now + GRENADES.flash.duration;
    }
    camera.getWorldDirection(direction);
    const toFlash = new THREE.Vector3(pos.x - camera.position.x, pos.y - camera.position.y, pos.z - camera.position.z);
    const dist = toFlash.length();
    toFlash.normalize();
    if (dist < GRENADES.flash.radius && direction.dot(toFlash) > 0.3) hud.flashWhite(900);
  },
};

function startRound() {
  match.phase = PHASE.BUY;
  match.phaseLeft = BUY_SECONDS;
  match.timer = ROUND_SECONDS;
  health = 100;
  alive = true;
  bloom = 0;
  body.position.copy(ATTACKER_SPAWN);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  weapons.refillRound();
  bots.reset(BOT_SPAWNS);
  bomb.reset();
  grenades.reset();
  hud.setHealth(100);
  hud.setMoney(match.money);
  hud.setScore(match.wins.you, match.wins.foe);
  hud.setAlive(4);
  hud.setBomb('');
  hud.showPlant(null);
  hud.setAmmo(weapons.state.mag[weapons.state.current], weapons.state.reserve[weapons.state.current], weapons.def().name, weapons.state.grenades);
  hud.banner(`Round ${match.round}`, match.round === 1 ? 'Buy up, then take a site' : '', 2200);
  syncCamera();
}

function endRound(winner, reason) {
  if (match.phase === PHASE.ROUND_END || match.phase === PHASE.MATCH_END) return;
  match.phase = PHASE.ROUND_END;
  match.roundWinner = winner;
  match.roundReason = reason;
  match.wins[winner] += 1;
  match.money += winner === 'you' ? WIN_BONUS : LOSS_BONUS;
  roundEndLeft = 4;
  hud.setScore(match.wins.you, match.wins.foe);
  hud.setMoney(match.money);
  hud.setBomb('');
  hud.showPlant(null);
  hud.banner(winner === 'you' ? 'Round won' : 'Round lost', `${reason}  ·  +$${winner === 'you' ? WIN_BONUS : LOSS_BONUS}`, 3800);
  if (winner === 'you') audio.roundWin();
  else audio.roundLose();
  if (document.pointerLockElement) document.exitPointerLock();
}

function resetMatch() {
  match.round = 1;
  match.wins.you = 0;
  match.wins.foe = 0;
  match.money = 800;
  match.kills.you = 0;
  match.kills.foe = 0;
  weapons.resetMatch();
  startRound();
}

function toggleBuy() {
  if (match.phase !== PHASE.BUY || !alive) return;
  buyOpen = !buyOpen;
  hud.showBuy(buyOpen, match.money, weapons.state.owned, weapons.state.grenades);
  if (buyOpen) {
    if (document.pointerLockElement) document.exitPointerLock();
  } else {
    input.requestLock();
  }
}

function onBuy(id) {
  const price = WEAPONS[id] ? WEAPONS[id].price : GRENADES[id].price;
  if (match.money < price) return;
  if (!weapons.buy(id)) return;
  match.money -= price;
  hud.setMoney(match.money);
  hud.showBuy(true, match.money, weapons.state.owned, weapons.state.grenades);
  hud.setAmmo(weapons.state.mag[weapons.state.current], weapons.state.reserve[weapons.state.current], weapons.def().name, weapons.state.grenades);
  audio.buy();
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (match.phase === PHASE.MATCH_END) {
    resetMatch();
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  if (match.phase === PHASE.MENU) {
    resetMatch();
  }
  hud.hideOverlay();
  input.requestLock();
});
hud.onBuy(onBuy);
hud.onBuyClose(() => toggleBuy());

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (buyOpen) {
      buyOpen = false;
      hud.showBuy(false, match.money, weapons.state.owned, weapons.state.grenades);
    }
  } else if (match.phase === PHASE.MATCH_END) {
    hud.showOverlay('end', `Final score ${match.wins.you} — ${match.wins.foe}. ${match.wins.you > match.wins.foe ? 'You take the match.' : 'The defenders take the match.'}`);
  } else if (!buyOpen && match.phase !== PHASE.MENU) {
    hud.showOverlay(started ? 'paused' : 'start', 0);
  }
}

function step(dt) {
  elapsed += dt;
  bloom = Math.max(0, bloom - dt * 0.03);
  if (match.phase === PHASE.BUY) {
    match.phaseLeft -= dt;
    if (match.phaseLeft <= 0) {
      match.phase = PHASE.LIVE;
      match.timer = ROUND_SECONDS;
      hud.banner('Go', 'Take a site', 1400);
    }
  } else if (match.phase === PHASE.LIVE) {
    match.timer -= dt;
    if (match.timer <= 0 && bomb.bomb.state !== 'planted' && bomb.bomb.state !== 'defusing') {
      endRound('foe', 'Time expired');
    }
  } else if (match.phase === PHASE.ROUND_END) {
    roundEndLeft -= dt;
    if (roundEndLeft <= 0) {
      if (match.wins.you >= WIN_ROUNDS || match.wins.foe >= WIN_ROUNDS) {
        match.phase = PHASE.MATCH_END;
        hud.showOverlay('end', `Final score ${match.wins.you} — ${match.wins.foe}. ${match.wins.you > match.wins.foe ? 'You take the match.' : 'The defenders take the match.'}`);
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        match.round += 1;
        startRound();
      }
    }
  }

  if (match.phase === PHASE.LIVE || match.phase === PHASE.BUY) {
    player.step(dt, input.state.keys);
    // Footsteps.
    const speed = player.groundSpeed();
    if (player.state.onGround && speed > 1) {
      stepAcc += speed * dt;
      if (stepAcc > 2.4) {
        stepAcc = 0;
        audio.step();
      }
    }
    weapons.step(dt);
    // Planting: hold E inside a site.
    const site = siteAt(body.position.x, body.position.z);
    if (match.phase === PHASE.LIVE && alive && input.state.keys.has('KeyE') && site) {
      bomb.plant(dt, site, bombEvents);
      hud.showPlant('PLANTING BOMB', bomb.bomb.plantProgress / PLANT_SECONDS);
    } else {
      bomb.cancelPlant();
      if (bomb.bomb.state === 'defusing') hud.showPlant('DEFUSING', bomb.bomb.defuseProgress / DEFUSE_SECONDS);
      else hud.showPlant(null);
    }
    bomb.update(dt, { playerAlive: alive, nearestBot: (s) => bots.nearestToBomb(s) }, bombEvents);
    bots.step(dt, elapsed, botCtx);
    grenades.step(dt, grenadeCtx);
    effects.step(dt);
    hud.setTimer(match.phase === PHASE.BUY ? Math.ceil(match.phaseLeft) : Math.max(0, match.timer), match.phase === PHASE.BUY ? 'buy' : 'live');
    hud.setCrosshairGap(6 + weapons.spread(speed) * 900 + bloom * 400);
  } else if (match.phase === PHASE.ROUND_END || match.phase === PHASE.MATCH_END) {
    weapons.step(dt);
    bots.step(dt, elapsed, botCtx);
    grenades.step(dt, grenadeCtx);
    effects.step(dt);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (alive && (match.phase === PHASE.LIVE || match.phase === PHASE.BUY)) player.look(look.x, look.y);
    // Weapon slots 1-5.
    for (let i = 0; i < SLOTS.length; i += 1) {
      if (input.takePressed(`Digit${i + 1}`)) {
        if (weapons.select(SLOTS[i])) {
          hud.setAmmo(weapons.state.mag[weapons.state.current] ?? 0, weapons.state.reserve[weapons.state.current] ?? 0, weapons.isGrenade() ? GRENADES[weapons.state.current].name : weapons.def().name, weapons.state.grenades);
        }
      }
    }
    if (input.takePressed('KeyG')) {
      const order = ['frag', 'smoke', 'flash'];
      const cur = order.indexOf(weapons.state.current);
      for (let k = 1; k <= 3; k += 1) {
        const next = order[(cur + k) % 3];
        if (weapons.state.grenades[next] > 0) {
          weapons.select(next);
          break;
        }
      }
    }
    if (input.takePressed('KeyB')) toggleBuy();
    if (input.state.keys.has('KeyR')) weapons.reload();
    const def = weapons.def();
    // Firing and throwing only during live play; moving and switching are fine in buy time.
    if (alive && match.phase === PHASE.LIVE) {
      if (weapons.isGrenade()) {
        if (input.takeFired() && weapons.ready()) {
          const type = weapons.state.current;
          if (weapons.takeGrenade()) {
            camera.getWorldDirection(direction);
            muzzleWorld(origin);
            grenades.spawn(type, origin, direction);
            hud.setAmmo(0, 0, GRENADES[type].name, weapons.state.grenades);
          }
        }
      } else if (def.auto) {
        if (input.state.firing && weapons.ready()) shoot(weapons.spread(player.groundSpeed()) + bloom);
      } else if (input.takeFired() && weapons.ready()) {
        shoot(weapons.spread(player.groundSpeed()) + bloom);
      }
    }
    input.clearPressed();
    accumulator += dt;
    let steps = 0;
    // Up to 20 fixed steps per frame: on a slow software renderer the sim must
    // still keep up with wall-clock, or rounds would take minutes to end.
    while (accumulator >= FIXED_STEP && steps < 20) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 20) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  resetMatch();
  if (name === 'start') {
    body.position.copy(ATTACKER_SPAWN);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start', 0);
  } else if (name === 'buy') {
    match.money = 5200;
    weapons.buy('rifle');
    weapons.buy('frag');
    weapons.buy('smoke');
    weapons.select('rifle');
    hud.setMoney(match.money);
    hud.setAmmo(weapons.state.mag.rifle, weapons.state.reserve.rifle, 'VK-7 Rifle', weapons.state.grenades);
    body.position.copy(ATTACKER_SPAWN);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showBuy(true, match.money, weapons.state.owned, weapons.state.grenades);
  } else if (name === 'play') {
    // Two defenders pushed into the mid lane so the frame shows a fight.
    bots.bots[0].position.set(-1.5, 0, -3);
    bots.bots[1].position.set(2, 0, -6);
    bots.bots[0].baseYaw = Math.PI;
    bots.bots[1].baseYaw = Math.PI;
    bots.bots[0].mode = 'hold';
    bots.bots[1].mode = 'hold';
    match.phase = PHASE.LIVE;
    match.timer = 87;
    weapons.buy('rifle');
    weapons.select('rifle');
    body.position.set(0, 0, 6);
    settle(20);
    aimAt(new THREE.Vector3(bots.bots[0].position.x, 1.2, bots.bots[0].position.z));
    shoot(0);
    settle(2);
    aimAt(new THREE.Vector3(bots.bots[0].position.x, 1.2, bots.bots[0].position.z));
    shoot(0);
    settle(2);
    aimAt(new THREE.Vector3(bots.bots[1].position.x, 1.2, bots.bots[1].position.z));
    shoot(0);
    settle(2);
    hud.setScore(0, 0);
    hud.setTimer(87, 'live');
    document.getElementById('banner').classList.add('hidden');
  } else {
    // end: round won at site A, two bots down, bomb planted.
    match.phase = PHASE.ROUND_END;
    roundEndLeft = 60; // hold the banner for the capture; do not advance the round
    match.wins.you = 2;
    match.wins.foe = 1;
    bots.bots[0].alive = false;
    bots.bots[0].fall = 1;
    bots.bots[0].mesh.group.rotation.x = -1.45;
    bots.bots[1].alive = false;
    bots.bots[1].fall = 1;
    bots.bots[1].mesh.group.rotation.x = -1.45;
    bots.bots[0].position.set(-9, 0, -8);
    bots.bots[1].position.set(-12, 0, -10.5);
    hud.setAlive(2);
    hud.setScore(2, 1);
    hud.setBomb('BOMB PLANTED · SITE A');
    hud.setTimer(0, 'live');
    body.position.set(-7, 0, -3.5);
    settle(10);
    aimAt(new THREE.Vector3(-10.5, 1, -9.5));
    effects.step(1); // clear any stray tracer from the settle before freezing
    hud.banner('Round won', 'Bomb detonated  ·  +$3250', 60000);
  }
  hud.setHealth(health);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
hud.setHealth(100);
hud.setMoney(match.money);
hud.setScore(0, 0);
hud.setAlive(4);
hud.setTimer(BUY_SECONDS, 'buy');
hud.setAmmo(weapons.state.mag.pistol, weapons.state.reserve.pistol, 'Sidekick P250', weapons.state.grenades);
// Test hook: live match state for headless verification (read-only snapshot).
window.__game = {
  get state() {
    return {
      phase: match.phase,
      round: match.round,
      timer: Math.round(match.timer * 10) / 10,
      phaseLeft: Math.round(match.phaseLeft * 10) / 10,
      wins: { ...match.wins },
      money: match.money,
      health: Math.round(health),
      alive,
      botsAlive: bots.aliveCount(),
      bomb: bomb.bomb.state,
      playerPos: [Math.round(body.position.x * 10) / 10, Math.round(body.position.z * 10) / 10],
    };
  },
};
if (shot) runShot(shot);
else requestAnimationFrame(frame);
