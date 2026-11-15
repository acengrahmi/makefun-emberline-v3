// HUD: every DOM element the player reads — health, armor, ammo, money,
// timer, score, killfeed, crosshair, minimap, buy menu, overlays. The sim
// never touches the DOM; it calls these setters, and the minimap redraws at
// 10 Hz. v2 adds comms callouts, a Tab scoreboard, round pips, and a minimap
// that draws the upper deck as a dashed outline.
import { WEAPONS, GRENADES, BUY_ORDER } from './weapons.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    health: $('health-value'), healthBar: $('health-bar'), armor: $('armor-value'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), ammo: $('ammo'),
    weaponName: $('weapon-name'), money: $('money-value'), timer: $('timer-value'),
    scoreEmber: $('score-ember'), scoreVanta: $('score-vanta'), roundLabel: $('round-label'),
    pipsEmber: $('pips-ember'), pipsVanta: $('pips-vanta'),
    killfeed: $('killfeed'), comms: $('comms'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerCopy: $('banner-copy'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'),
    play: $('play'), buyMenu: $('buy-menu'), buyItems: $('buy-items'), buyMoney: $('buy-money'),
    minimap: $('minimap'), damageVignette: $('damage-vignette'), flash: $('flash'),
    plantBar: $('plant-bar'), plantFill: $('plant-fill'), plantLabel: $('plant-label'),
    deathBar: $('death-bar'), damageDir: $('damage-dir'), grenades: $('grenades'),
    spikeTag: $('spike-tag'), scoreboard: $('scoreboard'), scoreRows: $('score-rows'),
  };
  const minimapCtx = els.minimap ? els.minimap.getContext('2d') : null;
  let bannerTimer = 0;
  let hitTimer = 0;
  let commsTimer = 0;
  let playCallback = null;
  let buyCallback = null;
  let deployCallback = null;

  if (els.play) {
    els.play.addEventListener('click', () => {
      if (playCallback) playCallback('ember');
    });
  }
  // the start screen's side pick: attack as Ember or defend as Vanta
  const pickEmber = document.getElementById('pick-ember');
  if (pickEmber) {
    pickEmber.addEventListener('click', () => {
      if (playCallback) playCallback('ember');
    });
  }
  const pickVanta = document.getElementById('pick-vanta');
  if (pickVanta) {
    pickVanta.addEventListener('click', () => {
      if (playCallback) playCallback('vanta');
    });
  }
  const deployBtn = document.getElementById('buy-deploy');
  if (deployBtn) {
    deployBtn.addEventListener('click', () => {
      if (deployCallback) deployCallback();
    });
  }

  function showOverlay(kind, data = {}) {
    if (!els.overlay) return;
    els.overlay.hidden = false;
    // the side pick and feature list belong to the start screen only
    const sidePick = document.querySelector('.side-pick');
    if (sidePick) sidePick.style.display = kind === 'start' ? 'flex' : 'none';
    const features = document.getElementById('start-features');
    if (features) features.style.display = kind === 'start' ? 'grid' : 'none';
    const titles = {
      start: 'EMBERLINE',
      paused: 'PAUSED',
      roundEnd: data.title ?? 'ROUND OVER',
      matchEnd: data.title ?? 'MATCH OVER',
    };
    const copies = {
      start: 'A tactical round-based FPS in the Foundry Yard — three bomb sites, a real second floor, and smoke that blocks sight. Plant the charge at Site A (Furnace), Site B (Silos) or Site C (Crane) — or eliminate the Vanta team. Take the stairs to the deck and hold the high ground. Pick a side below.',
      paused: 'The round is waiting. Click to resume.',
      roundEnd: data.copy ?? '',
      matchEnd: data.copy ?? '',
    };
    els.overlayTitle.textContent = titles[kind] ?? kind;
    els.overlayCopy.textContent = copies[kind] ?? '';
    if (els.play) els.play.textContent = kind === 'start' ? 'Click to play' : kind === 'matchEnd' ? 'Play again' : 'Resume';
    els.overlay.dataset.kind = kind;
  }

  function banner(title, copy, tone = 'info', seconds = 3.2) {
    if (!els.banner) return;
    els.bannerTitle.textContent = title;
    els.bannerCopy.textContent = copy;
    els.banner.dataset.tone = tone;
    els.banner.hidden = false;
    bannerTimer = seconds;
  }

  function buyMenuHtml(G) {
    const p = G.player;
    const rows = [];
    for (const id of BUY_ORDER) {
      const def = WEAPONS[id];
      const owned = p.weaponId === id || (p.primary && p.primary.def.id === id);
      const afford = p.money >= def.price;
      rows.push(`<button type="button" class="buy-item${owned ? ' owned' : ''}${afford ? '' : ' poor'}" data-buy="${id}">
        <span class="buy-name">${def.name}</span><span class="buy-kind">${def.kind} · ${def.mag} rnd</span>
        <span class="buy-price">${owned ? 'OWNED' : '$' + def.price}</span></button>`);
    }
    rows.push(`<button type="button" class="buy-item${p.armor >= 100 ? ' owned' : ''}${p.money >= 650 ? '' : ' poor'}" data-buy="armor">
      <span class="buy-name">Kevlar Vest</span><span class="buy-kind">armor · absorbs half damage</span>
      <span class="buy-price">${p.armor >= 100 ? 'OWNED' : '$650'}</span></button>`);
    for (const id of ['frag', 'flash', 'smoke']) {
      const def = GRENADES[id];
      const count = p.grenades[id] ?? 0;
      rows.push(`<button type="button" class="buy-item${p.money >= def.price ? '' : ' poor'}" data-buy="${id}">
        <span class="buy-name">${def.name}</span><span class="buy-kind">grenade · owned ${count}</span>
        <span class="buy-price">$${def.price}</span></button>`);
    }
    return rows.join('');
  }

  /** One row of round pips: 7 slots, filled for rounds won. */
  function pipsHtml(won) {
    let out = '';
    for (let i = 0; i < 7; i += 1) out += `<i class="${i < won ? 'on' : ''}"></i>`;
    return out;
  }

  return {
    onPlay(callback) {
      playCallback = callback;
    },
    onBuy(callback) {
      buyCallback = callback;
    },
    onDeploy(callback) {
      deployCallback = callback;
    },
    setHealth(hp, armor) {
      if (els.health) els.health.textContent = String(Math.max(0, Math.ceil(hp)));
      if (els.healthBar) els.healthBar.style.width = `${Math.max(0, hp)}%`;
      if (els.armor) els.armor.textContent = String(Math.max(0, Math.ceil(armor)));
    },
    setAmmo(mag, reserve, name) {
      if (els.ammoMag) els.ammoMag.textContent = String(mag);
      if (els.ammoReserve) els.ammoReserve.textContent = `/ ${reserve}`;
      if (els.ammo) els.ammo.classList.toggle('empty', mag === 0);
      if (els.weaponName) els.weaponName.textContent = name;
    },
    setMoney(money) {
      if (els.money) els.money.textContent = `$${money}`;
      if (els.buyMoney) els.buyMoney.textContent = `$${money}`;
    },
    setTimer(seconds, planted) {
      if (!els.timer) return;
      const s = Math.max(0, Math.ceil(seconds));
      els.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      els.timer.classList.toggle('planted', !!planted);
    },
    setScore(ember, vanta, round) {
      if (els.scoreEmber) els.scoreEmber.textContent = String(ember);
      if (els.scoreVanta) els.scoreVanta.textContent = String(vanta);
      if (els.roundLabel) els.roundLabel.textContent = `ROUND ${round}`;
      if (els.pipsEmber) els.pipsEmber.innerHTML = pipsHtml(ember);
      if (els.pipsVanta) els.pipsVanta.innerHTML = pipsHtml(vanta);
    },
    setGrenades(frag, flash, smoke = 0) {
      if (els.grenades) els.grenades.textContent = `Frag ${frag} · Flash ${flash} · Smoke ${smoke}`;
    },
    setSpike(carried) {
      if (els.spikeTag) els.spikeTag.hidden = !carried;
    },
    setCrosshairGap(spread) {
      if (els.crosshair) els.crosshair.style.setProperty('--gap', `${4 + spread * 900}px`);
    },
    setScoped(scoped) {
      if (els.crosshair) els.crosshair.classList.toggle('scoped', !!scoped);
      document.body.classList.toggle('scoped', !!scoped);
    },
    hitmarker(kill) {
      if (!els.hitmarker) return;
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', !!kill);
      hitTimer = kill ? 0.35 : 0.12;
    },
    damageFlash() {
      if (!els.damageVignette) return;
      els.damageVignette.style.opacity = '0.85';
      setTimeout(() => {
        els.damageVignette.style.opacity = '0';
      }, 180);
    },
    damageDirection(angleRad) {
      if (!els.damageDir) return;
      els.damageDir.style.transform = `translate(-50%, -50%) rotate(${angleRad}rad)`;
      els.damageDir.style.opacity = '1';
      setTimeout(() => {
        els.damageDir.style.opacity = '0';
      }, 700);
    },
    flashOverlay(seconds) {
      if (!els.flash) return;
      els.flash.style.opacity = '0.92';
      els.flash.style.transition = 'none';
      requestAnimationFrame(() => {
        els.flash.style.transition = `opacity ${seconds}s linear`;
        els.flash.style.opacity = '0';
      });
    },
    killfeed(entries) {
      if (!els.killfeed) return;
      els.killfeed.innerHTML = entries
        .map((e) => `<div class="kf"><b class="kf-k">${e.killer}</b><span class="kf-w">${e.headshot ? '◉ ' : ''}${e.weaponName}</span><b class="kf-v">${e.victim}</b></div>`)
        .join('');
    },
    /** A teammate's callout, shown briefly under the crosshair. */
    comms(text) {
      if (!els.comms) return;
      els.comms.textContent = text;
      els.comms.hidden = false;
      commsTimer = 3;
    },
    banner,
    hideBanner() {
      if (els.banner) els.banner.hidden = true;
      bannerTimer = 0;
    },
    showOverlay,
    hideOverlay() {
      if (els.overlay) els.overlay.hidden = true;
    },
    showBuy(G) {
      if (!els.buyMenu) return;
      document.body.classList.add('buy-open');
      els.buyItems.innerHTML = buyMenuHtml(G);
      els.buyItems.querySelectorAll('[data-buy]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (buyCallback) buyCallback(btn.dataset.buy);
        });
      });
      this.setMoney(G.player.money);
      els.buyMenu.hidden = false;
    },
    hideBuy() {
      if (els.buyMenu) els.buyMenu.hidden = true;
      document.body.classList.remove('buy-open');
    },
    refreshBuy(G) {
      if (!els.buyMenu || els.buyMenu.hidden) return;
      this.showBuy(G);
    },
    showDeath() {
      if (els.deathBar) els.deathBar.hidden = false;
    },
    hideDeath() {
      if (els.deathBar) els.deathBar.hidden = true;
    },
    showRoundEnd(G) {
      this.setScore(G.score.ember, G.score.vanta, G.round);
    },
    showMatchEnd(G, result) {
      const { ember, vanta } = G.score;
      const title = result === 'ember' ? 'EMBER WINS THE MATCH' : result === 'vanta' ? 'VANTA WINS THE MATCH' : 'MATCH DRAWN';
      const copy = `Final score Ember ${ember} – ${vanta} Vanta over ${G.round} rounds. You finished with ${G.player.kills} eliminations. Click Play again for a rematch.`;
      showOverlay('matchEnd', { title, copy });
    },
    /** Hold Tab: a scoreboard of every fighter, sorted by kills. */
    showScoreboard(G) {
      if (!els.scoreboard || !els.scoreRows) return;
      const rows = [...G.fighters].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      els.scoreRows.innerHTML = rows.map((f) => `<div class="sb-row ${f.team}">
        <span class="sb-name">${f === G.player ? 'YOU' : f.name}${f.hasSpike ? ' ◆' : ''}</span>
        <span class="sb-team">${f.team === 'ember' ? 'EMBER' : 'VANTA'}</span>
        <span class="sb-kd">${f.kills} / ${f.deaths}</span>
        <span class="sb-hp">${f.alive ? Math.ceil(f.hp) + ' HP' : 'DOWN'}</span>
        <span class="sb-money">$${f.money}</span></div>`).join('');
      els.scoreboard.hidden = false;
    },
    hideScoreboard() {
      if (els.scoreboard) els.scoreboard.hidden = true;
    },
    setPlantProgress(progress, label) {
      if (!els.plantBar) return;
      if (progress > 0) {
        els.plantBar.hidden = false;
        els.plantFill.style.width = `${Math.min(100, progress * 100)}%`;
        if (els.plantLabel) els.plantLabel.textContent = label;
      } else {
        els.plantBar.hidden = true;
      }
    },
    /** Draw the top-down minimap: walls, the upper deck, sites, the charge,
     * both teams. Deck rects draw as a dashed amber outline above the rest. */
    drawMinimap(G) {
      if (!minimapCtx || !els.minimap) return;
      const ctx = minimapCtx;
      const W = els.minimap.width;
      const H = els.minimap.height;
      const b = G.world.bounds;
      const sx = (x) => ((x - b.minX) / (b.maxX - b.minX)) * W;
      const sy = (z) => ((z - b.minZ) / (b.maxZ - b.minZ)) * H;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#1b1e26';
      ctx.fillRect(0, 0, W, H);
      for (const r of G.world.minimapRects) {
        ctx.fillStyle = r.c;
        ctx.fillRect(sx(r.x), sy(r.z), Math.max(1, (r.w / (b.maxX - b.minX)) * W), Math.max(1, (r.d / (b.maxZ - b.minZ)) * H));
      }
      if (G.world.minimapUpper) {
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#ffd25e';
        ctx.lineWidth = 1.5;
        for (const r of G.world.minimapUpper) {
          ctx.strokeRect(sx(r.x), sy(r.z), (r.w / (b.maxX - b.minX)) * W, (r.d / (b.maxZ - b.minZ)) * H);
        }
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffd25e';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('UPPER DECK', sx(-25) + 3, sy(-18.6) + 10);
      }
      for (const site of Object.values(G.world.sites)) {
        ctx.beginPath();
        ctx.arc(sx(site.center.x), sy(site.center.z), 10, 0, Math.PI * 2);
        const siteColor = site.id === 'A' ? '#f0a830' : site.id === 'B' ? '#35c8b8' : '#c9f06a';
        ctx.strokeStyle = siteColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = siteColor;
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(site.id, sx(site.center.x), sy(site.center.z));
      }
      if (G.spike.state === 'planted') {
        ctx.beginPath();
        ctx.arc(sx(G.spike.pos.x), sy(G.spike.pos.z), 5, 0, Math.PI * 2);
        ctx.fillStyle = '#e5484d';
        ctx.fill();
      } else if (G.spike.state === 'dropped') {
        ctx.fillStyle = '#f0a830';
        ctx.fillRect(sx(G.spike.pos.x) - 3, sy(G.spike.pos.z) - 3, 6, 6);
      }
      for (const f of G.fighters) {
        if (!f.alive) continue;
        const p = f.body.state.position;
        ctx.beginPath();
        ctx.arc(sx(p.x), sy(p.z), f === G.player ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = f === G.player ? '#ffffff' : f.team === 'ember' ? '#ff7a1a' : '#35c8b8';
        ctx.fill();
        // a fighter on the deck gets a ring, so height reads on the map
        if (p.y > 1.5) {
          ctx.beginPath();
          ctx.arc(sx(p.x), sy(p.z), 6, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffd25e';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      if (G.player.alive) {
        const p = G.player.body.state.position;
        const yaw = G.player.body.state.yaw;
        ctx.beginPath();
        ctx.moveTo(sx(p.x), sy(p.z));
        ctx.lineTo(sx(p.x) - Math.sin(yaw - 0.35) * 12, sy(p.z) - Math.cos(yaw - 0.35) * 12);
        ctx.lineTo(sx(p.x) - Math.sin(yaw + 0.35) * 12, sy(p.z) - Math.cos(yaw + 0.35) * 12);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fill();
      }
    },
    /** Per-frame HUD upkeep: banner, hitmarker and comms fade-outs. */
    tick(dt) {
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0 && els.banner) els.banner.hidden = true;
      }
      if (hitTimer > 0) {
        hitTimer -= dt;
        if (hitTimer <= 0 && els.hitmarker) els.hitmarker.classList.remove('on', 'kill');
      }
      if (commsTimer > 0) {
        commsTimer -= dt;
        if (commsTimer <= 0 && els.comms) els.comms.hidden = true;
      }
    },
  };
}
