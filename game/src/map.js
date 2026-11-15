// Ember Yard: a walled freight yard with two bomb sites, A in the north-west and B in
// the north-east, a mid lane, a connector and two long lanes. Every box is a collider
// for the player and a surface a bullet stops on. Waypoints form the graph the bots
// walk; the sites are the zones the bomb is planted in.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint graph: [x, z, links...]. Bots walk it with BFS; every node is on open ground
// and every link is two-way.
const NODES = [
  [0, 11, 1, 16, 17], // 0 attacker spawn
  [0, 6, 0, 2, 16, 17], // 1 mid south
  [0, 2, 1, 3], // 2 mid
  [0, -2.5, 2, 4, 5, 6, 7], // 3 mid north / connector middle
  [-6.5, -2.5, 3, 6, 8], // 4 connector west
  [6.5, -2.5, 3, 7, 9], // 5 connector east
  [-9, -5.5, 3, 4, 10, 12], // 6 A approach
  [9, -5.5, 3, 5, 11, 13], // 7 B approach
  [-13, -2.5, 4, 12, 14], // 8 long A middle
  [13, -2.5, 5, 13, 15], // 9 long B middle
  [-11, -9.5, 6, 12], // 10 site A
  [11, -9.5, 7, 13], // 11 site B
  [-15, -8, 6, 8, 10], // 12 long A north
  [15, -8, 7, 9, 11], // 13 long B north
  [-15, 4, 8, 16], // 14 long A south
  [15, 4, 9, 17], // 15 long B south
  [-9, 8, 0, 1, 14], // 16 south-west yard
  [9, 8, 0, 1, 15], // 17 south-east yard
];

export const SITES = {
  A: { name: 'A', center: new THREE.Vector3(-11, 0, -9.5), minX: -15, maxX: -7, minZ: -12.5, maxZ: -7, color: PALETTE.siteA, node: 10 },
  B: { name: 'B', center: new THREE.Vector3(11, 0, -9.5), minX: 7, maxX: 15, minZ: -12.5, maxZ: -7, color: PALETTE.siteB, node: 11 },
};
export const ATTACKER_SPAWN = new THREE.Vector3(0, 0, 11);
export const BOT_SPAWNS = {
  A: [new THREE.Vector3(-11, 0, -9.5), new THREE.Vector3(-8, 0, -11)],
  B: [new THREE.Vector3(11, 0, -9.5), new THREE.Vector3(8, 0, -11)],
};

function labelTexture(text, fg, bg) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, 228, 228);
  ctx.fillStyle = fg;
  ctx.font = 'bold 150px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 138);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const colliders = [];
  const shootables = [];
  function box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  function decal(text, color, x, z, size) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: labelTexture(text, color, 'rgba(0,0,0,0.0)'), transparent: true, opacity: 0.85 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  function sign(text, color, x, y, z, ry) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 1.1),
      new THREE.MeshBasicMaterial({ map: labelTexture(text, color, '#241d16'), transparent: false }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    group.add(mesh);
  }

  // Ground and outer walls: 34 x 28 m, 4 m walls.
  box(34.4, 0.4, 28.4, 0, -0.2, 0, 'sand');
  box(0.4, 4, 28.4, -17.2, 2, 0, 'surface');
  box(0.4, 4, 28.4, 17.2, 2, 0, 'surface');
  box(34.4, 4, 0.4, 0, 2, -14.2, 'surface');
  box(34.4, 4, 0.4, 0, 2, 14.2, 'surface');

  // Mid doors: a wall at z=0 with a 2.4 m gap in the middle.
  box(1.3, 4, 0.4, -1.85, 2, 0, 'surface');
  box(1.3, 4, 0.4, 1.85, 2, 0, 'surface');
  // Connector south wall at z=-1 with three gaps: A side, mid, B side.
  box(3, 4, 0.4, -9.5, 2, -1, 'surface');
  box(3.5, 4, 0.4, -3.25, 2, -1, 'surface');
  box(3.5, 4, 0.4, 3.25, 2, -1, 'surface');
  box(3, 4, 0.4, 9.5, 2, -1, 'surface');
  // Site divider: A and B are separate rooms north of z=-7.
  box(0.4, 4, 7, 0, 2, -10.5, 'surface');
  // North strip divider stub at x=0, z=-7..-4 keeps the two approaches apart.
  box(0.4, 3, 3, 0, 1.5, -5.5, 'hairline');

  // Cover: crates to crouch behind, pillars, and a low platform on A.
  const crates = [
    [-4, 5], [4, 5], [-9, 2], [9, 2], [-6, -5.5], [6, -5.5], [0, -8],
    [-14.5, -2], [14.5, -2], [-11, -9.5], [-8, -11.5], [11, -9.5], [8, -11.5],
    [-2.5, 8.5], [2.5, 8.5],
  ];
  for (const [x, z] of crates) box(1.6, 1.1, 1.6, x, 0.55, z, 'hairline');
  box(1.2, 3.2, 1.2, -13, 1.6, 6, 'rust');
  box(1.2, 3.2, 1.2, 13, 1.6, 6, 'rust');
  box(1.2, 3.2, 1.2, 0, 1.6, -11.5, 'rust');
  box(6, 0.5, 2.4, -11, 0.25, -12.8, 'surface');

  // Site decals and signs.
  decal('A', PALETTE.siteA, -11, -9.5, 4.5);
  decal('B', PALETTE.siteB, 11, -9.5, 4.5);
  sign('A', PALETTE.siteA, -11, 3.1, -13.9, 0);
  sign('B', PALETTE.siteB, 11, 3.1, -13.9, 0);
  sign('MID', PALETTE.ink, 0, 3.1, 13.9, Math.PI);

  // Dusk light: a low warm sun from the west, cool fill from the east, dim sky.
  const sky = new THREE.HemisphereLight(new THREE.Color('#5a6b7d'), new THREE.Color(PALETTE.canvas), 1.35);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 3.0);
  key.position.set(-16, 10, 6);
  key.target.position.set(2, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -20;
  key.shadow.camera.right = 20;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d9bb5'), 0.8);
  fill.position.set(14, 9, 10);
  scene.add(fill);
  // Warm lamps over the two sites.
  for (const site of [SITES.A, SITES.B]) {
    const lamp = new THREE.PointLight(new THREE.Color(site.color), 20, 12, 1.6);
    lamp.position.set(site.center.x, 3.4, site.center.z);
    scene.add(lamp);
  }

  return { colliders, shootables, group };
}

export function nodePos(index) {
  const n = NODES[index];
  return { x: n[0], z: n[1] };
}

export function nearestNode(x, z) {  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < NODES.length; i += 1) {
    const dx = NODES[i][0] - x;
    const dz = NODES[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function findPath(fromX, fromZ, toX, toZ) {
  const start = nearestNode(fromX, fromZ);
  const goal = nearestNode(toX, toZ);
  if (start === goal) return [{ x: toX, z: toZ }];
  const prev = new Array(NODES.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  while (queue.length) {
    const node = queue.shift();
    if (node === goal) break;
    for (let i = 2; i < NODES[node].length; i += 1) {
      const next = NODES[node][i];
      if (prev[next] === -1) {
        prev[next] = node;
        queue.push(next);
      }
    }
  }
  if (prev[goal] === -1) return [{ x: toX, z: toZ }];
  const path = [];
  let node = goal;
  while (node !== start) {
    path.push({ x: NODES[node][0], z: NODES[node][1] });
    node = prev[node];
  }
  path.reverse();
  path.push({ x: toX, z: toZ });
  return path;
}

export function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return key;
  }
  return null;
}
