// Input: keyboard, mouse look and pointer lock, kept apart from the simulation.
// The simulation reads only `state` (a Set of codes, look deltas, firing flags);
// nothing here touches the game world. Tab is captured for the scoreboard.
export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    lookX: 0,
    lookY: 0,
    firing: false,
    scoped: false,
  };

  function onKeyDown(event) {
    if (event.repeat) return;
    state.keys.add(event.code);
    if (event.code === 'Space' || event.code === 'Tab') event.preventDefault();
  }
  function onKeyUp(event) {
    state.keys.delete(event.code);
  }
  function onMouseMove(event) {
    if (document.pointerLockElement !== canvas) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  }
  function onMouseDown(event) {
    if (document.pointerLockElement !== canvas) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.scoped = true;
  }
  function onMouseUp(event) {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.scoped = false;
  }
  function onLock() {
    onLockChange(document.pointerLockElement === canvas);
  }
  function onContextMenu(event) {
    event.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      const look = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
  };
}
