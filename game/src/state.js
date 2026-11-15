// The one place match state lives. Every system reads this object and main.js is the
// only one that moves it between phases, so a round's rules sit in a single file.
export const PHASE = { MENU: 'menu', BUY: 'buy', LIVE: 'live', ROUND_END: 'roundEnd', MATCH_END: 'matchEnd' };
export const TEAM = { YOU: 'you', FOE: 'foe' };
export const WIN_ROUNDS = 5;
export const ROUND_SECONDS = 100;
export const BUY_SECONDS = 15;
export const BOMB_FUSE = 35;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 4;
export const START_MONEY = 800;
export const WIN_BONUS = 3250;
export const LOSS_BONUS = 1900;
export const KILL_BONUS = 300;
export const PLANT_BONUS = 300;

export function createMatch() {
  return {
    phase: PHASE.MENU,
    round: 1,
    wins: { you: 0, foe: 0 },
    money: START_MONEY,
    timer: 0,
    phaseLeft: 0,
    bomb: { state: 'carried', site: null, plantedAt: 0, fuseLeft: 0, plantAt: 0, defuseAt: 0 },
    kills: { you: 0, foe: 0 },
    roundWinner: null,
    roundReason: '',
    message: '',
    messageAt: 0,
  };
}
