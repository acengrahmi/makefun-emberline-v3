// Characters: low-poly soldiers, one build per team colour. Head and torso are
// separate meshes so a shot can be a headshot; every mesh carries userData
// {fighter, part} for the raycast in match.js. v2: shoulder pads, backpack,
// brighter visor, so the teams read apart at 30 metres.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a37e'), roughness: 0.8 });
const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22242a'), roughness: 0.85 });
const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#15161a'), roughness: 0.45, metalness: 0.6 });

export function createSoldier(team) {
  const teamColor = team === 'ember' ? PALETTE.ember : PALETTE.teal;
  const teamDark = team === 'ember' ? PALETTE.emberDark : PALETTE.tealDark;
  const clothMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamDark), roughness: 0.9 });
  const vestMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'ember' ? '#3a2c22' : '#1f2c30'), roughness: 0.9 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(teamColor), emissive: new THREE.Color(teamColor), emissiveIntensity: 1.6, roughness: 0.3,
  });
  const padMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), emissive: new THREE.Color(teamColor), emissiveIntensity: 0.35, roughness: 0.7 });

  const group = new THREE.Group();
  // legs (pivot at the hip so they can swing)
  const legL = new THREE.Group();
  legL.position.set(-0.14, 0.86, 0);
  const legLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.86, 0.26), clothMat);
  legLMesh.position.y = -0.43;
  legLMesh.castShadow = true;
  legL.add(legLMesh);
  const legR = new THREE.Group();
  legR.position.set(0.14, 0.86, 0);
  const legRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.86, 0.26), clothMat);
  legRMesh.position.y = -0.43;
  legRMesh.castShadow = true;
  legR.add(legRMesh);
  // torso with vest plate and a team stripe
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), vestMat);
  torso.position.y = 1.22;
  torso.castShadow = true;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.1, 0.38), new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), emissive: new THREE.Color(teamColor), emissiveIntensity: 0.5 }));
  stripe.position.y = 1.42;
  // shoulder pads in the team colour, so the team reads from behind too
  const padL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.3), padMat);
  padL.position.set(-0.38, 1.56, 0);
  padL.castShadow = true;
  const padR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.3), padMat);
  padR.position.set(0.38, 1.56, 0);
  padR.castShadow = true;
  // backpack, with a small glowing strip
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.16), darkMat);
  pack.position.set(0, 1.28, -0.26);
  pack.castShadow = true;
  const packLight = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.02), visorMat);
  packLight.position.set(0, 1.44, -0.35);
  // arms
  const armL = new THREE.Group();
  armL.position.set(-0.38, 1.5, 0);
  const armLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), clothMat);
  armLMesh.position.y = -0.31;
  armLMesh.castShadow = true;
  armL.add(armLMesh);
  const armR = new THREE.Group();
  armR.position.set(0.38, 1.5, 0);
  const armRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), clothMat);
  armRMesh.position.y = -0.31;
  armRMesh.castShadow = true;
  armR.add(armRMesh);
  // head: helmet with a glowing visor slit
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), darkMat);
  head.position.y = 1.78;
  head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.05), visorMat);
  visor.position.set(0, 1.78, 0.19);
  // gun held forward
  const gun = new THREE.Group();
  gun.position.set(0.18, 1.32, 0.28);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.85), gunMat);
  barrel.position.z = 0.3;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.3), gunMat);
  stock.position.z = -0.18;
  gun.add(barrel, stock);
  // team ring on the ground, so the player reads the team at a glance
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(teamColor), transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;

  group.add(legL, legR, torso, stripe, padL, padR, pack, packLight, armL, armR, head, visor, gun, ring);
  return {
    group, legL, legR, armL, armR, head, torso, visor, gun, ring,
    teamColor,
  };
}

/** Walk-cycle and aim pose for one soldier. `speed` is ground speed in m/s,
 * `baseY` the feet's height, so the walk bob never fights the body position. */
export function updateSoldier(soldier, { speed, yaw, pitch, crouching, firing, walkPhase, baseY = 0 }) {
  soldier.group.rotation.y = yaw;
  const swing = Math.min(1, speed / 5) * (crouching ? 0.5 : 1);
  const phase = walkPhase;
  soldier.legL.rotation.x = Math.sin(phase) * 0.55 * swing;
  soldier.legR.rotation.x = -Math.sin(phase) * 0.55 * swing;
  soldier.armL.rotation.x = -Math.sin(phase) * 0.3 * swing - 0.5;
  soldier.armR.rotation.x = Math.sin(phase) * 0.3 * swing - 0.5;
  soldier.group.scale.y = crouching ? 0.68 : 1;
  soldier.group.position.y = baseY + Math.abs(Math.sin(phase)) * 0.04 * swing;
  // aim: pitch the gun with the look direction
  soldier.gun.rotation.x = pitch * 0.9;
  if (firing) soldier.gun.position.z = 0.28 - 0.05;
  else soldier.gun.position.z = 0.28;
}

/** A fallen soldier: lie flat and fade the ring. `baseY` is the feet's height,
 * so a bot that falls on the upper deck lies on the deck, not under it. */
export function layDownSoldier(soldier, baseY = 0) {
  soldier.group.rotation.x = -Math.PI / 2 + 0.12;
  soldier.group.position.y = baseY + 0.25;
  soldier.ring.visible = false;
}
