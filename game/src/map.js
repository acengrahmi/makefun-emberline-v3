// FOUNDRY YARD — an original industrial map: three sites (A Furnace, B Silos,
// C Crane under the gantry), a mid lane choked by the gantry crane, long lanes
// down both walls, diagonal alleys. This file also owns the waypoint graph
// the bots navigate and the line-of-sight test they see through. v2 adds the
// Upper Deck (y = 3.2, three staircases, reachable only through a stair node);
// v3 adds Site C and turns the dusk into golden hour.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOUNDS = { minX: -28, maxX: 28, minZ: -20, maxZ: 20 };
const DECK_Y = 3.2;

function makeTextTexture(text, { size = 256, fg = '#f0a830', bg = '#23262d', font = 96 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (bg !== null) {
    g.fillStyle = bg;
    g.fillRect(0, 0, size, size);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(10, 10, size - 20, size - 20);
  }
  g.fillStyle = fg;
  g.font = `700 ${font}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, size / 2, size / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(lines, { width = 512, height = 128, fg = '#ece7db', bg = '#1b1e26' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, width, height);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 56px system-ui, sans-serif`;
  g.fillText(lines[0], width / 2, lines.length > 1 ? 44 : height / 2);
  if (lines.length > 1) {
    g.font = `500 34px system-ui, sans-serif`;
    g.fillStyle = '#9aa1ad';
    g.fillText(lines[1], width / 2, 96);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeChevronTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(240, 168, 48, 0.85)';
  for (let i = 0; i < 3; i += 1) {
    const y = 30 + i * 72;
    g.beginPath();
    g.moveTo(48, y);
    g.lineTo(128, y + 34);
    g.lineTo(208, y);
    g.lineTo(208, y + 26);
    g.lineTo(128, y + 60);
    g.lineTo(48, y + 26);
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeHazardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = '#e0b32a';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#1b1e26';
  for (let x = -64; x < 320; x += 64) {
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 64, 0);
    g.lineTo(x + 32, 64);
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  // golden hour: amber at eye level — the dome is a sphere, so the horizon
  // band sits at the texture's middle (v ~ 0.5), not near the bottom, or the
  // sky reads mauve instead of amber. No stars: the sun is still up.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2e4a6b');
  grad.addColorStop(0.3, '#7a6a8a');
  grad.addColorStop(0.45, '#e8a34c');
  grad.addColorStop(0.58, '#f0b45e');
  grad.addColorStop(0.72, '#c98a5e');
  grad.addColorStop(1, '#3a2a1e');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  // the sun itself, low in the south-west, drawn as a soft disc
  const sun = g.createRadialGradient(150, 128, 4, 150, 128, 46);
  sun.addColorStop(0, 'rgba(255, 236, 180, 0.95)');
  sun.addColorStop(0.4, 'rgba(255, 196, 110, 0.55)');
  sun.addColorStop(1, 'rgba(255, 196, 110, 0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];
  const minimapRects = [];
  const minimapUpper = [];
  const flickerLights = [];

  const mats = {};
  for (const name of Object.keys(PALETTE)) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'amber' || name === 'ember' ? 0.5 : 0.92,
      metalness: name === 'steel' || name === 'steelDark' ? 0.45 : 0.05,
    });
  }
  const groundMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ground), roughness: 0.95, metalness: 0.02 });
  const groundDarkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.groundDark), roughness: 0.95, metalness: 0.02 });
  const deckMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.deck), roughness: 0.85, metalness: 0.25 });
  const emissiveAmber = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 1.6, roughness: 0.4 });
  const emissiveTeal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), emissive: new THREE.Color(PALETTE.teal), emissiveIntensity: 1.4, roughness: 0.4 });
  const emissiveOrange = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ff5a00'), emissive: new THREE.Color('#ff5a00'), emissiveIntensity: 2.2, roughness: 0.4 });
  const emissiveDeckEdge = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.deckEdge), emissive: new THREE.Color(PALETTE.deckEdge), emissiveIntensity: 1.8, roughness: 0.4 });

  function edges(mesh) {
    const line = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x14161a, transparent: true, opacity: 0.55 }),
    );
    mesh.add(line);
    return mesh;
  }

  function box(w, h, d, x, y, z, material, { solid = true, rect = true } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
      if (rect) minimapRects.push({ x: x - w / 2, z: z - d / 2, w, d, c: material === mats.steel ? '#3a3f4a' : material === mats.rust ? '#7a4a2e' : '#555a63' });
    }
    return mesh;
  }

  function cyl(r, h, x, y, z, material, segments = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    minimapRects.push({ x: x - r, z: z - r, w: r * 2, d: r * 2, c: '#4a505c' });
    return mesh;
  }

  function flat(w, d, x, z, material, y = 0.02) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // ---- sky: a golden-hour gradient dome, so the horizon is never flat grey
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(120, 24, 16),
    new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false }),
  );
  group.add(sky);

  // ---- ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(56.4, 40.4), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  flat(10, 40, -23, 0, groundDarkMat, 0.015);
  flat(10, 40, 23, 0, groundDarkMat, 0.015);
  flat(56, 4, 0, 17.5, groundDarkMat, 0.015);
  flat(56, 4, 0, -17.5, groundDarkMat, 0.015);
  flat(56, 0.5, 0, 0, new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hazard), roughness: 0.8 }), 0.03);
  flat(0.5, 40, -14, 0, new THREE.MeshStandardMaterial({ color: new THREE.Color('#3f444e'), roughness: 0.9 }), 0.03);
  flat(0.5, 40, 14, 0, new THREE.MeshStandardMaterial({ color: new THREE.Color('#3f444e'), roughness: 0.9 }), 0.03);

  // ---- painted chevrons on the lanes
  const chevronMat = new THREE.MeshBasicMaterial({ map: makeChevronTexture(), transparent: true, opacity: 0.9, depthWrite: false });
  const chev1 = flat(3, 3, -14, 4, chevronMat, 0.035);
  chev1.rotation.z = Math.PI;
  const chev2 = flat(3, 3, 14, 4, chevronMat, 0.035);
  chev2.rotation.z = Math.PI;
  // ---- hazard stripes at the staircases
  const hazardMat = new THREE.MeshBasicMaterial({ map: makeHazardTexture(), transparent: true, opacity: 0.95, depthWrite: false });
  flat(3.4, 1, -22.5, -10.9, hazardMat, 0.035);
  flat(3.4, 1, 22.5, -10.9, hazardMat, 0.035);
  flat(3.4, 1, 0, -10.9, hazardMat, 0.035);

  // ---- walls
  box(56.8, 5.5, 0.6, 0, 2.75, -20.3, mats.steelDark);
  box(56.8, 5.5, 0.6, 0, 2.75, 20.3, mats.steelDark);
  box(0.6, 5.5, 40.8, -28.3, 2.75, 0, mats.steelDark);
  box(0.6, 5.5, 40.8, 28.3, 2.75, 0, mats.steelDark);
  // wall caps in team colours
  box(56.8, 0.25, 0.7, 0, 5.6, 20.3, emissiveAmber, { solid: false, rect: false });
  box(56.8, 0.25, 0.7, 0, 5.6, -20.3, emissiveTeal, { solid: false, rect: false });

  // ---- site A: the Furnace (west). Shallow (2.5 m) so the deck slab clears it.
  const furnace = box(6, 5, 2.5, -24, 2.5, -13.75, mats.rust);
  edges(furnace);
  const chimney = cyl(1.1, 8, -25.5, 4, -13.5, mats.steelDark, 12);
  void chimney;
  box(3.4, 1.6, 0.5, -21, 1.9, -13.75, emissiveOrange, { solid: false, rect: false }); // furnace mouth glow
  const furnaceLight = new THREE.PointLight(new THREE.Color('#ff7a1a'), 26, 18, 1.6);
  furnaceLight.position.set(-20.5, 2, -12.5);
  scene.add(furnaceLight);
  flickerLights.push({ light: furnaceLight, base: 26, speed: 7, amp: 5 });
  const signA = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 4.4),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('A', { fg: '#f0a830' }), transparent: true }),
  );
  signA.position.set(-19, 4.4, -16.5);
  signA.rotation.y = Math.PI / 4;
  group.add(signA);

  // ---- site B: the Silos (east). One tall cylinder and a pipe run.
  cyl(2.6, 7.5, 23, 3.75, -12, mats.steel, 20);
  box(5, 0.8, 1.2, 20.5, 6.6, -12.2, mats.rust);
  const siloLight = new THREE.PointLight(new THREE.Color(PALETTE.teal), 18, 16, 1.6);
  siloLight.position.set(19, 2.2, -11.5);
  scene.add(siloLight);
  const signB = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 4.4),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('B', { fg: '#35c8b8' }), transparent: true }),
  );
  signB.position.set(19, 4.4, -16.5);
  signB.rotation.y = -Math.PI / 4;
  group.add(signB);

  // ---- site zones painted on the ground: a ring and a big letter in the middle
  const ringGeo = new THREE.RingGeometry(3.4, 5, 40);
  const ringA = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ringA.rotation.x = -Math.PI / 2;
  ringA.position.set(-19, 0.04, -13);
  group.add(ringA);
  const ringB = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.teal), transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ringB.rotation.x = -Math.PI / 2;
  ringB.position.set(19, 0.04, -13);
  group.add(ringB);
  const letterMatA = new THREE.MeshBasicMaterial({ map: makeTextTexture('A', { fg: '#f0a830', bg: null, font: 150 }), transparent: true, opacity: 0.75, depthWrite: false });
  const letterA = flat(4.5, 4.5, -19, -13, letterMatA, 0.032);
  void letterA;
  const letterMatB = new THREE.MeshBasicMaterial({ map: makeTextTexture('B', { fg: '#35c8b8', bg: null, font: 150 }), transparent: true, opacity: 0.75, depthWrite: false });
  const letterB = flat(4.5, 4.5, 19, -13, letterMatB, 0.032);
  void letterB;
  // ---- site C: the Crane. Green ring and letter under the gantry, sign hung
  // on the crane beam. The legs are cover, not a blocker (plant is distance-based).
  const ringC = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.siteC), transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ringC.rotation.x = -Math.PI / 2;
  ringC.position.set(0, 0.04, 2);
  group.add(ringC);
  const letterMatC = new THREE.MeshBasicMaterial({ map: makeTextTexture('C', { fg: '#c9f06a', bg: null, font: 150 }), transparent: true, opacity: 0.75, depthWrite: false });
  const letterC = flat(4.5, 4.5, 0, 2, letterMatC, 0.032);
  void letterC;
  const signC = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 1.75),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(['SITE C — CRANE', 'fast rotate site']), transparent: true }),
  );
  signC.position.set(0, 4.2, 0.62);
  signC.rotation.y = Math.PI;
  group.add(signC);

  // ---- mid: gantry crane choke
  box(0.9, 4.6, 0.9, -3.4, 2.3, 0, mats.rust);
  box(0.9, 4.6, 0.9, 3.4, 2.3, 0, mats.rust);
  box(8.4, 0.7, 1.1, 0, 4.9, 0, mats.steel);
  box(1.4, 1.0, 1.4, 1.2, 3.9, 0, mats.hazard);
  box(1.2, 0.6, 1.2, -1.6, 0.3, 0, mats.hazard); // hook counterweight on the ground
  // stepped platforms, 0.4 m tall so bots can step up them too
  box(3.2, 0.4, 2.2, -8, 0.2, 6, mats.steel);
  box(2.4, 0.4, 1.6, 8, 0.2, -4, mats.steel);

  // ---- THE UPPER DECK: a second floor along the north wall, y = 3.2.
  // One slab, columns, a railing to shoot over standing and hide behind
  // crouched, three staircases (A, mid, B) with gaps where they arrive.
  box(50, 0.3, 3, 0, DECK_Y - 0.15, -17, deckMat, { solid: true, rect: false });
  minimapUpper.push({ x: -25, z: -18.5, w: 50, d: 3 });
  box(50, 0.12, 0.18, 0, DECK_Y + 0.06, -15.42, emissiveDeckEdge, { solid: false, rect: false }); // edge glow
  // columns stay clear of the staircases
  for (const cx of [-20, -15, -10, 10, 15, 20]) {
    box(0.5, DECK_Y - 0.3, 0.5, cx, (DECK_Y - 0.3) / 2, -17, mats.steelDark);
  }
  // railing 1.0 m above the deck, gaps at the three staircases
  const railY = DECK_Y + 0.5;
  function railing(x0, x1) {
    box(x1 - x0, 1.0, 0.22, (x0 + x1) / 2, railY, -15.5, mats.steelDark, { solid: true, rect: false });
  }
  railing(-25, -17);
  railing(-14, -1.5);
  railing(1.5, 14);
  railing(17, 25);
  box(0.22, 1.0, 3, -25, railY, -17, mats.steelDark, { solid: true, rect: false }); // west end
  box(0.22, 1.0, 3, 25, railY, -17, mats.steelDark, { solid: true, rect: false }); // east end
  // staircases: 8 steps of 0.4 m rise, 0.5 m run
  function staircase(x0, x1) {
    for (let i = 0; i < 8; i += 1) {
      const top = 0.4 * (i + 1);
      const zCenter = -11.5 - 0.25 - 0.5 * i;
      box(x1 - x0, top, 0.5, (x0 + x1) / 2, top / 2, zCenter, mats.steelDark, { solid: true, rect: false });
    }
    minimapRects.push({ x: x0, z: -15.5, w: x1 - x0, d: 4, c: '#4d5462' });
  }
  staircase(-17, -14);
  staircase(14, 17);
  staircase(-1.5, 1.5);
  // deck lights and the stairs sign
  const deckLight = new THREE.PointLight(new THREE.Color('#ffb45e'), 20, 22, 1.6);
  deckLight.position.set(0, 6.5, -17);
  scene.add(deckLight);
  const deckSign = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 2.25),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(['UPPER DECK', 'stairs at A · MID · B']), transparent: true }),
  );
  deckSign.position.set(0, 4.9, -19.9);
  group.add(deckSign);

  // ---- containers and crates
  function container(x, z, rotY, color) {
    const m = box(6.2, 2.6, 2.5, x, 1.3, z, color);
    m.rotation.y = rotY;
    edges(m);
    // recompute the collider after rotation
    colliders[colliders.length - 1] = new THREE.Box3().setFromObject(m);
    return m;
  }
  container(-24.5, 6, 0, mats.steel); // A-long
  container(-24.5, -6, 0, mats.rust); // A-long north
  container(24.5, 6, 0, mats.rust); // B-long
  container(24.5, -6, 0, mats.steel); // B-long north
  container(-11, -9, Math.PI / 2, mats.steel); // A approach
  container(11, -9, Math.PI / 2, mats.rust); // B approach

  function crate(x, z, s = 1.2, y = null) {
    const m = box(s, s, s, x, (y ?? s / 2), z, mats.crate);
    edges(m);
    return m;
  }
  crate(-5, 4); crate(-3.6, 4.2, 0.9); crate(5, -2); crate(4, 8, 1.2); crate(-4, -8, 1.2);
  crate(-16, 2); crate(16, 2); crate(-18, -5, 1.4); crate(18, -5, 1.4);
  crate(-9, 12); crate(9, 12); crate(-17, 8); crate(17, 8);
  crate(-10, -14, 1.2); crate(10, -14, 1.2);
  // low walls to crouch behind, at ±7, clear of the approach containers
  box(3.4, 1.1, 0.5, -7, 0.55, -6, mats.steelDark);
  box(3.4, 1.1, 0.5, 7, 0.55, -6, mats.steelDark);
  box(0.5, 1.1, 3.4, 7.5, 0.55, -11, mats.steelDark);
  // the south wall is two short slabs with a 4.2 m gap on the atkSpawn lane
  box(2.2, 1.1, 0.5, -3.2, 0.55, 11, mats.steelDark);
  box(2.2, 1.1, 0.5, 3.2, 0.55, 11, mats.steelDark);
  // ---- barrels
  cyl(0.55, 1.15, -2, 0.58, 8, mats.barrel, 12);
  cyl(0.55, 1.15, -1, 0.58, 8.6, mats.barrel, 12);
  cyl(0.55, 1.15, 2.5, 0.58, -9, mats.barrel, 12);
  cyl(0.55, 1.15, -20, 0.58, -10.5, mats.barrel, 12);
  cyl(0.55, 1.15, 20, 0.58, -10.5, mats.barrel, 12);

  // ---- signs
  const signAtk = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 1.75),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(['EMBER SPAWN', 'attack — plant the charge']), transparent: true }),
  );
  signAtk.position.set(0, 4.6, 19.9);
  signAtk.rotation.y = Math.PI;
  group.add(signAtk);
  const signDef = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 1.75),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(['VANTA SPAWN', 'defend — hold all three sites']), transparent: true }),
  );
  signDef.position.set(0, 4.6, -19.9);
  group.add(signDef);

  // ---- skyline silhouettes, outside the walls
  const skylineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#12141a') });
  const skyline = [[-40, 14, 8, -22], [-18, 10, 6, 30], [8, 18, 10, -26], [30, 12, 8, 24], [44, 16, 6, -20], [-48, 12, 10, 26]];
  for (const [x, h, w, z] of skyline) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2), skylineMat);
    b.position.set(x, h / 2 - 1, z * 1.6);
    group.add(b);
  }

  // ---- lights: a low amber sun from the south-west, cool fill, hemisphere, warm pool mid-yard
  const hemi = new THREE.HemisphereLight(new THREE.Color('#9aa2b8'), new THREE.Color('#9a7a58'), 1.7);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 4.5);
  key.position.set(-38, 26, 42);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -32;
  key.shadow.camera.right = 32;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 80;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#6f86b8'), 1.0);
  fill.position.set(-14, 16, -12);
  scene.add(fill);
  const midLight = new THREE.PointLight(new THREE.Color('#ffd9a0'), 14, 18, 1.6);
  midLight.position.set(0, 5, 2);
  scene.add(midLight);

  // ---- waypoint graph. Deck nodes are reachable only through a stair node.
  const N = (id, x, z) => ({ id, pos: new THREE.Vector3(x, 0, z), edges: [] });
  const nodes = [
    N('atkSpawn', 0, 17), N('atkL', -8, 16), N('atkR', 8, 16),
    N('midS', 0, 10), N('mid', 0, 2), N('midN', 0, -6),
    N('aAlley', -12, 6), N('aMid', -14, -4), N('aHold', -14, -10),
    N('aLongS', -20, 12), N('aLongM', -20, 2), N('aLongN', -20, -8),
    N('aSite', -19, -13), N('aBack', -21.5, -16.5),
    N('bAlley', 12, 6), N('bMid', 14, -4), N('bHold', 14, -10),
    N('bLongS', 20, 12), N('bLongM', 20, 2), N('bLongN', 20, -8),
    N('bSite', 19, -13), N('bBack', 21.5, -16.5),
    N('defSpawn', 0, -17), N('defA', -10, -16), N('defB', 10, -16),
    N('defMid', -6, -14), N('defMid2', 6, -14), N('yardL', -8, 8), N('yardR', 8, 8),
    // Site C: the site node south of the legs, the hold north of them
    N('cSite', 0, 5), N('cHold', 0, -3.5),
    // the upper deck: south approach, the stair itself, the deck perch
    N('stairAS', -15.5, -9.5), N('stairA', -15.5, -13.5), N('deckW', -15.5, -16.2),
    N('stairBS', 15.5, -9.5), N('stairB', 15.5, -13.5), N('deckE', 15.5, -16.2),
    N('stairMS', 0, -10), N('stairM', 0, -13.5), N('deckMid', 0, -16.2),
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  function link(a, b) {
    byId.get(a).edges.push(b);
    byId.get(b).edges.push(a);
  }
  link('atkSpawn', 'atkL'); link('atkSpawn', 'atkR'); link('atkSpawn', 'midS');
  link('atkL', 'aAlley'); link('atkR', 'bAlley'); link('atkL', 'aLongS'); link('atkR', 'bLongS');
  link('atkL', 'yardL'); link('atkR', 'yardR');
  link('midS', 'yardL'); link('midS', 'yardR'); link('midS', 'mid');
  link('mid', 'aAlley'); link('mid', 'bAlley'); link('mid', 'midN');
  link('midN', 'defMid'); link('midN', 'defMid2'); link('midN', 'aMid'); link('midN', 'bMid');
  link('aAlley', 'aMid'); link('aMid', 'aHold'); link('aHold', 'stairAS');
  link('aLongS', 'aLongM'); link('aLongM', 'aLongN'); link('aLongN', 'aSite');
  link('aSite', 'aBack');
  link('bAlley', 'bMid'); link('bMid', 'bHold'); link('bHold', 'stairBS');
  link('bLongS', 'bLongM'); link('bLongM', 'bLongN'); link('bLongN', 'bSite');
  link('bSite', 'bBack');
  link('defSpawn', 'defA'); link('defSpawn', 'defB'); link('defSpawn', 'defMid'); link('defSpawn', 'defMid2');
  link('defA', 'defMid'); link('defB', 'defMid2'); link('defA', 'stairAS'); link('defB', 'stairBS');
  link('yardL', 'aAlley'); link('yardR', 'bAlley');
  // deck routes always go through a staircase, never a shortcut
  link('aSite', 'stairAS'); link('stairAS', 'stairA'); link('stairA', 'deckW');
  link('bSite', 'stairBS'); link('stairBS', 'stairB'); link('stairB', 'deckE');
  link('aLongN', 'stairAS'); link('bLongN', 'stairBS');
  link('midN', 'stairMS'); link('stairMS', 'stairM'); link('stairM', 'deckMid');
  // defenders reach the mid stairs from their staging nodes
  link('defMid', 'stairMS'); link('defMid2', 'stairMS');
  link('deckW', 'deckMid'); link('deckMid', 'deckE');
  // Site C routes, all on the clear x = 0 corridor between the crane legs
  link('midS', 'cSite'); link('cSite', 'mid'); link('mid', 'cHold'); link('cHold', 'midN');

  /** Breadth-first shortest path of node ids from `from` to `to`. */
  function findPath(from, to) {
    if (from === to) return [from];
    const prev = new Map([[from, null]]);
    const queue = [from];
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const next of byId.get(cur).edges) {
        if (prev.has(next)) continue;
        prev.set(next, cur);
        if (next === to) {
          const path = [to];
          let at = cur;
          while (at !== null) {
            path.unshift(at);
            at = prev.get(at);
          }
          return path;
        }
        queue.push(next);
      }
    }
    return [from, to];
  }

  function nearestNode(pos) {
    let best = nodes[0];
    let bestD = Infinity;
    for (const n of nodes) {
      const d = (n.pos.x - pos.x) ** 2 + (n.pos.z - pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best.id;
  }

  const raycaster = new THREE.Raycaster();
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _d = new THREE.Vector3();
  function lineOfSight(a, b, maxDist = 60) {
    _a.copy(a);
    _b.copy(b);
    _d.subVectors(_b, _a);
    const dist = _d.length();
    if (dist > maxDist) return false;
    _d.normalize();
    raycaster.set(_a, _d);
    raycaster.far = dist - 0.05;
    return raycaster.intersectObjects(shootables, false).length === 0;
  }

  const sites = {
    A: { id: 'A', name: 'Furnace', center: new THREE.Vector3(-19, 0, -13), radius: 5 },
    B: { id: 'B', name: 'Silos', center: new THREE.Vector3(19, 0, -13), radius: 5 },
    // C is a touch smaller: the crane legs stand inside its ring as cover
    C: { id: 'C', name: 'Crane', center: new THREE.Vector3(0, 0, 2), radius: 4.5 },
  };

  return {
    group,
    colliders,
    shootables,
    bounds: BOUNDS,
    sites,
    nodes,
    byId,
    findPath,
    nearestNode,
    lineOfSight,
    minimapRects,
    minimapUpper,
    deckY: DECK_Y,
    attackerSpawns: [
      new THREE.Vector3(-6, 0, 17.5), new THREE.Vector3(-3, 0, 18), new THREE.Vector3(0, 0, 17.5),
      new THREE.Vector3(3, 0, 18), new THREE.Vector3(6, 0, 17.5),
    ],
    defenderSpawns: [
      new THREE.Vector3(-6, 0, -17.5), new THREE.Vector3(-3, 0, -18), new THREE.Vector3(0, 0, -17.5),
      new THREE.Vector3(3, 0, -18), new THREE.Vector3(6, 0, -17.5),
    ],
    flicker(t) {
      for (const f of flickerLights) f.light.intensity = f.base + Math.sin(t * f.speed) * f.amp * 0.4 + Math.sin(t * f.speed * 2.7) * f.amp * 0.2;
    },
  };
}
