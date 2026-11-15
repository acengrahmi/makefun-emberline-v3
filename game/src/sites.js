// sites.js — the three bomb sites and the round's site call. One table, so
// the banner, the rotation and the bot objective can never disagree about
// what a site is. Geometry (centres, radii, rings, signs) lives in map.js,
// which owns the world; this file owns only the call.
//
// The call rotates A, B, C with no repeats, and C never opens a match:
// round 1 is always A or B, so the first plant is a long lane, not a
// mid-yard brawl. Defenders split three ways; attackers push one site.
export const SITES = [
  { id: 'A', label: 'SITE A — FURNACE', ring: '#ffb03a' },
  { id: 'B', label: 'SITE B — SILOS', ring: '#7fd4ff' },
  { id: 'C', label: 'SITE C — CRANE', ring: '#c9f06a' },
];

export function siteById(id) {
  return SITES.find((s) => s.id === id) ?? SITES[0];
}

// The site for a round: rotate through the table, never repeating the
// previous round's site, and never C on round 1.
export function pickSite(round, prevSite) {
  const order = ['A', 'B', 'C'];
  let id = order[(round - 1) % order.length];
  if (round === 1 && id === 'C') id = 'A';
  if (id === prevSite) id = order[(order.indexOf(id) + 1) % order.length];
  return siteById(id);
}
