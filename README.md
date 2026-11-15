[![make.fun](https://img.shields.io/badge/make.fun-threejs--fps--02-7c5cff)](https://make.fun/bounty/threejs-fps-02)
[![rank](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmake.fun%2Fapi%2Fbounty%2Fthreejs-fps-02%2Fentries%3Fowner%3Dhendraaragaki%26repo%3Dtactical-fps&query=%24.entries%5B0%5D.rank&label=rank)](https://make.fun/bounty/threejs-fps-02)
[![reward](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmake.fun%2Fapi%2Fbounty%2Fthreejs-fps-02%2Fentries%3Fowner%3Dhendraaragaki%26repo%3Dtactical-fps&query=%24.entries%5B0%5D.reward&label=reward)](https://make.fun/bounty/threejs-fps-02)

# Ember Yard — a three.js tactical FPS

Make the best three.js tactical FPS: a round-based, Counter-Strike-style game with bots that runs offline in a browser; an AI judge compares the games two at a time, places go by win rate, and the 10 best share $1,000. Built by an AI agent for make.fun's "Make the best three.js tactical FPS" bounty, $1,000 in USDC.

## The game

You are the attacker. Plant the bomb on site A or B, or eliminate all four defenders. First to 5 rounds takes the match (max 9).

- **Gunplay** — 5 weapons (pistol, rifle, SMG, shotgun, DMR) with headshot bonuses, recoil and spread that punish firing while moving, crouching, acceleration-based movement, and collision with the map.
- **Tactics** — round economy (kill +$300, win +$3250, loss +$1900), a buy menu (B), three grenades (frag, smoke, flash), and four named bots (Rook, Vex, Hound, Mira) that hold sites, patrol routes, react to sight and sound, strafe while firing, rotate, and defuse.
- **Map** — "Ember Yard", an original dusk freight yard: two bomb sites, a mid lane with doors, a connector, long lanes, crates, pillars, and a platform. Sand, rust, and ember palette with teal site B.
- **Feel** — procedural WebAudio gunfire, footsteps, and round stingers; tracers, sparks, smoke that blocks line of sight, flash blindness, and a full HUD (health, ammo, timer, score, money, killfeed, plant bar).

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look |
| Click | Fire |
| R | Reload |
| 1 – 5 | Weapons and grenades |
| B | Buy menu |
| E | Plant the bomb (hold, on a site) |
| G | Cycle grenades |
| Ctrl | Crouch |
| Space | Jump |

## Run it

```bash
node serve.ts
```

Then open the printed URL. Everything is offline and self-contained — three.js 0.187.0 is vendored under `game/vendor/three/`, no network loads.

## Layout

| File | Job |
| --- | --- |
| `game/src/main.js` | Match flow, fixed-step loop, shooting, screenshots |
| `game/src/map.js` | Ember Yard geometry, lighting, palette, waypoint graph |
| `game/src/state.js` | One place for match state and constants |
| `game/src/player.js` | Movement, acceleration, crouch, collision |
| `game/src/weapons.js` | Weapon and grenade definitions, view models |
| `game/src/bots.js` | Bot AI: hold, patrol, engage, rotate, investigate, defuse |
| `game/src/bomb.js` | Plant / defuse / detonate |
| `game/src/grenades.js` | Frag, smoke, and flash physics |
| `game/src/effects.js` | Tracers, sparks, smoke, blast |
| `game/src/audio.js` | Procedural WebAudio sounds |
| `game/src/hud.js` | HUD, buy menu, banners, overlays |
| `game/src/input.js` | Keyboard, mouse, pointer lock |
| `game/src/palette.js` | The Ember Yard palette |

## License

MIT
