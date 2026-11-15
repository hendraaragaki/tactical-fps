// Four defenders: they hold the sites, patrol routes, react to sight and sound, rotate
// to a planted bomb and defuse it when the attacker is down. Each bot is a small state
// machine; the shooting itself is resolved by main.js through the ctx callbacks.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { findPath } from './map.js';

const HEALTH = 100;
const WALK_SPEED = 3.2;
const EYE = 1.5;
const REACT_MIN = 0.35;
const REACT_MAX = 0.6;
const BURST_MIN = 3;
const BURST_MAX = 5;
const SHOT_GAP = 0.15;
const PAUSE_MIN = 0.6;
const PAUSE_MAX = 1.1;
const VISION_RANGE = 30;
const VISION_HALF_FOV = 0.96; // ~55 degrees
const LOSE_SIGHT_SECONDS = 2.5;
const HEAR_RANGE = 22;
const DAMAGE_NEAR = 11;
const DAMAGE_FAR = 6;

const POSTS = [
  { site: 'A', node: 10, route: [10, 6, 4, 6], patrol: true },
  { site: 'A', node: 10, route: [10], patrol: false },
  { site: 'B', node: 11, route: [11, 7, 5, 7], patrol: true },
  { site: 'B', node: 11, route: [11], patrol: false },
];

function buildBotMesh(scene) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.foe), roughness: 0.65, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sand), roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), bodyMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skinMat);
  head.position.y = 1.56;
  head.castShadow = true;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), darkMat);
  legL.position.set(-0.14, 0.31, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), darkMat);
  legR.position.set(0.14, 0.31, 0);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), darkMat);
  gun.position.set(0.2, 1.15, -0.3);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.08, 0.32), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5 }));
  stripe.position.y = 1.32;
  group.add(torso, head, legL, legR, gun, stripe);
  scene.add(group);
  return { group, torso, head, legL, legR };
}

export function createBots(scene, spawns, random) {
  const bots = [];
  const hitMeshes = [];
  for (let i = 0; i < 4; i += 1) {
    const post = POSTS[i];
    const spawn = spawns[post.site][i % 2];
    const mesh = buildBotMesh(scene);
    const bot = {
      id: i,
      name: ['Rook', 'Vex', 'Hound', 'Mira'][i],
      mesh,
      position: spawn.clone(),
      yaw: Math.PI,
      health: HEALTH,
      alive: true,
      mode: 'hold',
      post,
      routeIndex: 0,
      path: null,
      pathIndex: 0,
      seenAt: -99,
      lastSeen: new THREE.Vector3(),
      reactAt: 0,
      burstLeft: 0,
      shotAt: 0,
      pauseUntil: 0,
      strafeDir: 1,
      strafeUntil: 0,
      scanPhase: random() * Math.PI * 2,
      baseYaw: Math.PI,
      fall: 0,
      hearAt: -99,
      hearPos: new THREE.Vector3(),
      visionAt: 0,
      blindUntil: 0,
    };
    mesh.torso.userData.bot = bot;
    mesh.torso.userData.part = 'torso';
    mesh.head.userData.bot = bot;
    mesh.head.userData.part = 'head';
    hitMeshes.push(mesh.torso, mesh.head);
    bots.push(bot);
  }

  function setPath(bot, tx, tz) {
    bot.path = findPath(bot.position.x, bot.position.z, tx, tz);
    bot.pathIndex = 0;
  }

  function faceToward(bot, x, z, dt, rate) {
    const target = Math.atan2(-(x - bot.position.x), -(z - bot.position.z));
    let diff = target - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
    bot.yaw += step;
  }

  function moveAlongPath(bot, dt, ctx) {
    if (!bot.path || bot.pathIndex >= bot.path.length) return true;
    const target = bot.path[bot.pathIndex];
    const dx = target.x - bot.position.x;
    const dz = target.z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35) {
      bot.pathIndex += 1;
      return bot.pathIndex >= bot.path.length;
    }
    const speed = WALK_SPEED;
    const nx = bot.position.x + (dx / dist) * speed * dt;
    const nz = bot.position.z + (dz / dist) * speed * dt;
    if (ctx.isFree(nx, bot.position.z)) bot.position.x = nx;
    if (ctx.isFree(bot.position.x, nz)) bot.position.z = nz;
    faceToward(bot, target.x, target.z, dt, 8);
    return false;
  }

  function canSee(bot, ctx, now) {
    const p = ctx.playerPos;
    const dx = p.x - bot.position.x;
    const dy = (p.y + 1.2) - EYE;
    const dz = p.z - bot.position.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > VISION_RANGE) return false;
    const fwdX = -Math.sin(bot.yaw);
    const fwdZ = -Math.cos(bot.yaw);
    const dot = (dx * fwdX + dz * fwdZ) / (Math.hypot(dx, dz) || 1);
    if (dist > 3 && dot < Math.cos(VISION_HALF_FOV)) return false;
    const from = new THREE.Vector3(bot.position.x, EYE, bot.position.z);
    const to = new THREE.Vector3(p.x, p.y + 1.2, p.z);
    if (ctx.losBlocked(from, to)) return false;
    return true;
  }

  function startEngage(bot, now) {
    bot.mode = 'engage';
    bot.reactAt = now + REACT_MIN + random() * (REACT_MAX - REACT_MIN);
    bot.burstLeft = 0;
    bot.pauseUntil = 0;
  }

  function stepBot(bot, dt, now, ctx) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.mesh.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    if (now < bot.blindUntil) return; // flashed: frozen, cannot see or shoot.
    // Vision, staggered so not every bot raycasts every step.
    // Bots only engage during live play: buy time and round end are a ceasefire.
    if (ctx.canEngage !== false && now - bot.visionAt > 0.12) {
      bot.visionAt = now;
      if (ctx.playerAlive && canSee(bot, ctx, now)) {
        bot.seenAt = now;
        bot.lastSeen.copy(ctx.playerPos);
        if (bot.mode !== 'engage') startEngage(bot, now);
      }
    }
    const p = ctx.playerPos;
    if (bot.mode === 'engage') {
      if (ctx.canEngage === false) {
        bot.mode = 'hold';
        return;
      }
      faceToward(bot, p.x, p.z, dt, 10);
      if (now - bot.seenAt > LOSE_SIGHT_SECONDS) {
        bot.mode = 'investigate';
        setPath(bot, bot.lastSeen.x, bot.lastSeen.z);
      } else if (now >= bot.reactAt) {
        // Strafe while firing so the player cannot just pre-aim a still target.
        if (now > bot.strafeUntil) {
          bot.strafeDir = random() < 0.5 ? -1 : 1;
          bot.strafeUntil = now + 0.6 + random() * 0.7;
        }
        const sx = Math.cos(bot.yaw) * bot.strafeDir;
        const sz = -Math.sin(bot.yaw) * bot.strafeDir;
        const nx = bot.position.x + sx * WALK_SPEED * 0.55 * dt;
        const nz = bot.position.z + sz * WALK_SPEED * 0.55 * dt;
        if (ctx.isFree(nx, bot.position.z)) bot.position.x = nx;
        if (ctx.isFree(bot.position.x, nz)) bot.position.z = nz;
        if (now >= bot.pauseUntil) {
          if (bot.burstLeft <= 0) {
            bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
          }
          if (now - bot.shotAt >= SHOT_GAP) {
            bot.shotAt = now;
            bot.burstLeft -= 1;
            const dist = bot.position.distanceTo(p);
            const damage = dist < 12 ? DAMAGE_NEAR : DAMAGE_FAR;
            ctx.shootFrom(bot, damage);
            if (bot.burstLeft <= 0) bot.pauseUntil = now + PAUSE_MIN + random() * (PAUSE_MAX - PAUSE_MIN);
          }
        }
      }
      return;
    }
    if (bot.mode === 'rotate') {
      const done = moveAlongPath(bot, dt, ctx);
      if (done) bot.mode = 'hold';
      return;
    }
    if (bot.mode === 'investigate') {
      const done = moveAlongPath(bot, dt, ctx);
      if (done) {
        bot.mode = bot.post.patrol ? 'patrol' : 'hold';
        bot.routeIndex = 0;
      }
      return;
    }
    if (bot.mode === 'patrol') {
      if (!bot.path) {
        const node = bot.post.route[bot.routeIndex % bot.post.route.length];
        const pos = ctx.nodePos(node);
        if (Math.hypot(pos.x - bot.position.x, pos.z - bot.position.z) < 0.6) {
          bot.routeIndex = (bot.routeIndex + 1) % bot.post.route.length;
        } else {
          setPath(bot, pos.x, pos.z);
        }
      } else {
        const done = moveAlongPath(bot, dt, ctx);
        if (done) {
          bot.path = null;
          bot.routeIndex = (bot.routeIndex + 1) % bot.post.route.length;
        }
      }
      return;
    }
    // hold: scan the site around the post's facing.
    bot.yaw = bot.baseYaw + Math.sin(now * 0.6 + bot.scanPhase) * 0.7;
  }

  return {
    bots,
    hitMeshes,
    aliveCount() {
      return bots.filter((b) => b.alive).length;
    },
    reset(spawnsForRound) {
      for (let i = 0; i < bots.length; i += 1) {
        const bot = bots[i];
        const spawn = spawnsForRound[bot.post.site][i % 2];
        bot.position.copy(spawn);
        bot.yaw = Math.PI;
        bot.health = HEALTH;
        bot.alive = true;
        bot.mode = bot.post.patrol ? 'patrol' : 'hold';
        bot.routeIndex = 0;
        bot.path = null;
        bot.pathIndex = 0;
        bot.seenAt = -99;
        bot.fall = 0;
        bot.blindUntil = 0;
        bot.mesh.group.rotation.set(0, 0, 0);
        bot.mesh.group.position.copy(bot.position);
        bot.mesh.group.visible = true;
      }
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.health -= amount;
      if (bot.health > 0) return false;
      bot.alive = false;
      bot.fall = 0;
      return true;
    },
    hear(x, z, now) {
      for (const bot of bots) {
        if (!bot.alive || bot.mode === 'engage' || bot.mode === 'rotate') continue;
        const dx = bot.position.x - x;
        const dz = bot.position.z - z;
        if (dx * dx + dz * dz < HEAR_RANGE * HEAR_RANGE) {
          bot.hearAt = now;
          bot.hearPos.set(x, 0, z);
          if (bot.mode !== 'investigate') {
            bot.mode = 'investigate';
            setPath(bot, x, z);
          }
        }
      }
    },
    rotateTo(site, now) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        bot.mode = 'rotate';
        setPath(bot, site.center.x, site.center.z);
      }
    },
    nearestToBomb(site) {
      let best = null;
      let bestD = Infinity;
      for (const bot of bots) {
        if (!bot.alive) continue;
        const d = bot.position.distanceTo(site.center);
        if (d < bestD) {
          bestD = d;
          best = bot;
        }
      }
      return best;
    },
    step(dt, now, ctx) {
      for (const bot of bots) stepBot(bot, dt, now, ctx);
      for (const bot of bots) {
        bot.mesh.group.position.copy(bot.position);
        bot.mesh.group.rotation.y = bot.yaw;
        if (bot.alive) bot.mesh.group.rotation.x = 0;
      }
    },
  };
}
