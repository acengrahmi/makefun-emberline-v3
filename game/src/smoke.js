// smoke.js — smoke grenades. One job: a cloud that blocks sight. A grenade
// blooms into a drifting cloud that lives ~8 s; vision checks call
// blocksVision(a, b) and treat a ray crossing a live cloud as blocked. The
// player sees the same wall — honest cover for both sides, which is what
// makes it a tactical tool instead of a cheat.

import * as THREE from 'three';

const LIFE = 8;         // seconds a cloud lives — long enough to cross open ground, gone by the post-plant
const RADIUS = 3.4;     // metres of blocked sight at full bloom
const BLOOM = 1.1;      // seconds to reach full size

export class SmokeSystem {
  constructor(scene) {
    this.scene = scene;
    this.clouds = []; // {group, puffs[], born, x, y, z}
    this.geo = new THREE.SphereGeometry(1, 10, 8);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0xd8dde2, transparent: true, opacity: 0.42,
      depthWrite: false, fog: true,
    });
  }

  // Throw a smoke at (x, y, z). Returns the cloud record.
  spawn(x, y, z, now) {
    const group = new THREE.Group();
    const puffs = [];
    // Seven overlapping puffs make a lumpy cloud instead of one hard ball.
    const offs = [
      [0, 0, 0], [1.9, 0.5, 0.6], [-1.8, 0.4, -0.7], [0.7, 1.1, -1.6],
      [-0.9, -0.6, 1.7], [1.4, -0.7, -1.2], [-1.3, 0.9, 1.1],
    ];
    for (const [ox, oy, oz] of offs) {
      const m = new THREE.Mesh(this.geo, this.mat);
      m.position.set(ox, oy, oz);
      m.scale.setScalar(0.2);
      group.add(m);
      puffs.push(m);
    }
    group.position.set(x, y, z);
    this.scene.add(group);
    const cloud = { group, puffs, born: now, x, y, z };
    this.clouds.push(cloud);
    return cloud;
  }

  // Advance every cloud: bloom, drift, fade out, remove when spent.
  update(now, dt) {
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      const age = now - c.born;
      if (age >= LIFE) {
        this.scene.remove(c.group);
        this.clouds.splice(i, 1);
        continue;
      }
      const bloom = Math.min(1, age / BLOOM);
      const fade = age > LIFE - 2.5 ? (LIFE - age) / 2.5 : 1;
      const r = RADIUS * bloom;
      for (const p of c.puffs) p.scale.setScalar(Math.max(0.2, r * 0.62));
      this.mat.opacity = 0.42 * fade;
      // Slow drift so the cloud feels alive, never static.
      c.group.position.x += Math.sin(now * 0.4 + i) * dt * 0.12;
      c.group.position.z += Math.cos(now * 0.33 + i * 2) * dt * 0.1;
    }
  }

  // True when the segment a->b crosses any live cloud — one function, one rule
  // for bot vision and the player's tracers. `now` is game time.
  blocksVision(a, b, now) {
    for (const c of this.clouds) {
      const age = now - c.born;
      if (age < 0.4 || age >= LIFE) continue; // not yet bloomed, or spent
      if (segmentHitsSphere(a, b, c.group.position, RADIUS * 0.9)) return true;
    }
    return false;
  }

  get count() { return this.clouds.length; }
}

// Segment-sphere test: the closest point on segment ab to centre c, and
// whether it lies within radius r. Pure math, no allocations in the loop.
export function segmentHitsSphere(a, b, c, r) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? (acx * abx + acy * aby + acz * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = a.x + abx * t - c.x, dy = a.y + aby * t - c.y, dz = a.z + abz * t - c.z;
  return dx * dx + dy * dy + dz * dz < r * r;
}
