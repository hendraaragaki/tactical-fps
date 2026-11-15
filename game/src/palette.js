// The look plan, in one place: dusk in an old freight yard. Warm sand and rust under a
// cool dusk sky, one ember accent, teal for site B and the player's side, red for the foe.
// Every colour in the game and the page comes from these names.
export const PALETTE = {
  canvas: '#191411',
  sky: '#2a2019',
  surface: '#2a211a',
  hairline: '#40342a',
  ink: '#ece3cf',
  muted: '#9a8a76',
  accent: '#e8833a',
  sand: '#b99b6b',
  rust: '#8a4a2b',
  foe: '#d94f3d',
  ally: '#4fa8a0',
  siteA: '#e8833a',
  siteB: '#4fa8a0',
};

export function shade(name) {
  return PALETTE[name];
}
