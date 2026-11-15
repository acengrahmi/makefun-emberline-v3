// Player movement: acceleration, friction, gravity, crouch and jump, resolved
// as a box against the colliders one axis at a time. Bots reuse this controller
// with synthetic keys, so both move by the same rules. No allocation in step.
// v2 adds auto-step: a ledge up to STEP_HEIGHT above the feet is stepped onto,
// which is what makes the deck's staircases climbable.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.4;
const STEP_HEIGHT = 0.45;

export function createPlayer(colliders, spawn) {
  const player = {
    position: new THREE.Vector3(spawn.x, spawn.y, spawn.z),
    velocity: new THREE.Vector3(),
    yaw: spawn.yaw ?? 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  // lift keeps the feet and the crown out of the horizontal tests, so standing
  // on the floor is not read as walking into a wall.
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function reset(pos, yaw) {
    player.position.set(pos.x, pos.y, pos.z);
    player.velocity.set(0, 0, 0);
    player.yaw = yaw;
    player.pitch = 0;
    player.eye = STAND_EYE;
    player.crouching = false;
    player.height = STAND_HEIGHT;
    player.onGround = true;
  }

  /** Try to step onto the ledge that blocks a horizontal move. Returns true
   * when the move's axis may proceed at the ledge's height. */
  function tryStepUp(nextX, nextZ, hit) {
    const rise = hit.max.y - player.position.y;
    if (rise <= 0.02 || rise > STEP_HEIGHT) return false;
    // the space above the ledge must be free at the new position
    if (overlaps(nextX, hit.max.y, nextZ, player.height, 0.02)) return false;
    player.position.y = hit.max.y;
    player.velocity.y = 0;
    player.onGround = true;
    return true;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching && !overlaps(player.position.x, player.position.y, player.position.z, STAND_HEIGHT, 0.02)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = player.crouching ? CROUCH_SPEED : (keys.has('ShiftLeft') || keys.has('ShiftRight') ? WALK_SPEED * 0.5 : WALK_SPEED);
    const blend = Math.min(1, ((player.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt) / speed);
    player.velocity.x += (wish.x * speed - player.velocity.x) * blend;
    player.velocity.z += (wish.z * speed - player.velocity.z) * blend;
    if (player.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      player.velocity.x *= damp;
      player.velocity.z *= damp;
    }

    if (keys.has('Space') && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
    player.velocity.y -= GRAVITY * dt;

    const nextX = player.position.x + player.velocity.x * dt;
    const hitX = overlaps(nextX, player.position.y, player.position.z, player.height, 0.04);
    if (!hitX) {
      player.position.x = nextX;
    } else if (!tryStepUp(nextX, player.position.z, hitX)) {
      player.velocity.x = 0;
    } else {
      player.position.x = nextX;
    }
    const nextZ = player.position.z + player.velocity.z * dt;
    const hitZ = overlaps(player.position.x, player.position.y, nextZ, player.height, 0.04);
    if (!hitZ) {
      player.position.z = nextZ;
    } else if (!tryStepUp(player.position.x, nextZ, hitZ)) {
      player.velocity.z = 0;
    } else {
      player.position.z = nextZ;
    }

    player.position.y += player.velocity.y * dt;
    player.onGround = false;
    const hit = overlaps(player.position.x, player.position.y, player.position.z, player.height, 0);
    if (hit && player.velocity.y <= 0) {
      player.position.y = hit.max.y;
      player.velocity.y = 0;
      player.onGround = true;
    } else if (hit) {
      player.position.y = hit.min.y - player.height;
      player.velocity.y = 0;
    }
    if (player.position.y < 0) {
      player.position.y = 0;
      player.velocity.y = 0;
      player.onGround = true;
    }
    player.velocity.y = Math.max(-30, player.velocity.y);
  }

  return {
    state: player,
    step,
    look,
    recoil,
    reset,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
  };
}
