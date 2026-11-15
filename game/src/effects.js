// Pooled visual effects: tracers, impact sparks, smoke puffs and the bomb blast.
// Everything is allocated once and reused; nothing new is made in the hot loop.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 10;
const SPARKS = 5;
const SPARK_POINTS = 24;
const SMOKE_PUFFS = 14;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerAt = 0;

  const sparks = [];
  for (let i = 0; i < SPARKS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_POINTS * 3), 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.07, transparent: true, opacity: 0 }));
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, vel: new Float32Array(SPARK_POINTS * 3), life: 0 });
  }
  let sparkAt = 0;

  const smokeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8d8d94'), transparent: true, opacity: 0.32, depthWrite: false });
  const smokePuffs = [];
  for (let i = 0; i < SMOKE_PUFFS; i += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), smokeMat);
    puff.visible = false;
    scene.add(puff);
    smokePuffs.push({ mesh: puff, life: 0, max: 1 });
  }
  let smokeAt = 0;

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
  );
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 30);
  scene.add(blastLight);
  let blastLife = 0;

  const tmp = new THREE.Vector3();

  return {
    tracer(from, to) {
      const t = tracers[tracerAt];
      tracerAt = (tracerAt + 1) % TRACERS;
      const attr = t.line.geometry.getAttribute('position');
      attr.setXYZ(0, from.x, from.y, from.z);
      attr.setXYZ(1, to.x, to.y, to.z);
      attr.needsUpdate = true;
      t.line.material.opacity = 0.85;
      t.life = 0.09;
    },
    sparksAt(pos) {
      const s = sparks[sparkAt];
      sparkAt = (sparkAt + 1) % SPARKS;
      const attr = s.points.geometry.getAttribute('position');
      for (let i = 0; i < SPARK_POINTS; i += 1) {
        attr.setXYZ(i, pos.x, pos.y, pos.z);
        s.vel[i * 3] = (Math.random() - 0.5) * 4;
        s.vel[i * 3 + 1] = Math.random() * 3;
        s.vel[i * 3 + 2] = (Math.random() - 0.5) * 4;
      }
      attr.needsUpdate = true;
      s.points.material.opacity = 0.9;
      s.life = 0.35;
    },
    smokeAt(pos, radius) {
      for (let i = 0; i < 4; i += 1) {
        const p = smokePuffs[smokeAt];
        smokeAt = (smokeAt + 1) % SMOKE_PUFFS;
        tmp.set((Math.random() - 0.5) * radius, 0.5 + Math.random() * 1.4, (Math.random() - 0.5) * radius);
        p.mesh.position.copy(pos).add(tmp);
        const scale = radius * (0.55 + Math.random() * 0.5);
        p.mesh.scale.setScalar(scale);
        p.mesh.visible = true;
        p.life = 12;
        p.max = 12;
      }
    },
    explosion(pos) {
      blast.position.copy(pos);
      blast.visible = true;
      blast.scale.setScalar(0.5);
      blast.material.opacity = 0.9;
      blastLight.position.copy(pos).add(new THREE.Vector3(0, 1.5, 0));
      blastLight.intensity = 60;
      blastLife = 0.7;
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life > 0) {
          t.life -= dt;
          t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.85;
        }
      }
      for (const s of sparks) {
        if (s.life > 0) {
          s.life -= dt;
          const attr = s.points.geometry.getAttribute('position');
          for (let i = 0; i < SPARK_POINTS; i += 1) {
            s.vel[i * 3 + 1] -= 9 * dt;
            attr.setXYZ(i, attr.getX(i) + s.vel[i * 3] * dt, Math.max(0.02, attr.getY(i) + s.vel[i * 3 + 1] * dt), attr.getZ(i) + s.vel[i * 3 + 2] * dt);
          }
          attr.needsUpdate = true;
          s.points.material.opacity = Math.max(0, s.life / 0.35) * 0.9;
        }
      }
      for (const p of smokePuffs) {
        if (p.life > 0) {
          p.life -= dt;
          if (p.life <= 0) p.mesh.visible = false;
        }
      }
      if (blastLife > 0) {
        blastLife -= dt;
        const k = 1 - blastLife / 0.7;
        blast.scale.setScalar(0.5 + k * 9);
        blast.material.opacity = Math.max(0, 0.9 * (1 - k));
        blastLight.intensity = Math.max(0, 60 * (1 - k));
        if (blastLife <= 0) blast.visible = false;
      }
    },
  };
}
