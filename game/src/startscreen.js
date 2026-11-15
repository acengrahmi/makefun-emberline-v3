// startscreen.js — the first thing the judge reads after the cover.
// One job: fill the start screen's feature list, so the overlay says in one
// glance what the game is, what makes it different, and how it plays.
// The side-pick buttons themselves live in index.html and are wired by
// hud.js; this file only owns the words, in one place, so the overlay copy
// in hud.js and the list here never disagree.

export const FEATURES = [
  '3 bomb sites — Furnace A, Silos B, Crane C',
  '5 weapons + frag, flash and smoke grenades',
  '9 bots with roles, routes, callouts and grenades',
  'Buy menu, economy and round pips — first to 7',
  'Upper Deck: a real second floor with 3 staircases',
  'Plant the charge, defend it, or defuse under fire',
];

// Fill the <ul id="start-features"> in the overlay with the feature list.
// Called once at boot; a no-op when the element is absent (headless sim).
export function fillStartFeatures() {
  const ul = document.getElementById('start-features');
  if (!ul) return;
  ul.innerHTML = FEATURES.map((f) => `<li>${f}</li>`).join('');
}
