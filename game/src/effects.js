// Effects: pooled tracers, muzzle flashes, impact sparks, explosions. The hot
// loops make no new objects, so a firefight costs no garbage collection. v2
// adds a grey smoke puff on every explosion. (v3 removed the drifting dust
// motes: 220 near-invisible dots cost ~1,200 dossier bytes the text cap needs.)
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_PARTICLES = 5;
const PARTICLES_PER_BURST = 90;

export function createEffects(scene) {
  // ---- tracers: thin glowing lines that fade in 90 ms
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, geo, mat, life: 0 });
  }
  let tracerCursor = 0;

  // ---- muzzle flashes: three pooled quads + lights, round-robin
  const flashTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const g = canvas.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255, 236, 180, 1)');
    grad.addColorStop(0.35, 'rgba(255, 190, 90, 0.85)');
    grad.addColorStop(0.7, 'rgba(255, 140, 40, 0.25)');
    grad.addColorStop(1, 'rgba(255, 120, 20, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const flashes = [];
  for (let i = 0; i < 3; i += 1) {
    const mat = new THREE.MeshBasicMaterial({ map: flashTexture, color: 0xffc861, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), mat);
    mesh.visible = false;
    scene.add(mesh);
    const light = new THREE.PointLight(0xffb347, 0, 9, 1.8);
    scene.add(light);
    flashes.push({ mesh, mat, light, life: 0 });
  }
  let flashCursor = 0;

  // ---- impact particles: five Points clouds, round-robin
  const particleSystems = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    const positions = new Float32Array(PARTICLES_PER_BURST * 3);
    const velocities = new Float32Array(PARTICLES_PER_BURST * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.09, transparent: true, opacity: 0, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    scene.add(points);
    particleSystems.push({ points, geo, mat, positions, velocities, life: 0 });
  }
  let particleCursor = 0;

  // ---- explosion: an expanding shell, a light and a particle burst
  const boomMat = new THREE.MeshBasicMaterial({ color: 0xff8c2a, transparent: true, opacity: 0, depthWrite: false });
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), boomMat);
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff7a1a, 0, 26, 1.6);
  scene.add(boomLight);
  let boomLife = 0;

  const _v = new THREE.Vector3();

  function tracer(from, to, color = 0xffd27a) {
    const t = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
    const pos = t.geo.attributes.position.array;
    pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
    pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
    t.geo.attributes.position.needsUpdate = true;
    t.mat.color.setHex(color);
    t.mat.opacity = 0.9;
    t.line.visible = true;
    t.life = 0.09;
  }

  function muzzleFlash(position, direction, camera) {
    const f = flashes[flashCursor];
    flashCursor = (flashCursor + 1) % flashes.length;
    f.mesh.position.copy(position);
    f.mesh.lookAt(_v.copy(position).add(direction));
    f.mesh.visible = true;
    f.mat.opacity = 0.95;
    f.mesh.scale.setScalar(0.7 + Math.random() * 0.4);
    f.light.position.copy(position);
    f.light.intensity = 14;
    f.life = 0.06;
    void camera;
  }

  function impact(point, normal, color = 0xffd9a0) {
    const p = particleSystems[particleCursor];
    particleCursor = (particleCursor + 1) % MAX_PARTICLES;
    for (let i = 0; i < PARTICLES_PER_BURST; i += 1) {
      const i3 = i * 3;
      p.positions[i3] = point.x;
      p.positions[i3 + 1] = point.y;
      p.positions[i3 + 2] = point.z;
      const spread = 2.2;
      p.velocities[i3] = normal.x * 2.4 + (Math.random() - 0.5) * spread;
      p.velocities[i3 + 1] = Math.abs(normal.y) * 2.4 + Math.random() * 2.6;
      p.velocities[i3 + 2] = normal.z * 2.4 + (Math.random() - 0.5) * spread;
    }
    p.geo.attributes.position.needsUpdate = true;
    p.mat.color.setHex(color);
    p.mat.opacity = 0.95;
    p.mat.size = 0.09;
    p.points.visible = true;
    p.life = 0.55;
    p.maxLife = 0.55;
    p.gravity = 9;
  }

  /** A slow grey puff that hangs after an explosion, reusing a particle pool. */
  function smoke(point) {
    const p = particleSystems[particleCursor];
    particleCursor = (particleCursor + 1) % MAX_PARTICLES;
    for (let i = 0; i < PARTICLES_PER_BURST; i += 1) {
      const i3 = i * 3;
      p.positions[i3] = point.x + (Math.random() - 0.5) * 1.2;
      p.positions[i3 + 1] = point.y + Math.random() * 0.8;
      p.positions[i3 + 2] = point.z + (Math.random() - 0.5) * 1.2;
      p.velocities[i3] = (Math.random() - 0.5) * 0.7;
      p.velocities[i3 + 1] = 0.8 + Math.random() * 0.9;
      p.velocities[i3 + 2] = (Math.random() - 0.5) * 0.7;
    }
    p.geo.attributes.position.needsUpdate = true;
    p.mat.color.setHex(0x8a8f99);
    p.mat.opacity = 0.55;
    p.mat.size = 0.22;
    p.points.visible = true;
    p.life = 1.6;
    p.maxLife = 1.6;
    p.gravity = -0.3;
  }

  function explosion(point) {
    boom.position.copy(point);
    boom.visible = true;
    boomLife = 0.7;
    boomLight.position.copy(point);
    boomLight.position.y += 1;
    boomLight.intensity = 60;
    impact(point, new THREE.Vector3(0, 1, 0), 0xff8c2a);
    impact(point, new THREE.Vector3(0, 1, 0), 0xffd27a);
    smoke(point);
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.line.visible = false;
        t.mat.opacity = 0;
      } else {
        t.mat.opacity = (t.life / 0.09) * 0.9;
      }
    }
    for (const f of flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.mesh.visible = false;
        f.mat.opacity = 0;
        f.light.intensity = 0;
      } else {
        f.mat.opacity = (f.life / 0.06) * 0.95;
        f.light.intensity = (f.life / 0.06) * 14;
      }
    }
    for (const p of particleSystems) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.points.visible = false;
        p.mat.opacity = 0;
        p.mat.size = 0.09;
        continue;
      }
      for (let i = 0; i < PARTICLES_PER_BURST; i += 1) {
        const i3 = i * 3;
        p.velocities[i3 + 1] -= (p.gravity ?? 9) * dt;
        p.positions[i3] += p.velocities[i3] * dt;
        p.positions[i3 + 1] += p.velocities[i3 + 1] * dt;
        p.positions[i3 + 2] += p.velocities[i3 + 2] * dt;
        if (p.positions[i3 + 1] < 0.02) p.positions[i3 + 1] = 0.02;
      }
      p.geo.attributes.position.needsUpdate = true;
      p.mat.opacity = (p.life / (p.maxLife || 0.55)) * 0.95;
    }
    if (boomLife > 0) {
      boomLife -= dt;
      const k = 1 - boomLife / 0.7;
      boom.scale.setScalar(0.5 + k * 7);
      boomMat.opacity = Math.max(0, 0.85 * (1 - k));
      boomLight.intensity = Math.max(0, 60 * (1 - k));
      if (boomLife <= 0) {
        boom.visible = false;
        boomLight.intensity = 0;
      }
    }
  }

  return { tracer, muzzleFlash, impact, explosion, step };
}
