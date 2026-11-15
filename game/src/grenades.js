// Thrown grenades: a frag that bursts, a smoke that blocks sight, a flash that blinds.
// One small sphere per live grenade, gravity and one floor bounce; the effects and the
// damage go out through the ctx callbacks main.js provides.
import * as THREE from 'three';
import { GRENADES } from './weapons.js';
import { PALETTE } from './palette.js';

const GRAVITY = 12;
const THROW_SPEED = 15;

export function createGrenades(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.4 }),
  );
  const live = [];
  const smokes = [];

  function spawn(type, origin, dir) {
    const m = mesh.clone();
    m.position.copy(origin);
    group.add(m);
    live.push({
      type,
      mesh: m,
      pos: origin.clone(),
      vel: new THREE.Vector3(dir.x * THROW_SPEED, dir.y * THROW_SPEED + 4.2, dir.z * THROW_SPEED),
      fuse: type === 'flash' ? 0.55 : type === 'frag' ? 1.15 : 99,
      bounced: 0,
    });
  }

  function step(dt, ctx) {
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const g = live[i];
      g.vel.y -= GRAVITY * dt;
      g.pos.addScaledVector(g.vel, dt);
      g.fuse -= dt;
      if (g.pos.y < 0.12) {
        g.pos.y = 0.12;
        if (g.type === 'smoke') {
          smokes.push({ pos: g.pos.clone(), radius: GRENADES.smoke.radius, until: ctx.now + GRENADES.smoke.duration });
          ctx.onSmoke(g.pos.clone());
          group.remove(g.mesh);
          live.splice(i, 1);
          continue;
        }
        if (Math.abs(g.vel.y) > 2 && g.bounced < 1) {
          g.vel.y = -g.vel.y * 0.35;
          g.vel.x *= 0.6;
          g.vel.z *= 0.6;
          g.bounced += 1;
        } else {
          g.vel.set(0, 0, 0);
          if (g.type === 'frag') g.fuse = Math.min(g.fuse, 0.25);
        }
      }
      g.mesh.position.copy(g.pos);
      if (g.fuse <= 0) {
        if (g.type === 'frag') {
          ctx.onFrag(g.pos.clone());
        } else if (g.type === 'flash') {
          ctx.onFlash(g.pos.clone());
        }
        group.remove(g.mesh);
        live.splice(i, 1);
      }
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      if (ctx.now > smokes[i].until) smokes.splice(i, 1);
    }
  }

  return {
    smokes,
    spawn,
    step,
    reset() {
      for (const g of live) group.remove(g.mesh);
      live.length = 0;
      smokes.length = 0;
    },
  };
}
