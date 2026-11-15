// EMBERLINE v3 — palette. One golden-hour palette for every module: a low
// amber sun against cool blue-grey steel, ember orange for the attackers,
// ice teal for the defenders, leaf green for Site C. Every colour the game
// shows is one of these.
export const PALETTE = {
  canvas: '#6b5a44', // warm haze — the fog colour, so distance lifts the yard instead of darkening it
  ground: '#4a4f58', // concrete yard, light enough to read under the low sun
  siteC: '#c9f06a', // Site C — Crane, leaf green
  groundDark: '#282b32',
  steel: '#464c59', // walls and containers, cool
  steelDark: '#363b46',
  rust: '#8a5535', // rusted containers and beams
  amber: '#f0a830', // site markings, accents, Ember team
  ember: '#ff7a1a', // Ember team colour
  emberDark: '#b34d00',
  teal: '#35c8b8', // Vanta team colour
  tealDark: '#0f6f66',
  ink: '#f2eee2', // HUD text
  muted: '#a8aebb', // secondary HUD text
  danger: '#e5484d', // damage, enemy tracers
  good: '#7dc383', // health, win
  crate: '#7a6544', // wooden crates
  barrel: '#55663f', // olive barrels
  hazard: '#e0b32a', // hazard stripes
  deck: '#4d5462', // upper deck floor
  deckEdge: '#ffd25e', // deck edge glow
  white: '#ffffff',
};

export const TEAM = {
  ember: { name: 'EMBER', color: PALETTE.ember, dark: PALETTE.emberDark },
  vanta: { name: 'VANTA', color: PALETTE.teal, dark: PALETTE.tealDark },
};
