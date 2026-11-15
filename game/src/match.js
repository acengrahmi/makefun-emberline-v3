// Match: the state machine that turns a firefight into a game — rounds, buy
// phases, economy, the charge (plant/defuse), grenades, hit resolution, the
// killfeed — driven by the fixed-step sim. Fighters (player + bots) share
// the same fields, so the same code serves all. v2: rounds run 110 s, each
// opens with a team site call (Ember pushes ONE site together), bots buy
// entry grenades; stats live on G.stats for the self-test probe.
import * as THREE from 'three';
import { WEAPONS, GRENADES, createWeapon } from './weapons.js';
import { killBot } from './bots.js';
import { pickSite, siteById } from './sites.js';

const WIN_ROUNDS = 7;
const MAX_ROUNDS = 13;
const ROUND_TIME = 110;
const BUY_TIME = 15;
const PLANT_TIME = 3.5;
const DEFUSE_TIME = 5;
const SPIKE_TIMER = 35;

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _eye = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

export function addKillfeed(G, killer, victim, weaponName, headshot) {
  G.killfeed.unshift({ killer, victim, weaponName, headshot, time: G.time });
  if (G.killfeed.length > 6) G.killfeed.length = 6;
  G.hud.killfeed(G.killfeed);
}

export function hearNoise(G, pos, radius, team) {
  for (const bot of G.bots) {
    if (!bot.alive || bot.team === team) continue;
    const bp = bot.body.state.position;
    if (Math.hypot(bp.x - pos.x, bp.z - pos.z) < radius) {
      bot.hearPos = bot.hearPos ?? new THREE.Vector3();
      bot.hearPos.copy(pos);
      bot.hearTime = G.time;
    }
  }
}

/** Every mesh a bullet can hit: the map plus every living fighter's head/torso. */
function rebuildShootTargets(G) {
  G.shootTargets = G.world.shootables.slice();
  for (const f of G.fighters) {
    if (!f.alive || !f.soldier) continue;
    f.soldier.head.userData.fighter = f;
    f.soldier.head.userData.part = 'head';
    f.soldier.torso.userData.fighter = f;
    f.soldier.torso.userData.part = 'body';
    G.shootTargets.push(f.soldier.head, f.soldier.torso);
  }
}

/** Does the ray hit the player? The player has no mesh, so test the ray against
 * the vertical segment of the player's body and compare with the wall distance. */
function playerRayHit(G, shooter, origin, dir, maxDist) {
  const p = G.player;
  if (!p.alive || shooter === p) return null;
  const pos = p.body.state.position;
  const h = p.body.state.height;
  const wx = pos.x - origin.x;
  const wy = pos.y - origin.y;
  const wz = pos.z - origin.z;
  let t = wx * dir.x + wy * dir.y + wz * dir.z;
  if (t < 0 || t > maxDist) return null;
  const cx = origin.x + dir.x * t - pos.x;
  const cy = origin.y + dir.y * t - pos.y;
  const cz = origin.z + dir.z * t - pos.z;
  const horizontal = Math.hypot(cx, cz);
  if (horizontal > 0.46) return null;
  if (cy < -0.1 || cy > h + 0.1) return null;
  return { t, part: cy > h - 0.38 ? 'head' : 'body' };
}

export function resolveShot(G, shooter, origin, dir, def) {
  raycaster.set(origin, dir);
  raycaster.far = def.range;
  const hits = raycaster.intersectObjects(G.shootTargets, false);
  const wallHit = hits.length > 0 ? hits[0] : null;
  const wallDist = wallHit ? wallHit.distance : Infinity;

  const ph = playerRayHit(G, shooter, origin, dir, Math.min(def.range, wallDist));
  if (ph && ph.t < wallDist) {
    _hitPoint.copy(origin).addScaledVector(dir, ph.t);
    return { kind: 'fighter', fighter: G.player, part: ph.part, point: _hitPoint.clone(), distance: ph.t };
  }
  if (!wallHit) {
    _hitPoint.copy(origin).addScaledVector(dir, def.range);
    return { kind: 'none', point: _hitPoint.clone(), distance: def.range };
  }
  const obj = wallHit.object;
  if (obj.userData.fighter) {
    return { kind: 'fighter', fighter: obj.userData.fighter, part: obj.userData.part, point: wallHit.point.clone(), distance: wallHit.distance };
  }
  return { kind: 'wall', point: wallHit.point.clone(), distance: wallHit.distance, normal: wallHit.face ? wallHit.face.normal.clone() : null };
}

export function fire(G, shooter, extraSpread = 0) {
  const weapon = shooter.weapon;
  const def = weapon.def;
  if (!weapon.ready(G.time)) return false;
  if (!weapon.takeRound()) {
    if (!shooter.isBot) G.audio.dryFire();
    weapon.cooldown = G.time + 0.25;
    return false;
  }
  weapon.cooldown = G.time + def.interval;
  const body = shooter.body.state;
  _eye.set(body.position.x, body.position.y + body.eye, body.position.z);
  const airborne = !body.onGround;
  const spread = weapon.spreadNow(shooter.body.groundSpeed(), airborne) + extraSpread;
  // muzzle position: just in front of the gun
  _dir.set(-Math.sin(body.yaw) * Math.cos(body.pitch), Math.sin(body.pitch), -Math.cos(body.yaw) * Math.cos(body.pitch));
  _muzzle.copy(_eye).addScaledVector(_dir, 0.7);
  _muzzle.y -= 0.12;
  G.effects.muzzleFlash(_muzzle, _dir, G.camera);
  const tracerColor = shooter.team === 'ember' ? 0xffd27a : 0x7ad8ff;
  let hitAny = false;
  for (let p = 0; p < def.pellets; p += 1) {
    _dir.set(-Math.sin(body.yaw) * Math.cos(body.pitch), Math.sin(body.pitch), -Math.cos(body.yaw) * Math.cos(body.pitch));
    _dir.x += (G.rng() * 2 - 1) * spread;
    _dir.y += (G.rng() * 2 - 1) * spread;
    _dir.z += (G.rng() * 2 - 1) * spread;
    _dir.normalize();
    const res = resolveShot(G, shooter, _eye, _dir, def);
    G.effects.tracer(_muzzle, res.point, tracerColor);
    if (res.kind === 'fighter') {
      hitAny = true;
      damageFighter(G, res.fighter, def.damage, res.part, shooter, def.name);
      G.effects.impact(res.point, new THREE.Vector3(0, 1, 0), 0xe5484d);
    } else if (res.kind === 'wall') {
      G.effects.impact(res.point, new THREE.Vector3(0, 1, 0), 0xffd9a0);
    }
  }
  G.audio.shot(def.kind);
  hearNoise(G, body.position, 32, shooter.team);
  if (!shooter.isBot) {
    shooter.body.recoil(def.recoilPitch * (0.8 + G.rng() * 0.4), (G.rng() * 2 - 1) * def.recoilYaw);
    if (hitAny) G.hud.hitmarker(false);
  }
  return true;
}

export function damageFighter(G, target, baseDamage, part, attacker, weaponName) {
  if (!target.alive) return;
  const def = attacker.weapon.def;
  let damage = baseDamage * (part === 'head' ? def.headMult : 1);
  const absorbed = Math.min(target.armor, damage * 0.5);
  target.armor -= absorbed;
  target.hp -= damage - absorbed;
  if (target === G.player) {
    G.audio.hurt();
    G.hud.damageFlash();
    if (attacker && attacker.body) {
      const dx = attacker.body.state.position.x - target.body.state.position.x;
      const dz = attacker.body.state.position.z - target.body.state.position.z;
      G.hud.damageDirection(Math.atan2(dx, dz) - target.body.state.yaw);
    }
  } else if (attacker === G.player) {
    G.audio.hit();
  }
  if (target.hp > 0) return;
  target.hp = 0;
  target.alive = false;
  target.deaths += 1;
  if (attacker) {
    attacker.kills += 1;
    attacker.money += 300;
  }
  addKillfeed(G, attacker ? attacker.name : '—', target.name, weaponName, part === 'head');
  if (attacker === G.player) {
    G.audio.kill();
    G.hud.hitmarker(true);
  }
  if (target.isBot) {
    killBot(G, target);
  } else {
    G.hud.showDeath();
    // the player drops the charge where they fall
    if (target.hasSpike) {
      target.hasSpike = false;
      G.spike.state = 'dropped';
      G.spike.pos.copy(target.body.state.position);
      G.spike.carrier = null;
      G.plantProgress = 0;
    }
  }
  rebuildShootTargets(G);
  checkElimination(G);
}

function aliveCount(G, team) {
  let n = 0;
  for (const f of G.fighters) if (f.alive && f.team === team) n += 1;
  return n;
}

function checkElimination(G) {
  if (G.phase !== 'round') return;
  const ember = aliveCount(G, 'ember');
  const vanta = aliveCount(G, 'vanta');
  if (vanta === 0) {
    endRound(G, 'ember', 'eliminated');
  } else if (ember === 0) {
    if (G.spike.state === 'planted') {
      // the round lives on: the charge decides it now
      return;
    }
    endRound(G, 'vanta', 'eliminated');
  }
}

// ---- grenades

export function throwGrenade(G, fighter, kind) {
  if (!fighter.grenades[kind] || fighter.grenades[kind] <= 0) return false;
  fighter.grenades[kind] -= 1;
  const body = fighter.body.state;
  const dir = new THREE.Vector3(
    -Math.sin(body.yaw) * Math.cos(body.pitch),
    Math.sin(body.pitch) + 0.25,
    -Math.cos(body.yaw) * Math.cos(body.pitch),
  ).normalize();
  const pos = new THREE.Vector3(body.position.x, body.position.y + body.eye - 0.15, body.position.z).addScaledVector(dir, 0.5);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: kind === 'frag' ? 0x3a3f4a : 0xf0f0f0, roughness: 0.4, metalness: 0.5 }),
  );
  mesh.position.copy(pos);
  G.scene.add(mesh);
  G.grenades.push({ kind, pos, vel: dir.multiplyScalar(13), fuse: kind === 'frag' ? 1.6 : 0.9, owner: fighter, mesh, bounced: false });
  G.audio.grenadeThrow();
  return true;
}

const _gPos = new THREE.Vector3();
function updateGrenades(G, dt) {
  for (let i = G.grenades.length - 1; i >= 0; i -= 1) {
    const g = G.grenades[i];
    g.fuse -= dt;
    g.vel.y -= 13 * dt;
    // move one axis at a time against the colliders, like the player does
    _gPos.copy(g.pos);
    _gPos.x += g.vel.x * dt;
    if (insideAny(G, _gPos)) {
      _gPos.x = g.pos.x;
      g.vel.x *= -0.45;
      g.bounced = true;
    }
    _gPos.z += g.vel.z * dt;
    if (insideAny(G, _gPos)) {
      _gPos.z = g.pos.z;
      g.vel.z *= -0.45;
      g.bounced = true;
    }
    _gPos.y += g.vel.y * dt;
    if (_gPos.y < 0.1) {
      _gPos.y = 0.1;
      g.vel.y = Math.abs(g.vel.y) > 1.5 ? Math.abs(g.vel.y) * 0.45 : 0;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
      g.bounced = true;
    } else if (insideAny(G, _gPos)) {
      _gPos.y = g.pos.y;
      g.vel.y *= -0.45;
      g.bounced = true;
    }
    g.pos.copy(_gPos);
    g.mesh.position.copy(g.pos);
    if (g.bounced && Math.abs(g.vel.y) > 0.5) G.audio.bounce();
    if (g.fuse <= 0) {
      detonateGrenade(G, g);
      G.scene.remove(g.mesh);
      G.grenades.splice(i, 1);
    }
  }
}

function insideAny(G, pos) {
  for (const c of G.world.colliders) {
    if (pos.x > c.min.x && pos.x < c.max.x && pos.y > c.min.y && pos.y < c.max.y && pos.z > c.min.z && pos.z < c.max.z) return true;
  }
  return false;
}

function detonateGrenade(G, g) {
  if (g.kind === 'frag') {
    const def = GRENADES.frag;
    G.effects.explosion(g.pos);
    G.audio.explosion();
    for (const f of G.fighters) {
      if (!f.alive) continue;
      const fp = f.body.state.position;
      const d = Math.hypot(fp.x - g.pos.x, fp.z - g.pos.z);
      if (d > def.radius) continue;
      const eye = new THREE.Vector3(fp.x, fp.y + f.body.state.eye, fp.z);
      const los = G.world.lineOfSight(g.pos, eye, def.radius + 1);
      let damage = def.damage * (1 - (d / def.radius) * 0.7);
      if (!los) damage *= 0.5;
      damageFighter(G, f, damage, 'body', g.owner, 'Frag Charge');
    }
  } else if (g.kind === 'smoke') {
    // a smoke veil blooms where the grenade lands and blocks sight for 8 s
    G.smoke.spawn(g.pos.x, 1.2, g.pos.z, G.time);
    G.audio.bounce();
  } else {
    const def = GRENADES.flash;
    G.effects.explosion(g.pos);
    for (const f of G.fighters) {
      if (!f.alive) continue;
      const fp = f.body.state.position;
      const d = Math.hypot(fp.x - g.pos.x, fp.z - g.pos.z);
      if (d > def.radius) continue;
      const eye = new THREE.Vector3(fp.x, fp.y + f.body.state.eye, fp.z);
      if (!G.world.lineOfSight(g.pos, eye, def.radius + 1)) continue;
      const strength = 1 - (d / def.radius) * 0.5;
      if (f === G.player) {
        G.player.flashT = def.duration * strength;
        G.hud.flashOverlay(def.duration * strength);
      } else {
        f.flashT = def.duration * strength;
      }
    }
  }
}

// ---- the charge

export function plantSpike(G, fighter, siteId) {
  const site = G.world.sites[siteId];
  G.spike.state = 'planted';
  G.spike.site = siteId;
  G.spike.pos.copy(site.center);
  G.spike.timer = SPIKE_TIMER;
  G.spike.carrier = null;
  fighter.hasSpike = false;
  fighter.money += 300;
  G.stats.plants += 1;
  G.hud.banner(`CHARGE PLANTED — SITE ${siteId}`, 'The charge is live. Hold the site or stop the defuse.', 'ember');
  G.audio.plantBeep();
  G.audio.plantBeep();
  addKillfeed(G, fighter.name, `SITE ${siteId}`, 'Charge planted', false);
  hearNoise(G, site.center, 40, fighter.team);
}

export function defuseSpike(G, fighter) {
  G.spike.state = 'gone';
  G.spike.site = null;
  fighter.money += 300;
  G.stats.defuses += 1;
  endRound(G, 'vanta', 'defused');
}

// ---- economy and buying

export function buyItem(G, fighter, id) {
  if (G.phase !== 'buy') return false;
  if (id === 'armor') {
    if (fighter.armor >= 100 || fighter.money < 650) return false;
    fighter.money -= 650;
    fighter.armor = 100;
    G.audio.buy();
    return true;
  }
  if (id === 'frag' || id === 'flash' || id === 'smoke') {
    const def = GRENADES[id];
    if (fighter.money < def.price || (fighter.grenades[id] ?? 0) >= 2) return false;
    fighter.money -= def.price;
    fighter.grenades[id] = (fighter.grenades[id] ?? 0) + 1;
    G.audio.buy();
    return true;
  }
  const def = WEAPONS[id];
  if (!def || fighter.money < def.price) return false;
  fighter.money -= def.price;
  if (id === 'pistol') {
    fighter.pistol = createWeapon('pistol');
    fighter.weapon = fighter.pistol;
    fighter.weaponId = 'pistol';
  } else {
    fighter.primary = createWeapon(id);
    fighter.weapon = fighter.primary;
    fighter.weaponId = id;
  }
  G.audio.buy();
  return true;
}

function botAutoBuy(G, bot) {
  if (bot.money >= 2700 && bot.weaponId !== 'rifle' && bot.weaponId !== 'sniper') {
    bot.money -= 2700;
    bot.primary = createWeapon('rifle');
    bot.weapon = bot.primary;
    bot.weaponId = 'rifle';
  } else if (bot.money >= 1500 && bot.weaponId === 'pistol') {
    bot.money -= 1500;
    bot.primary = createWeapon('shotgun');
    bot.weapon = bot.primary;
    bot.weaponId = 'shotgun';
  }
  if (bot.money >= 650 && bot.armor < 100) {
    bot.money -= 650;
    bot.armor = 100;
  }
  // entry utility first: rushers and the flanker carry a flash
  if ((bot.role === 'rusher' || bot.role === 'flanker') && bot.money >= 200 && (bot.grenades.flash ?? 0) === 0) {
    bot.money -= 200;
    bot.grenades.flash = 1;
  }
  // the flanker also carries smoke for the site entry
  if (bot.role === 'flanker' && bot.money >= 300 && (bot.grenades.smoke ?? 0) === 0) {
    bot.money -= 300;
    bot.grenades.smoke = 1;
  }
  if (bot.money >= 300 && (bot.grenades.frag ?? 0) === 0) {
    bot.money -= 300;
    bot.grenades.frag = 1;
  }
}

// ---- rounds

export function createMatch(G) {
  G.score = { ember: 0, vanta: 0 };
  G.round = 0;
  G.lossStreak = { ember: 0, vanta: 0 };
  G.killfeed = [];
  G.grenades = [];
  G.stats = { plants: 0, detonations: 0, defuses: 0, rounds: [], kills: 0 };
  G.teamSite = 'A';
  G.prevSite = null;
  for (const f of G.fighters) {
    f.money = 800;
    f.kills = 0;
    f.deaths = 0;
    f.grenades = { frag: 0, flash: 0, smoke: 0 };
    f.pistol = createWeapon('pistol');
    f.primary = null;
    f.weapon = f.pistol;
    f.weaponId = 'pistol';
    f.armor = 0;
  }
  startRound(G);
}

export function startRound(G) {
  G.round += 1;
  G.phase = 'buy';
  G.phaseT = BUY_TIME;
  G.roundTime = ROUND_TIME;
  G.spike = { state: 'carried', site: null, pos: new THREE.Vector3(), timer: 0, carrier: G.player.team === 'ember' ? G.player : G.bots.find((b) => b.team === 'ember') };
  G.plantProgress = 0;
  G.defuseProgress = 0;
  G._idleAnchor = null;
  // the team site call: Ember pushes ONE of three sites together, rotating A, B, C
  G.teamSite = pickSite(G.round, G.prevSite).id;
  G.prevSite = G.teamSite;
  // respawn everyone at their spawn, fresh health, kept weapons
  const spawns = { ember: G.world.attackerSpawns, vanta: G.world.defenderSpawns };
  const counters = { ember: 0, vanta: 0 };
  for (const f of G.fighters) {
    const list = spawns[f.team];
    const spawn = list[counters[f.team] % list.length];
    counters[f.team] += 1;
    f.body.reset(spawn, f.team === 'ember' ? 0 : Math.PI);
    f.hp = 100;
    f.alive = true;
    f.flashT = 0;
    f.hasSpike = false;
    for (const w of [f.pistol, f.primary]) {
      if (!w) continue;
      w.mag = w.def.mag;
      w.reserve = w.def.reserve;
      w.reloading = false;
    }
    if (f.soldier) {
      f.soldier.group.rotation.x = 0;
      f.soldier.group.position.y = 0;
      f.soldier.group.scale.set(1, 1, 1);
      f.soldier.ring.visible = true;
      f.soldier.group.visible = true;
    }
  }
  // the charge rides with the attacking team: the player when they attack, else the first Ember rusher
  G.player.hasSpike = G.player.team === 'ember';
  if (G.player.team !== 'ember') {
    const carrier = G.bots.find((b) => b.team === 'ember');
    if (carrier) carrier.hasSpike = true;
  }
  for (const bot of G.bots) {
    bot.sitePref = ['A', 'B', 'C'][Math.floor(G.rng() * 3)];
    bot.target = null;
    bot.path = [];
    bot.pathIndex = 0;
    bot.currentDest = null;
    bot.blockedTimer = 0;
    bot.detourActive = false;
    bot.stuckCheckT = 0;
    bot.plantProgress = 0;
    bot.defuseProgress = 0;
    bot.deckPhase = false;
    bot.staged = false;
    bot.threwEntry = false;
    botAutoBuy(G, bot);
  }
  rebuildShootTargets(G);
  G.hud.showBuy(G);
  if (G.input) G.input.releaseLock();
  const siteName = siteById(G.teamSite).label;
  G.hud.banner(`ROUND ${G.round} — PUSH ${siteName}`, 'Ember pushes one site together. Spend your credits. Press B for the buy menu, E to plant at a site.', 'info');
}

export function endRound(G, winner, reason) {
  if (G.phase !== 'round' && G.phase !== 'buy') return;
  G.score[winner] += 1;
  G.stats.rounds.push({ round: G.round, winner, reason, site: G.teamSite });
  if (reason === 'detonation') G.stats.detonations += 1;
  const loser = winner === 'ember' ? 'vanta' : 'ember';
  G.lossStreak[loser] += 1;
  G.lossStreak[winner] = 0;
  const lossBonus = Math.min(3400, 1900 + (G.lossStreak[loser] - 1) * 500);
  for (const f of G.fighters) {
    if (f.team === winner) f.money += 3250;
    else f.money += lossBonus;
  }
  const reasonText = {
    eliminated: winner === 'ember' ? 'Vanta team eliminated' : 'Ember team eliminated',
    detonation: 'The charge detonated — Site lost',
    defused: 'The charge was defused',
    time: 'Time expired — the charge never went off',
  }[reason] ?? reason;
  G.phase = 'roundEnd';
  G.phaseT = 4.5;
  // the charge stops mattering once the round is decided
  for (const f of G.fighters) f.hasSpike = false;
  if (G.spike.state === 'carried') G.spike.state = 'gone';
  const playerWon = winner === G.player.team;
  G.hud.banner(
    playerWon ? 'ROUND WON' : 'ROUND LOST',
    `${winner === 'ember' ? 'EMBER' : 'VANTA'} takes round ${G.round} — ${reasonText}. Score ${G.score.ember} – ${G.score.vanta}.`,
    playerWon ? 'ember' : 'vanta',
  );
  if (playerWon) G.audio.roundWin();
  else G.audio.roundLose();
  G.hud.showRoundEnd(G);
}

export function endMatch(G) {
  G.phase = 'matchEnd';
  const { ember, vanta } = G.score;
  const result = ember > vanta ? 'ember' : vanta > ember ? 'vanta' : 'draw';
  G.hud.showMatchEnd(G, result);
  if (result === 'ember') G.audio.roundWin();
  else if (result === 'vanta') G.audio.roundLose();
}

export function updateMatch(G, dt) {
  if (G.phase === 'buy') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) {
      G.phase = 'round';
      G.hud.hideBuy();
      G.audio.roundStart();
      G.hud.banner(`ROUND ${G.round}`, `Plant the charge at Site ${G.teamSite} — or eliminate Vanta.`, 'info');
    }
    return;
  }
  if (G.phase === 'roundEnd') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) {
      if (G.score.ember >= WIN_ROUNDS || G.score.vanta >= WIN_ROUNDS || G.round >= MAX_ROUNDS) endMatch(G);
      else startRound(G);
    }
    return;
  }
  if (G.phase !== 'round') return;

  // round clock
  if (G.spike.state !== 'planted') {
    G.roundTime -= dt;
    if (G.roundTime <= 0) {
      G.roundTime = 0;
      endRound(G, 'vanta', 'time');
      return;
    }
  } else {
    G.spike.timer -= dt;
    if (Math.floor(G.spike.timer * 2) !== Math.floor((G.spike.timer + dt) * 2)) G.audio.plantBeep();
    if (G.spike.timer <= 0) {
      const site = G.world.sites[G.spike.site];
      G.effects.explosion(new THREE.Vector3(site.center.x, 1, site.center.z));
      G.audio.explosion();
      for (const f of G.fighters) {
        if (!f.alive) continue;
        const fp = f.body.state.position;
        if (Math.hypot(fp.x - site.center.x, fp.z - site.center.z) < 8) damageFighter(G, f, 200, 'body', G.player, 'Charge');
      }
      G.spike.state = 'gone';
      endRound(G, 'ember', 'detonation');
      return;
    }
  }

  // AFK carrier handoff: a player still for 8 s hands the charge to the
  // nearest living Ember bot, so the round keeps moving without them.
  const p = G.player;
  if (G.spike.state === 'carried' && G.spike.carrier === p && p.alive) {
    const pp = p.body.state.position;
    if (!G._idleAnchor) G._idleAnchor = { x: pp.x, z: pp.z, t: G.time };
    const moved = Math.hypot(pp.x - G._idleAnchor.x, pp.z - G._idleAnchor.z);
    if (moved > 1.5) {
      G._idleAnchor = { x: pp.x, z: pp.z, t: G.time };
    } else if (G.time - G._idleAnchor.t > 8) {
      const near = G.bots
        .filter((b) => b.team === 'ember' && b.alive)
        .sort((a, b) => {
          const ap = a.body.state.position;
          const bp = b.body.state.position;
          return Math.hypot(ap.x - pp.x, ap.z - pp.z) - Math.hypot(bp.x - pp.x, bp.z - pp.z);
        })[0];
      if (near) {
        p.hasSpike = false;
        near.hasSpike = true;
        G.spike.carrier = near;
        G._idleAnchor = null;
        G.hud.banner(`${near.name} TAKES THE CHARGE`, 'You held still — a teammate carries the charge now.', 'ember');
      }
    }
  } else {
    G._idleAnchor = null;
  }

  // the player plants by holding E inside a site while carrying the charge
  if (p.alive && p.hasSpike && G.spike.state === 'carried') {
    const inSite = Object.values(G.world.sites).find(
      (s) => Math.hypot(s.center.x - p.body.state.position.x, s.center.z - p.body.state.position.z) < s.radius - 0.5,
    );
    if (inSite && G.input.state.keys.has('KeyE')) {
      G.plantProgress += dt;
      if (Math.floor(G.plantProgress * 2) !== Math.floor((G.plantProgress - dt) * 2)) G.audio.plantBeep();
      if (G.plantProgress >= PLANT_TIME) {
        G.plantProgress = 0;
        plantSpike(G, p, inSite.id);
      }
    } else {
      G.plantProgress = Math.max(0, G.plantProgress - dt * 2);
    }
  }

  // a dropped charge is picked up by walking over it
  if (G.spike.state === 'dropped') {
    for (const f of G.fighters) {
      if (!f.alive || f.team !== 'ember') continue;
      const fp = f.body.state.position;
      if (Math.hypot(fp.x - G.spike.pos.x, fp.z - G.spike.pos.z) < 1.4) {
        f.hasSpike = true;
        G.spike.state = 'carried';
        G.spike.carrier = f;
        if (f === G.player) G.hud.banner('CHARGE RECOVERED', 'You carry the charge. Plant it at Site A, B or C.', 'ember');
        break;
      }
    }
  }

  updateGrenades(G, dt);
  checkElimination(G);
}
