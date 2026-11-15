// The DOM HUD: crosshair, hit marker, health, ammo, timer, score, money, killfeed,
// banners, plant bar, damage vignette and the buy menu. It never touches the
// simulation; main.js pushes numbers in and reads the button callbacks out.
import { WEAPONS, GRENADES } from './weapons.js';

const COPY = {
  start: {
    title: 'Ember Yard',
    copy: 'Attackers plant the bomb on A or B. Defenders hold the sites. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'Ember Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeLine = $('grenades');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const roundScore = $('round-score');
  const bombStatus = $('bomb-status');
  const aliveValue = $('alive-value');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerText = $('banner-text');
  const bannerSub = $('banner-sub');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const damage = $('damage');
  const flash = $('flash');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const buymenu = $('buymenu');
  const buyGrid = $('buy-grid');
  const buyMoney = $('buy-money');
  const buyClose = $('buy-close');
  let bannerTimer = 0;
  let hitTimer = 0;
  let lastAmmo = '';
  let lastHealth = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastAlive = -1;
  let lastBomb = '';

  function buildBuy() {
    buyGrid.innerHTML = '';
    const items = [];
    for (const id of ['rifle', 'smg', 'shotgun', 'dmr']) {
      items.push({ id, name: WEAPONS[id].name, price: WEAPONS[id].price, kind: 'gun' });
    }
    for (const id of ['frag', 'smoke', 'flash']) {
      items.push({ id, name: GRENADES[id].name, price: GRENADES[id].price, kind: 'grenade' });
    }
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      button.dataset.id = item.id;
      button.innerHTML = `<b></b><span></span>`;
      button.querySelector('b').textContent = item.name;
      button.querySelector('span').textContent = `$${item.price}`;
      buyGrid.appendChild(button);
    }
  }
  buildBuy();

  return {
    setAmmo(mag, reserve, name, grenades) {
      const key = `${mag}|${reserve}|${name}|${grenades.frag}${grenades.smoke}${grenades.flash}`;
      if (key === lastAmmo) return;
      lastAmmo = key;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
      grenadeLine.textContent = `Frag ${grenades.frag} · Smoke ${grenades.smoke} · Flash ${grenades.flash}`;
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setHealth(value) {
      const v = Math.max(0, Math.round(value));
      if (v === lastHealth) return;
      lastHealth = v;
      healthValue.textContent = String(v);
      healthFill.style.width = `${v}%`;
      healthFill.classList.toggle('low', v <= 30);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setTimer(seconds, phase) {
      const text = phase === 'buy' ? `BUY ${seconds}` : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('buy', phase === 'buy');
    },
    setScore(you, foe) {
      const text = `${you} — ${foe}`;
      if (text === lastScore) return;
      lastScore = text;
      roundScore.textContent = text;
    },
    setAlive(n) {
      if (n === lastAlive) return;
      lastAlive = n;
      aliveValue.textContent = String(n);
    },
    setBomb(text) {
      if (text === lastBomb) return;
      lastBomb = text;
      bombStatus.textContent = text;
      bombStatus.classList.toggle('hot', text.length > 0);
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(kill, headshot) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('head', headshot);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'head'), 110);
    },
    killfeed(text) {
      const line = document.createElement('div');
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    banner(text, sub = '', ms = 2600) {
      bannerText.textContent = text;
      bannerSub.textContent = sub;
      banner.classList.remove('hidden');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.add('hidden'), ms);
    },
    showPlant(label, progress) {
      if (progress === null) {
        plantBar.classList.add('hidden');
        return;
      }
      plantBar.classList.remove('hidden');
      plantLabel.textContent = label;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
    },
    damageFlash() {
      damage.classList.remove('on');
      void damage.offsetWidth;
      damage.classList.add('on');
    },
    flashWhite(ms = 900) {
      flash.classList.remove('on');
      void flash.offsetWidth;
      flash.style.transitionDuration = `${ms}ms`;
      flash.classList.add('on');
    },
    showOverlay(mode, score) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'end' ? score : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    showBuy(open, money, owned, grenades) {
      buymenu.classList.toggle('hidden', !open);
      buyMoney.textContent = `$${money}`;
      for (const button of buyGrid.children) {
        const id = button.dataset.id;
        const isGun = !!WEAPONS[id];
        const have = isGun ? owned[id] : grenades[id] >= 2;
        button.disabled = have || money < (isGun ? WEAPONS[id].price : GRENADES[id].price);
        button.classList.toggle('owned', have);
      }
    },
    onBuy(handler) {
      buyGrid.addEventListener('click', (event) => {
        const button = event.target.closest('.buy-item');
        if (button && !button.disabled) handler(button.dataset.id);
      });
    },
    onBuyClose(handler) {
      buyClose.addEventListener('click', handler);
    },
  };
}
