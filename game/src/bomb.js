// The bomb: carried, planted on a timer, defused by a bot when the attacker is down.
// main.js feeds it the player's position and the E key; it reports events back.
import { PLANT_SECONDS, DEFUSE_SECONDS, BOMB_FUSE } from './state.js';

export function createBomb() {
  const bomb = {
    state: 'carried', // carried | planting | planted | defusing | exploded | defused
    site: null,
    plantProgress: 0,
    defuseProgress: 0,
    fuseLeft: 0,
    lastBeep: 0,
  };

  function reset() {
    bomb.state = 'carried';
    bomb.site = null;
    bomb.plantProgress = 0;
    bomb.defuseProgress = 0;
    bomb.fuseLeft = 0;
    bomb.lastBeep = 0;
  }

  return {
    bomb,
    reset,
    // Called every step while the player holds E inside a site.
    plant(dt, site, events) {
      if (bomb.state !== 'carried' && bomb.state !== 'planting') return;
      if (bomb.state === 'carried') {
        bomb.state = 'planting';
        bomb.site = site;
        bomb.plantProgress = 0;
      }
      if (bomb.site !== site) {
        bomb.state = 'carried';
        bomb.site = null;
        bomb.plantProgress = 0;
        return;
      }
      bomb.plantProgress += dt;
      if (bomb.plantProgress >= PLANT_SECONDS) {
        bomb.state = 'planted';
        bomb.fuseLeft = BOMB_FUSE;
        bomb.lastBeep = BOMB_FUSE;
        events.onPlant(site);
      }
    },
    cancelPlant() {
      if (bomb.state === 'planting') {
        bomb.state = 'carried';
        bomb.site = null;
        bomb.plantProgress = 0;
      }
    },
    update(dt, ctx, events) {
      if (bomb.state === 'planted') {
        bomb.fuseLeft -= dt;
        const gap = bomb.fuseLeft > 20 ? 1 : bomb.fuseLeft > 10 ? 0.5 : 0.25;
        if (bomb.lastBeep - bomb.fuseLeft >= gap) {
          bomb.lastBeep = bomb.fuseLeft;
          events.onBeep(bomb.fuseLeft);
        }
        if (bomb.fuseLeft <= 0) {
          bomb.state = 'exploded';
          events.onExplode();
          return;
        }
        // A bot next to the bomb defuses it only while the attacker is down.
        if (!ctx.playerAlive) {
          const bot = ctx.nearestBot(bomb.site);
          if (bot && bot.position.distanceTo(bomb.site.center) < 1.8) {
            bomb.state = 'defusing';
            bomb.defuseProgress = 0;
          }
        }
      } else if (bomb.state === 'defusing') {
        const bot = ctx.nearestBot(bomb.site);
        if (!bot || !bot.alive || bot.position.distanceTo(bomb.site.center) >= 1.8 || ctx.playerAlive) {
          bomb.state = 'planted';
          bomb.defuseProgress = 0;
          return;
        }
        bomb.defuseProgress += dt;
        if (bomb.defuseProgress >= DEFUSE_SECONDS) {
          bomb.state = 'defused';
          events.onDefuse();
        }
      }
    },
  };
}
