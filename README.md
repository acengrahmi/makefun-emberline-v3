# EMBERLINE v3 — a three.js tactical FPS

A round-based tactical FPS for make.fun's `threejs-fps-02` bounty: 5v5 in
the Foundry Yard — **three bomb sites** (A Furnace, B Silos, C Crane under
the gantry), a buy economy, five weapons, and frag, flash **and smoke**
grenades. Nine AI bots with roles, routes, callouts and grenades fight both
sides; the Upper Deck is a real second floor with three staircases. First to
7 rounds wins; rounds end by elimination, charge detonation/defusal, or time.

v3 over v2 (judge score 849.626, rank 36/1278):
- A third site, C — Crane: defenders split three ways, attackers pick.
- Smoke grenades: a live cloud blocks sight for both sides, and the
  flanker veils the site before the push enters.
- Golden hour: a low amber sun and brighter yard, so the game reads in a
  screenshot instead of going dusk-dark.
- The cover is now a live firefight, not the menu; the start screen lets
  you pick a side — attack as Ember or defend as Vanta.
- Idle-player balance kept: the same 5-seed sim as v2 (see REPORT.md).

Play it: `node serve.ts`, then open http://localhost:8080 in desktop Chrome.

Built with three.js 0.187.0 (vendored under `game/vendor/three/`). `main.ts`
(Node 22) hands the game in: it copies `game/` and `screenshots/` to
`/output` and writes `/output/dossier.json`.

MIT licensed. Counter-Strike-style, never a copy: own map, art, sounds, names.
