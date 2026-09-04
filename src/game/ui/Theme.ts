/**
 * Central design tokens for the project's visual system, which is
 * **Modern, dark minimalist, organic minimalist, brutalist - plus about 10%
 * industrial techno** (see
 * README - treat the ratio literally). Charcoal/off-white neutrals,
 * squared low-radius panels with thin borders, reserved accent colors
 * used ONLY for transient
 * interaction state (charged, merge-ready), and a separate set of resource
 * identity colors (credits, gems, energy, XP, level). Tile family colors
 * live in data/chains.ts and are deliberately kept out of both sets (see
 * the comment there).
 *
 * The three groups are kept apart on purpose: state, resource, and family
 * identity each answer a different question, and collapsing any two of
 * them has produced real readability bugs here before.
 *
 * Every UI surface in BoardScene, TileView, and MergeFx should pull from
 * here rather than hardcoding hex values, so the whole game reads as one
 * consistent system instead of per-screen one-off styling.
 */

export const Theme = {
  // Warm charcoal backdrop - never pure black, keeps the "warm" half of
  // the brief's palette instruction even on the darkest surfaces.
  bg: 0x1c1a17,
  bgElevated: 0x272421, // board frame, order cards, panel headers

  // Warm off-white content panels - never sterile pure white.
  panel: 0xebe7e0,
  panelAlt: 0x3e3932, // muted/disabled panel tone (sold slots, locked state)

  borderOnDark: 0x49433c,
  borderOnLight: 0xc6beb3,

  textOnDark: 0xf1eee9,
  // Was a grey (0x9f9589). Owner's call: secondary text reads white like
  // everything else, so the token now matches textOnDark. Kept as its own
  // name because ~40 call sites use it to mean "secondary", and collapsing
  // them loses the record of which text that is.
  textOnDarkMuted: 0xf1eee9,
  textOnLight: 0x2f2923,
  textOnLightMuted: 0x746b63,

  // Reserved accent lighting - transient interaction STATE only. Do not
  // reuse these for tile family colors, decoration, or resource identity;
  // resources have their own tokens below.
  //
  // There used to be a third, accentCyan (0x47cfe1, "selected/focused").
  // It was removed once nothing referenced it: the selected-tile ring was
  // retired in favour of the action tray, and gems moved to their own
  // violet. `currencyEnergy` still carries that exact hex, so re-adding a
  // cyan STATE accent would now collide with the energy chip - pick a
  // different hue if a selected/focused state comes back.
  accentAmber: 0xf2ad36, // charged / ready to collect / affordable
  accentGreen: 0x7bd241, // merge-ready / success / positive confirmation

  danger: 0xd04f39,

  // Fill for a completable order card. Green because the reserved accent set
  // already assigns green to "ready / positive confirmation", and because
  // amber - the other candidate - is taken by SOURCE readiness, so an amber
  // order card would read as "a source is ready" at a glance.
  //
  // Kept deliberately deep and desaturated: the card carries white title
  // text AND green XP labels, and a brighter green ground swallowed the XP
  // colour entirely. Readability of the contents wins over intensity of the
  // lit state - the border and top highlight carry the "lit" read instead.
  orderReadyFill: 0x18280f,

  // Resource identity colors. Every player-facing resource owns exactly one
  // hue that nothing else uses, so colour alone identifies it. This exists
  // because three separate things (source-readiness, credits, and the level
  // badge) were once all the same amber, which made the HUD unreadable.
  //
  // Gem violet is kept clear of the tile family ramps, in particular
  // granite's dusty pink (0xb3818a) - the only nearby hue on the board.
  //
  // currencyXp is a blue-leaning emerald, deliberately NOT accentGreen's
  // yellow-leaning lime: XP is a resource, while accentGreen is the
  // transient merge-ready state, and one green serving both re-created the
  // exact ambiguity the amber split above was undertaken to fix. It also
  // reads better than the lime did on the light profile panel.
  currencyCredit: 0xffc62e, // bright yellow-gold, distinct from source-ready amber
  currencyGem: 0x9a5fe0,    // deep violet
  currencyEnergy: 0x47cfe1, // cyan
  currencyXp: 0x47dd88,     // bright emerald - for DARK surfaces
  // Same identity, darkened for the one place XP text lands on a LIGHT
  // surface (the profile panel's "N XP TO LEVEL M"). Brightening the token
  // above for the dark order cards would have made that line wash out; a
  // resource keeping one hue across two tonal variants is the normal
  // design-system answer, and far better than picking a brightness that
  // suits neither surface.
  currencyXpOnLight: 0x1d854a,
  playerLevel: 0x165f91,    // dark blue identity for level/profile surfaces

  // Real-money prices ($0.99 etc). Not a game resource, but it needs to be
  // visibly NOT one either - a dollar amount reading in a resource colour
  // would imply you can earn it. A truer, more indigo blue than energy's
  // turquoise cyan, and far lighter than the level badge's navy, so it
  // doesn't read as either of those on a dark button.
  realMoney: 0x4f8ff2,

  // Squared-panel radii: small and consistent, never the fully rounded
  // "card" look. 0 reads as pure brutalist block; the small radii below
  // are used on most panels so edges don't feel razor-sharp on a touch UI.
  radiusPanel: 6,
  radiusTile: 8,
  radiusChip: 3,

  borderWidth: 1.5,
  borderWidthStrong: 2,

  fontHeading: '"Segoe UI", -apple-system, "Helvetica Neue", Arial, sans-serif',
  fontMono: '"SF Mono", "Cascadia Mono", "Consolas", "Roboto Mono", monospace',
  // Digits only, for badges/counters read at a glance. The mono stack above
  // is fine for technical labels but its 5/6/8 are near-identical blobs at
  // badge size - a tier-5 Walnut Block was misread as a tier-6 Mahogany in
  // real use. Verdana and Roboto were both drawn specifically for small-size
  // screen legibility (open apertures, wide counters, unambiguous digits).
  // System fonts only, deliberately: this ships as an offline Capacitor app,
  // so a CDN webfont would silently fail to load on device.
  fontNumeric: 'Verdana, "Roboto", "Segoe UI", "DejaVu Sans", Tahoma, sans-serif'
} as const;

/**
 * Phaser rasterizes every Text object to an offscreen canvas at 1x, then the
 * browser upscales it to the display - so on a devicePixelRatio-2 screen all
 * text renders at half the available resolution and small glyphs turn to
 * mush. This was the dominant cause of the tier-badge digit confusion, more
 * than the font choice was; the game canvas itself is unaffected (it already
 * matches its CSS size), so this is a text-only correction and changes no
 * layout. Capped at 3 so a 4x device doesn't spend texture memory for gain
 * no one can see.
 */
export const textResolution = Math.min(
  typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
  3
);

/** Converts a Theme numeric color (used by Phaser Graphics) to a CSS hex string (used by Phaser Text). */
export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export interface MaterialLighting {
  highlight: number; // brightest - the corner/edge facing the light directly
  light: number;
  base: number;
  dark: number;
  shadow: number; // darkest - the corner/edge opposite the light
}

/**
 * Full lighting ramp for one material color, simulating a single fixed
 * light source from the upper-left of every tile. This is what gives a
 * flat vector fill actual volume - a 4-corner gradient from `highlight` to
 * `shadow`, plus a specular highlight blob and lit/shadowed edge strokes,
 * reads as a physical object (polished stone, glazed ceramic, wood) sitting
 * under a light, not a flat-colored icon. Contrast widens with tier so
 * higher tiers read as more "refined/polished," matching the raw-to-lit
 * material-ramp narrative in chains.ts.
 */
export function materialLighting(baseColor: number, tier: number): MaterialLighting {
  const r = (baseColor >> 16) & 0xff;
  const g = (baseColor >> 8) & 0xff;
  const b = baseColor & 0xff;
  const t = Math.min(tier / 9, 1);

  // Endpoints are TINTED, not clipped. The previous ramp drove highlight to
  // 98% toward pure white and shadow to 3% of base at tier 9, so every
  // family's lit faces were the same near-white and every outline was pure
  // black - hue collapsed exactly at the tier meant to be most distinctive.
  // Lightening toward a warm-tinted white and darkening toward a
  // family-tinted black keeps a tier-9 Sapphire's highlight blue-white and a
  // Rosewood's warm-white.
  const LIGHT_TARGET = 0.86; // how far the "white" end really goes
  const DARK_FLOOR = 0.1;    // how much base survives at the "black" end
  const lighten = (amt: number) => {
    const f = (v: number) => Math.min(255, Math.round(v + (255 - v) * amt * LIGHT_TARGET));
    return (f(r) << 16) | (f(g) << 8) | f(b);
  };
  const darken = (amt: number) => {
    const f = (v: number) => Math.max(0, Math.round(v * (1 - amt * (1 - DARK_FLOOR))));
    return (f(r) << 16) | (f(g) << 8) | f(b);
  };

  // Tier drives SPREAD, not absolute brightness. The old ramp widened only
  // ~1.17x across all nine tiers (0.14 added onto a 0.82 baseline), so
  // "contrast widens with tier" was aspirational rather than true. This is a
  // real ~2.1x widening, with `base` pinned to the family colour so the
  // material identity never drifts.
  const spread = 0.3 + t * 0.34;
  return {
    highlight: lighten(spread * 1.15),
    light: lighten(spread * 0.5),
    base: baseColor,
    dark: darken(spread * 0.78),
    shadow: darken(spread * 1.2)
  };
}

/**
 * Samples the 5-tone ramp continuously for `t` in 0..1, where 0 is `shadow`
 * and 1 is `highlight`.
 *
 * This is what lets a faceted shape shade by its face normal instead of
 * picking one of two colours from a boolean. Several helpers in TierIcons
 * used `Math.cos(angle + PI*0.75) > 0.1` to choose highlight-or-dark, which
 * turned a 7-sided form into a 2-tone pinwheel - flat, however many facets
 * it had.
 */
export function toneAt(p: MaterialLighting, t: number): number {
  const stops = [p.shadow, p.dark, p.base, p.light, p.highlight];
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const lo = stops[i];
  const hi = stops[i + 1];
  const mix = (shift: number) => {
    const a = (lo >> shift) & 0xff;
    const b2 = (hi >> shift) & 0xff;
    return Math.round(a + (b2 - a) * f);
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/**
 * Tone for a face whose outward normal points at `angleRad`, under the fixed
 * upper-left key light every shape in this game shares. Returns a continuous
 * ramp sample, so adjacent facets differ by a real gradient step rather than
 * flipping between two values.
 */
export function toneForNormal(p: MaterialLighting, angleRad: number): number {
  // The key points from the UPPER-LEFT. Screen-space y grows DOWNWARD, so
  // upper-left is angle -3PI/4, and a face is most lit when
  // cos(normal + 3PI/4) is greatest. Sign matters: `- Math.PI * 0.75` would
  // put the light at lower-left and invert every faceted shape in the game.
  // This matches the convention every existing helper in TierIcons used.
  const nDotL = Math.cos(angleRad + Math.PI * 0.75);
  return toneAt(p, 0.5 + nDotL * 0.5);
}

/** Two-tone shade for callers that only need a light/dark pair (e.g. SpawnerView's core glow). */
export function materialShade(baseColor: number, tier: number): { light: number; dark: number } {
  const { light, dark } = materialLighting(baseColor, tier);
  return { light, dark };
}
