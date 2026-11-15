// Weapons: five original guns plus grenades. Each definition is the whole feel
// of the gun — damage, headshot multiplier, magazine, fire rate, reload,
// spread standing / moving / airborne, recoil, price. Spread and recoil make
// stopping to aim pay: firing on the move blooms the cone, so bursts and taps
// beat spray-and-pray. v2: rifle move spread tighter, shotgun cheaper, sniper
// reserve one magazine larger.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', kind: 'pistol', price: 0,
    damage: 34, headMult: 4, mag: 12, reserve: 48, interval: 0.16, auto: false,
    reloadTime: 1.1, spread: 0.004, moveSpread: 0.02, airSpread: 0.05,
    recoilPitch: 0.006, recoilYaw: 0.002, bloom: 0.004, range: 60, pellets: 1,
  },
  smg: {
    id: 'smg', name: 'VK-9 Ripper', kind: 'smg', price: 1500,
    damage: 26, headMult: 4, mag: 32, reserve: 96, interval: 0.085, auto: true,
    reloadTime: 1.9, spread: 0.008, moveSpread: 0.026, airSpread: 0.055,
    recoilPitch: 0.005, recoilYaw: 0.003, bloom: 0.005, range: 45, pellets: 1,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Longshot', kind: 'rifle', price: 2700,
    damage: 33, headMult: 4, mag: 30, reserve: 90, interval: 0.11, auto: true,
    reloadTime: 2.4, spread: 0.003, moveSpread: 0.02, airSpread: 0.05,
    recoilPitch: 0.009, recoilYaw: 0.003, bloom: 0.006, range: 90, pellets: 1,
  },
  shotgun: {
    id: 'shotgun', name: 'SG-12 Breacher', kind: 'shotgun', price: 1500,
    damage: 9, headMult: 2, mag: 6, reserve: 24, interval: 0.85, auto: false,
    reloadTime: 2.6, spread: 0.03, moveSpread: 0.045, airSpread: 0.07,
    recoilPitch: 0.028, recoilYaw: 0.008, bloom: 0.0, range: 22, pellets: 8,
  },
  sniper: {
    id: 'sniper', name: 'LW-50 Deadeye', kind: 'sniper', price: 4750,
    damage: 88, headMult: 4, mag: 5, reserve: 20, interval: 1.15, auto: false,
    reloadTime: 3.0, spread: 0.0006, moveSpread: 0.06, airSpread: 0.09,
    recoilPitch: 0.045, recoilYaw: 0.006, bloom: 0.0, range: 120, pellets: 1,
    scoped: true,
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag Charge', price: 300, radius: 6.5, damage: 110 },
  flash: { id: 'flash', name: 'Flash Burst', price: 200, radius: 14, duration: 2.2 },
  // v3: a smoke veil that blocks sight for 8 s — honest cover for both sides.
  // 8 s, not 12: the veil is for crossing open ground, and it must be gone by
  // the post-plant, or a cloud still up at the plant veils the defuse.
  smoke: { id: 'smoke', name: 'Smoke Veil', price: 300, radius: 3.4, duration: 8 },
};

export const BUY_ORDER = ['rifle', 'sniper', 'smg', 'shotgun', 'pistol'];

/** A live weapon: its definition, its ammunition and its timers. */
export function createWeapon(defId) {
  const def = WEAPONS[defId];
  return {
    def,
    mag: def.mag,
    reserve: def.reserve,
    cooldown: 0,
    reloading: false,
    reloadEnd: 0,
    bloom: 0,
    /** Spread right now: base + movement + air + bloom from recent fire.
     * Movement spread scales with speed, so walking (Shift) is steadier
     * than running — stopping to aim still pays the most. */
    spreadNow(speed, airborne) {
      let s = this.def.spread + this.bloom;
      if (speed > 0.6) s += this.def.moveSpread * Math.min(1, speed / 5.4);
      if (airborne) s += this.def.airSpread;
      return s;
    },
    ready(now) {
      return !this.reloading && this.cooldown <= now;
    },
    /** Spend one round. Returns false when the magazine is empty. */
    takeRound() {
      if (this.mag <= 0) return false;
      this.mag -= 1;
      this.bloom = Math.min(0.045, this.bloom + this.def.bloom);
      return true;
    },
    startReload(now) {
      if (this.reloading || this.mag >= this.def.mag || this.reserve <= 0) return false;
      this.reloading = true;
      this.reloadEnd = now + this.def.reloadTime;
      return true;
    },
    finishReload() {
      const need = this.def.mag - this.mag;
      const take = Math.min(need, this.reserve);
      this.mag += take;
      this.reserve -= take;
      this.reloading = false;
    },
    step(now, dt) {
      this.bloom = Math.max(0, this.bloom - dt * 0.05);
      if (this.reloading && now >= this.reloadEnd) this.finishReload();
    },
  };
}
