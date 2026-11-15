// EMBERLINE v3 — boot and the one loop. A fixed 60 Hz sim feeds a render at
// the display's rate: a whole match — nine bots, economy, charge, grenades,
// rounds. v3: three bomb sites, smoke grenades, golden-hour sun, pick a side.
// ?shot=start|play|buy|end&seed=N sets up a deterministic capture frame
// (renders twice, freezes, sets window.__shotReady); ?shot=sim&rounds=N runs
// a headless idle-player match and writes window.__simResult — the balance probe.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon } from './weapons.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createBot, updateBot, syncBotVisual } from './bots.js';
import { SmokeSystem } from './smoke.js';
import { fillStartFeatures } from './startscreen.js';
import * as match from './match.js';

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

const rng = mulberry32(shot ? seed : (Date.now() % 2147483647) || 1);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// filmic tone mapping keeps the amber sun from blowing out in a screenshot
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 40, 120);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const smoke = new SmokeSystem(scene);
fillStartFeatures();

// ---- the one game state object every module shares
const G = {
  scene, camera, world, effects, audio, hud, rng, smoke,
  time: 0,
  phase: 'menu',
  phaseT: 0,
  round: 0,
  score: { ember: 0, vanta: 0 },
  lossStreak: { ember: 0, vanta: 0 },
  roundTime: 110,
  teamSite: 'A',
  stats: { plants: 0, detonations: 0, defuses: 0, rounds: [], kills: 0 },
  lastComms: -99,
  spike: { state: 'carried', site: null, pos: new THREE.Vector3(), timer: 0, carrier: null },
  plantProgress: 0,
  defuseProgress: 0,
  killfeed: [],
  grenades: [],
  shootTargets: [],
  fighters: [],
  bots: [],
  player: null,
  input: null,
  combat: { fire: match.fire },
  match: {
    plantSpike: match.plantSpike,
    defuseSpike: match.defuseSpike,
    buyItem: match.buyItem,
    throwGrenade: match.throwGrenade,
  },
};

// ---- the player
const playerBody = createPlayer(world.colliders, { x: 0, y: 0, z: 17.5, yaw: 0 });
const player = {
  isBot: false,
  name: 'YOU',
  team: 'ember',
  body: playerBody,
  soldier: null,
  pistol: createWeapon('pistol'),
  primary: null,
  weapon: null,
  weaponId: 'pistol',
  hp: 100,
  armor: 0,
  alive: true,
  money: 800,
  kills: 0,
  deaths: 0,
  grenades: { frag: 0, flash: 0, smoke: 0 },
  flashT: 0,
  hasSpike: true,
  walkPhase: 0,
};
player.weapon = player.pistol;
G.player = player;

// ---- the bots: four Ember teammates, five Vanta opponents
const botRoles = {
  ember: ['rusher', 'rusher', 'flanker', 'lurker'],
  vanta: ['holder', 'holder', 'rotator', 'rotator', 'sniper'],
};
for (const team of ['ember', 'vanta']) {
  const spawns = team === 'ember' ? world.attackerSpawns : world.defenderSpawns;
  botRoles[team].forEach((role, i) => {
    const bot = createBot(G, team, role, i, spawns[i % spawns.length]);
    bot.grenades = { frag: 0, flash: 0, smoke: 0 };
    G.bots.push(bot);
  });
}
G.fighters = [player, ...G.bots];
// pose the soldiers at their spawns once, so the start screen already shows them
for (const bot of G.bots) syncBotVisual(G, bot, 0);

const input = createInput(renderer.domElement, onLockChange);
G.input = input;

// ---- first-person viewmodel: receiver, barrel, magazine, stock and sight; bobs, sways, kicks
const viewmodel = new THREE.Group();
const vmMat = new THREE.MeshStandardMaterial({ color: 0x4a4f58, roughness: 0.45, metalness: 0.5 });
const vmAccent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 0.6, roughness: 0.4 });
const vmBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.5), vmMat);
const vmBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), vmMat);
vmBarrel.position.set(0, 0.03, -0.42);
const vmShroud = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.3), vmMat);
vmShroud.position.set(0, 0.03, -0.3);
const vmSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), vmAccent);
vmSight.position.set(0, 0.09, -0.1);
const vmMag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), vmMat);
vmMag.position.set(0, -0.13, 0.02);
vmMag.rotation.x = 0.15;
const vmStock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.16), vmMat);
vmStock.position.set(0, -0.01, 0.3);
const vmGrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.09), vmMat);
vmGrip.position.set(0, -0.12, 0.14);
vmGrip.rotation.x = 0.3;
viewmodel.add(vmBody, vmBarrel, vmShroud, vmSight, vmMag, vmStock, vmGrip);
viewmodel.position.set(0.26, -0.22, -0.45);
camera.add(viewmodel);
// a small warm light on the camera, so the viewmodel gun never reads as a black wedge
const vmLight = new THREE.PointLight(0xffe0b0, 3.5, 2.5, 1.5);
vmLight.position.set(0.2, 0.15, -0.2);
camera.add(vmLight);
let vmKick = 0;
let vmBobPhase = 0;
let lastStepBeat = 0;

/** The barrel length and sight follow the weapon in hand. */
function syncViewmodel() {
  const kind = player.weapon.def.kind;
  const barrelLen = { pistol: 0.7, smg: 0.9, rifle: 1.0, shotgun: 1.1, sniper: 1.5 }[kind] ?? 1;
  vmBarrel.scale.z = barrelLen;
  vmBarrel.position.z = -0.42 * barrelLen;
  vmShroud.visible = kind !== 'pistol';
  vmSight.visible = kind !== 'shotgun';
  vmMag.visible = kind !== 'pistol';
}
syncViewmodel();

let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let minimapTimer = 0;
let spectateTarget = null;
const EMPTY_KEYS = new Set();

// side is 'ember' or 'vanta' from the start screen's pick buttons (plain Play
// means Ember); set before createMatch, so startRound spawns the player on
// the right side and hands the charge to the attacking team.
hud.onPlay((side = 'ember') => {
  audio.unlock();
  if (G.phase === 'matchEnd') {
    player.team = side;
    match.createMatch(G);
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  if (G.phase === 'menu') {
    player.team = side;
    match.createMatch(G);
    started = true;
    hud.hideOverlay();
    input.requestLock();
  } else {
    hud.hideOverlay();
    input.requestLock();
  }
});
hud.onBuy((id) => {
  if (match.buyItem(G, player, id)) {
    hud.refreshBuy(G);
    syncHud();
  }
});
hud.onDeploy(() => {
  hud.hideBuy();
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (G.phase === 'round') {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  const body = playerBody.state;
  if (player.alive) {
    camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
    camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  } else if (spectateTarget && spectateTarget.alive) {
    const s = spectateTarget.body.state;
    camera.position.set(s.position.x, s.position.y + s.eye, s.position.z);
    camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
  }
}

function syncHud() {
  hud.setHealth(player.hp, player.armor);
  hud.setAmmo(player.weapon.mag, player.weapon.reserve, player.weapon.def.name);
  hud.setMoney(player.money);
  hud.setTimer(G.phase === 'round' ? G.roundTime : G.spike.state === 'planted' ? G.spike.timer : G.phaseT, G.spike.state === 'planted');
  hud.setScore(G.score.ember, G.score.vanta, Math.max(1, G.round));
  hud.setGrenades(player.grenades.frag, player.grenades.flash, player.grenades.smoke);
  hud.setSpike(player.hasSpike);
  hud.setPlantProgress(G.plantProgress / 3.5, 'PLANTING THE CHARGE — HOLD E');
  if (player.flashT > 0) hud.flashOverlay(0.1);
}

function aimAt(point) {
  const body = playerBody.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function playerShoot() {
  const weapon = player.weapon;
  if (weapon.reloading) return;
  if (weapon.mag <= 0) {
    weapon.startReload(G.time);
    audio.reload();
    return;
  }
  match.fire(G, player, 0);
  vmKick = 1;
}

function switchWeapon(slot) {
  if (slot === 'primary' && player.primary) {
    player.weapon = player.primary;
    player.weaponId = player.primary.def.id;
  } else if (slot === 'pistol') {
    player.weapon = player.pistol;
    player.weaponId = 'pistol';
  }
  syncViewmodel();
  syncHud();
}

function step(dt) {
  G.time += dt;
  world.flicker(G.time);
  const keys = input.state.keys;

  // buy-menu keys and toggles (only while the buy phase runs)
  if (G.phase === 'buy') {
    if (keys.has('KeyB')) {
      keys.delete('KeyB');
      if (document.getElementById('buy-menu').hidden) {
        hud.showBuy(G);
        input.releaseLock();
      } else {
        hud.hideBuy();
        input.requestLock();
      }
    }
    const buyKeys = { Digit1: 'rifle', Digit2: 'sniper', Digit3: 'smg', Digit4: 'shotgun', Digit5: 'pistol', Digit6: 'armor', Digit7: 'frag', Digit8: 'flash', Digit9: 'smoke' };
    for (const [code, id] of Object.entries(buyKeys)) {
      if (keys.has(code)) {
        keys.delete(code);
        if (match.buyItem(G, player, id)) hud.refreshBuy(G);
      }
    }
  }
  if (keys.has('Digit1')) { keys.delete('Digit1'); switchWeapon('primary'); }
  if (keys.has('Digit2')) { keys.delete('Digit2'); switchWeapon('pistol'); }
  if (keys.has('Digit3')) { keys.delete('Digit3'); match.throwGrenade(G, player, 'frag'); }
  if (keys.has('Digit4')) { keys.delete('Digit4'); match.throwGrenade(G, player, 'flash'); }
  if (keys.has('Digit5')) { keys.delete('Digit5'); match.throwGrenade(G, player, 'smoke'); }
  // Tab scoreboard, held down
  if (keys.has('Tab')) hud.showScoreboard(G);
  else hud.hideScoreboard();

  // the player moves and shoots only while alive, locked in and in a live phase
  const interactive = shot ? true : document.pointerLockElement === renderer.domElement;
  if (player.alive && interactive && (G.phase === 'buy' || G.phase === 'round')) {
    const look = input.takeLook();
    playerBody.look(look.x, look.y);
    playerBody.step(dt, keys);
    player.weapon.step(G.time, dt);
    if (keys.has('KeyR')) {
      keys.delete('KeyR');
      if (player.weapon.startReload(G.time)) audio.reload();
    }
    if (input.state.firing && player.weapon.ready(G.time) && G.phase === 'round') playerShoot();
    // sniper scope: right mouse narrows the field of view
    const scoped = input.state.scoped && player.weapon.def.scoped;
    hud.setScoped(scoped);
    const targetFov = scoped ? 26 : 74;
    if (Math.abs(camera.fov - targetFov) > 0.2) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
      camera.updateProjectionMatrix();
    }
    // the crosshair opens with the real spread, so stopping to aim reads
    const speed = playerBody.groundSpeed();
    hud.setCrosshairGap(player.weapon.spreadNow(speed, !playerBody.state.onGround));
    // viewmodel bob and kick, plus a footstep tick each half-cycle
    vmBobPhase += dt * speed * 1.6;
    const beat = Math.floor(vmBobPhase / Math.PI);
    if (beat !== lastStepBeat && speed > 1 && playerBody.state.onGround) {
      lastStepBeat = beat;
      audio.footstep(speed > 4);
    }
    vmKick = Math.max(0, vmKick - dt * 7);
    viewmodel.position.set(
      0.26 + Math.sin(vmBobPhase) * 0.008 * Math.min(1, speed / 5),
      -0.22 + Math.abs(Math.cos(vmBobPhase)) * 0.01 * Math.min(1, speed / 5),
      -0.45 + vmKick * 0.09,
    );
    viewmodel.visible = !scoped;
    viewmodel.rotation.x = vmKick * 0.12;
  }

  // spectate a living teammate once the player is down
  if (!player.alive) {
    if (!spectateTarget || !spectateTarget.alive) {
      spectateTarget = G.bots.find((b) => b.team === player.team && b.alive) ?? null;
    }
    if (input.state.firing) {
      input.state.firing = false;
      const alive = G.bots.filter((b) => b.team === player.team && b.alive);
      if (alive.length > 0) {
        const idx = alive.indexOf(spectateTarget);
        spectateTarget = alive[(idx + 1) % alive.length];
      }
    }
  } else {
    spectateTarget = null;
    hud.hideDeath();
  }

  // the bots fight only once the round is live; during buy they wait at spawn
  if (G.phase === 'round') {
    for (const bot of G.bots) updateBot(G, bot, dt);
  } else if (G.phase === 'buy') {
    for (const bot of G.bots) {
      if (!bot.alive) continue;
      bot.body.step(dt, EMPTY_KEYS);
      syncBotVisual(G, bot, dt);
    }
  }

  match.updateMatch(G, dt);
  effects.step(dt);
  G.smoke.update(G.time, dt);
  hud.tick(dt);
  minimapTimer -= dt;
  if (minimapTimer <= 0) {
    minimapTimer = 0.1;
    hud.drawMinimap(G);
  }
  syncCamera();
  syncHud();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen && (started || shot)) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  }
  // live play, round running, mouse free: the pause overlay asks for a click
  if (!shot && started && G.phase === 'round' && document.pointerLockElement !== renderer.domElement) {
    const overlay = document.getElementById('overlay');
    if (overlay.hidden) hud.showOverlay('paused');
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function runShot(name) {
  match.createMatch(G);
  hud.hideOverlay();
  hud.hideBuy();
  started = true;
  const body = playerBody.state;
  if (name === 'start') {
    // on the Upper Deck, looking south-west toward the Furnace
    G.phase = 'menu';
    G.phaseT = 110;
    hud.hideBanner();
    body.position.set(0, 3.2, -16.2);
    body.yaw = 2.4;
    body.pitch = -0.12;
    settle(20);
    // pose two teammates ahead and one Vanta bot mid-lane
    const emberBot = G.bots[0];
    emberBot.body.state.position.set(-6, 0, -2);
    emberBot.body.state.yaw = 0;
    const vantaBot = G.bots[4];
    vantaBot.body.state.position.set(-9, 0, -10);
    vantaBot.body.state.yaw = Math.PI;
    for (const b of G.bots) syncBotVisual(G, b, 0);
    syncCamera();
    hud.showOverlay('start');
    hud.setHealth(100, 0);
    hud.setAmmo(12, 48, 'P9 Sidearm');
    hud.setMoney(800);
    hud.setTimer(110, false);
    hud.setScore(0, 0, 1);
  } else if (name === 'play') {
    // the COVER: a firefight in golden hour — three Vanta bots ahead, smoke
    // blooming mid-lane, the sniper on the deck, a teammate on the left
    player.money = 5000;
    match.buyItem(G, player, 'rifle');
    match.buyItem(G, player, 'smoke');
    hud.hideBanner();
    G.phase = 'round';
    G.roundTime = 87;
    body.position.set(0, 0, 6);
    body.yaw = 0.1;
    body.pitch = 0;
    // staging: the three Vanta bots stand in the open mid-lane, clear of the
    // crane legs and the hook block, so the camera sees all of them
    const v1 = G.bots[4];
    v1.body.state.position.set(1.5, 0, -4);
    v1.body.state.yaw = Math.PI;
    const v2 = G.bots[5];
    v2.body.state.position.set(-0.5, 0, -9);
    v2.body.state.yaw = Math.PI;
    const v3 = G.bots[6];
    v3.body.state.position.set(4.5, 0, -7);
    v3.body.state.yaw = Math.PI;
    const sniper = G.bots[8];
    sniper.body.state.position.set(3.5, 3.2, -16.2);
    sniper.body.state.yaw = Math.PI;
    sniper.body.state.pitch = -0.1;
    const e1 = G.bots[0];
    e1.body.state.position.set(-4, 0, -1);
    e1.body.state.yaw = 0.3;
    for (const b of G.bots) syncBotVisual(G, b, 0);
    // the flanker's smoke, far left by the A-long wall — it frames the fight
    // instead of hiding it (a cloud on the sightline reads as a white wall)
    G.smoke.spawn(-8, 1.2, -3, G.time);
    settle(30);
    // two shots at the nearer Vanta bot, then one last shot right before the freeze
    const aimPoint = new THREE.Vector3(1.5, 1.45, -4);
    for (let round = 0; round < 2; round += 1) {
      aimAt(aimPoint);
      playerShoot();
      settle(9);
    }
    match.addKillfeed(G, 'ASH', 'FROST', 'AR-77 Longshot', false);
    match.addKillfeed(G, 'YOU', 'MIST', 'AR-77 Longshot', true);
    player.hp = 100;
    player.money = 2450;
    settle(6);
    aimAt(aimPoint);
    playerShoot();
    settle(1);
  } else if (name === 'buy') {
    G.phase = 'buy';
    G.phaseT = 12;
    body.position.set(0, 0, 16);
    body.yaw = 0;
    body.pitch = -0.01;
    settle(20);
    player.money = 4750;
    hud.showBuy(G);
    syncCamera();
  } else {
    // end: round won at Site A, the charge planted, banner up
    // the round's survivor: battered health, a half-spent rifle, some credits left
    player.money = 5000;
    match.buyItem(G, player, 'rifle');
    player.weapon.mag = 18;
    player.weapon.reserve = 60;
    player.hp = 64;
    player.armor = 25;
    player.money = 2150;
    player.hasSpike = false;
    G.phase = 'roundEnd';
    G.phaseT = 4.5;
    G.round = 6;
    G.score = { ember: 3, vanta: 2 };
    G.spike.state = 'gone';
    hud.hideBanner();
    body.position.set(-12, 0, -6);
    body.yaw = -0.6;
    body.pitch = 0.02;
    settle(20);
    hud.showOverlay('roundEnd', {
      title: 'EMBER WINS THE ROUND',
      copy: 'EMBER takes round 6 — Vanta team eliminated. Score 3 – 2.',
    });
    syncCamera();
  }
  syncHud();
  paintTwiceThenReady();
}

/** Headless balance probe: an idle player, a full match, one JSON result. */
function runSim(maxRounds) {
  match.createMatch(G);
  hud.hideOverlay();
  hud.hideBuy();
  started = true;
  let steps = 0;
  const t0 = performance.now();
  const trace = [];
  window.__simTrace = trace;
  function finish() {
    const result = {
      seed,
      steps,
      simSeconds: +(steps / 60).toFixed(1),
      wallMs: Math.round(performance.now() - t0),
      score: { ...G.score },
      rounds: G.round,
      plants: G.stats.plants,
      detonations: G.stats.detonations,
      defuses: G.stats.defuses,
      roundLog: G.stats.rounds,
      fighters: G.fighters.map((f) => ({ name: f.name, team: f.team, kills: f.kills, deaths: f.deaths })),
    };
    window.__simResult = result;
    console.log(`SIM_RESULT ${JSON.stringify(result)}`);
    document.title = 'SIM DONE';
  }
  function chunk() {
    for (let i = 0; i < 1500; i += 1) {
      if (G.phase === 'matchEnd' || G.round > maxRounds) {
        finish();
        return;
      }
      step(FIXED_STEP);
      steps += 1;
      if (steps % 120 === 0) {
        trace.push({
          t: +(steps / 60).toFixed(1), phase: G.phase, round: G.round,
          spike: G.spike.state,
          bots: G.bots.map((b) => ({
            n: b.name, x: +b.body.state.position.x.toFixed(1), z: +b.body.state.position.z.toFixed(1),
            y: +b.body.state.position.y.toFixed(1), s: b.state, p: b.path.length - b.pathIndex,
            stuck: +(b.blockedTimer ?? 0).toFixed(2),
            spd: +(b._lastSpeed ?? 0).toFixed(2), keys: b._lastKeys ?? '',
            tgt: b.target ? b.target.name : null, hp: Math.ceil(b.hp), hasSpike: b.hasSpike,
          })),
        });
      }
    }
    setTimeout(chunk, 0);
  }
  chunk();
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

if (shot === 'sim') {
  runSim(Number.parseInt(params.get('rounds') ?? '13', 10) || 13);
} else if (shot) {
  runShot(shot);
} else {
  hud.showOverlay('start');
  hud.setHealth(100, 0);
  hud.setAmmo(12, 48, 'P9 Sidearm');
  hud.setMoney(800);
  hud.setTimer(110, false);
  hud.setScore(0, 0, 1);
  requestAnimationFrame(frame);
}
