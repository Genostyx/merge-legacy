import Phaser from 'phaser';
import type { GridPosition } from '../../types';
import type { CratePayloadEntry, GridCellData } from '../../Grid';
import { TileView } from '../../objects/TileView';
import { SpawnerView } from '../../objects/SpawnerView';
import { SpawnerPieceView } from '../../objects/SpawnerPieceView';
import { SplitterView } from '../../objects/SplitterView';
import { CrateView } from '../../objects/CrateView';
import { ResourceProducerView } from '../../objects/ResourceProducerView';
import type { ResourceProducerId } from '../../rewards/ResourceRewards';
import type { CrateTier } from '../../rewards/Rewards';

/**
 * Board constants, labels and small free functions.
 *
 * Split out of `BoardScene` verbatim - it carried ~340 lines of tables and
 * helpers above the class before a single line of scene code, and none of it
 * touches the scene. The only edit was adding `export`.
 */


export const COLS = 7;
export const ROWS = 9;
export const BOARD_TO_TRAY_GAP = 6;
/**
 * How far a finger must travel before a press becomes a DRAG.
 *
 * The piece used to follow the pointer from the first pixel, so the couple of
 * pixels a thumb rolls through on an ordinary tap were enough to pick the
 * piece up and carry it - and if it crossed into a neighbouring cell it moved
 * or merged. Below this distance the press is a tap and the piece never
 * leaves its cell; above it, the drag begins. The same number decides both,
 * so there is no band where a gesture is neither.
 */
export const DRAG_START_PX = 14;
/** Cell size the chrome constants below are tuned against. */
export const CHROME_BASE_CELL = 54;
export const EXPANSION_ROW_ONE = 7;
export const EXPANSION_ROW_TWO = 8;
/** Player level the second expansion row opens at - the label quotes this, so the two cannot drift. */
export const EXPANSION_ROW_TWO_LEVEL = 50;

export const EXPANSION_ROW_ONE_PRICES = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000];
export const EXPANSION_ROW_TWO_PRICES = [10_000, 20_000, 40_000, 80_000, 160_000, 320_000, 640_000];
export const SAVE_KEY = 'merge-game-save-v1';
/**
 * Where a save that could not be READ is parked, and where the last save that
 * loaded fine is kept.
 *
 * The game updates underneath players who are mid-run: their progress lives in
 * this browser, and a new build has to read what an older build wrote. When
 * that goes wrong the old behaviour was to silently start a new game, and the
 * next autosave - seconds later - overwrote the real save for good. These two
 * keys make that recoverable instead of terminal.
 *
 * `.unreadable` holds a save the current build choked on, exactly as written.
 * `.prev` holds the last save that loaded cleanly, captured BEFORE this
 * session starts writing over it, so a run can be rolled back one step even
 * when a broken build loaded fine and then corrupted the state.
 */
export const UNREADABLE_SAVE_KEY = `${SAVE_KEY}.unreadable`;
export const PREVIOUS_SAVE_KEY = `${SAVE_KEY}.prev`;

/** Writes a key without letting a full or blocked localStorage break the game. */
export function stashSave(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode and quota-exceeded both land here. A missing backup is bad;
    // a crash on startup because the backup could not be written is worse.
  }
}
export const AUTO_MERGE_KEY = 'merge-game-auto-merge';
export const TYPE_ID = 'wood';
export type BoardView = TileView | SpawnerView | SpawnerPieceView | CrateView | SplitterView | ResourceProducerView;
export type ForcedSpawn =
  | { kind: 'item'; typeId: string; tier: number }
  | { kind: 'spawner-piece'; typeId: string; tier: number }
  | { kind: 'spawner'; typeId: string; tier: number }
  | { kind: 'splitter' }
  | { kind: 'resource-producer'; producerId: ResourceProducerId; remaining: number }
  // `readyAt` rides along so a bought crate that has to wait for board space
  // keeps counting down in the vault rather than restarting when it lands.
  | { kind: 'crate'; tier: CrateTier; remaining: CratePayloadEntry[]; source?: string; readyAt?: number };

/**
 * The Fullscreen API, across the shapes phones actually ship.
 *
 * Standard `requestFullscreen` is not enough: Safari on iPad and older
 * Android WebViews only expose the `webkit` names, and asking the standard
 * one there silently does nothing. iPhone Safari has neither - it has never
 * shipped element fullscreen at all - which is why `fullscreenSupported`
 * exists: the settings row says so plainly instead of offering a dead switch.
 */
export interface FullscreenDoc extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}
export interface FullscreenEl extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

/** The element fullscreen is requested on: the page itself, so nothing is clipped. */
export function fullscreenTarget(): FullscreenEl {
  return document.documentElement as FullscreenEl;
}

export function fullscreenElement(): Element | null {
  const doc = document as FullscreenDoc;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function fullscreenSupported(): boolean {
  const el = fullscreenTarget();
  const doc = document as FullscreenDoc;
  // `fullscreenEnabled` is false inside an iframe whose parent withholds the
  // permission, where a request would be rejected rather than ignored.
  if (doc.fullscreenEnabled === false) return false;
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

/**
 * Enters or leaves fullscreen. MUST be called straight from a user gesture -
 * anything deferred, even by a zero-delay timer, drops the transient
 * activation the browser requires and the request is refused.
 */
export function toggleFullscreen(): void {
  const doc = document as FullscreenDoc;
  if (fullscreenElement()) {
    void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    return;
  }
  const el = fullscreenTarget();
  const request = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  // `navigationUI: 'hide'` asks Android Chrome to drop its own bars too. It is
  // a hint, and browsers that do not know the option ignore it rather than
  // reject, so it is safe to pass unconditionally.
  const result = request?.({ navigationUI: 'hide' } as FullscreenOptions);
  if (result && typeof (result as Promise<void>).catch === 'function') {
    void (result as Promise<void>).catch(() => undefined);
  }
}

/** A HUD currency chip that redraws itself to fit its own number. */
export interface HudChip {
  text: Phaser.GameObjects.Text;
  /** Width preferred by the current value before responsive compression. */
  naturalWidth: () => number;
  /** Draws with its right edge at `rightX`, constrained to `width`. */
  draw: (rightX: number, width: number) => void;
}
export interface ExpansionLockView {
  bg: Phaser.GameObjects.Graphics;
  price: Phaser.GameObjects.Text;
  mark: Phaser.GameObjects.Image;
  zone: Phaser.GameObjects.Zone;
}
export type ShopMode = 'full' | 'coin' | 'gem';

export const FAMILY_NAMES: Record<string, string> = {
  wood: 'WOOD',
  mineral: 'STONE',
  glass: 'GLASS',
  water: 'WATER',
  decagon: 'DECAGON',
  'currency-credit': 'CREDITS',
  'currency-energy': 'ENERGY',
  'currency-gem': 'GEMS'
};

export function familyTierLabel(typeId: string, tier: number): string {
  return `${FAMILY_NAMES[typeId] ?? typeId.toUpperCase()} ${String(tier).padStart(2, '0')}`;
}

export function sourceTierLabel(typeId: string, tier: number): string {
  return `${FAMILY_NAMES[typeId] ?? typeId.toUpperCase()} SOURCE ${String(tier).padStart(2, '0')}`;
}

export const SPAWNER_PIECE_NAMES: Record<string, string[]> = {
  wood: ['Cut Timber', 'Joined Beams', 'Timber Frame', 'Roofed Frame'],
  mineral: ['Cut Stone', 'Joined Stone Beams', 'Stone Framework', 'Roofed Stone Frame'],
  glass: ['Glass Panel', 'Joined Panels', 'Glass Framework', 'Roofed Glass Frame'],
  // The well set from docs/TODO_DETAILS.md, replacing the pipe names these
  // pieces no longer look like.
  water: ['Ring Section', 'Support Frame', 'Roof Section', 'Winch Assembly'],
  // Five, not four. The Decagon is assembled rather than built: a facet, a
  // pair of them, the frame they sit in, the core that drives it, and the
  // housing that closes it up.
  decagon: ['Facet', 'Facet Pair', 'Decagon Frame', 'Decagon Core', 'Decagon Housing']
};

export function spawnerPieceLabel(typeId: string, tier: number): string {
  return SPAWNER_PIECE_NAMES[typeId]?.[tier - 1]
    ?? `${FAMILY_NAMES[typeId] ?? typeId.toUpperCase()} DISPENSER PIECE ${String(tier).padStart(2, '0')}`;
}

/** Compact only genuinely long HUD values; ordinary four-digit totals stay exact. */
export function formatHudValue(value: number): string {
  const amount = Math.max(0, Math.floor(value));
  if (amount < 100_000) return String(amount);
  if (amount < 1_000_000) {
    const scaled = amount / 1_000;
    return `${scaled < 100 && !Number.isInteger(scaled) ? scaled.toFixed(1) : Math.floor(scaled)}K`;
  }
  const scaled = amount / 1_000_000;
  return `${scaled < 100 && !Number.isInteger(scaled) ? scaled.toFixed(1) : Math.floor(scaled)}M`;
}

export interface OrderCardView {
  /**
   * Per-card container. Everything below is positioned in LOCAL coordinates
   * inside it, so a card can be moved or animated by tweening `root.x`
   * alone - which is what makes the reorder-on-ready slide possible.
   */
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  progress: Phaser.GameObjects.Text;
  /** Requirement and reward tokens, rebuilt on every refresh. */
  /** Text or, for a currency, a number-plus-mark container. */
  rewardTexts: Array<Phaser.GameObjects.Text | Phaser.GameObjects.Container>;
  zone: Phaser.GameObjects.Zone;
  /** Current drawn width - cards size themselves to their content. */
  width: number;
}

/** Order card geometry. Cards size to their content and scroll horizontally. */
export const ORDER_CARD_GAP = 6;
/**
 * Card body. Only the requirement slots live inside it now - the rewards
 * float above the top edge and the GO chip below the bottom one, the way the
 * reference cards do it. That is what let this drop from 84 without the item
 * slots losing a single pixel.
 */
/** Room photo behind the board. Lives at `public/bg.png`. */
export const BG_FILE = 'bg.jpg';
export const BG_FALLBACK_FILE = 'minimalist-spa-interior-meditation-space_23-2151935107.avif';
export const BG_FALLBACK_KEY = 'bgPhotoFallback';

export const ORDER_CARD_H = 68;
/** Crate meter ring, beside the board's top-left corner. */
export const CRATE_RING_R = 19;
export const CRATE_RING_W = 6;
/**
 * The crate meter's own panel at the left of the order row: ring on the left,
 * its sentence to the right. Fixed width so the cards beside it never reflow
 * as the wording changes.
 */
export const CRATE_RING_LANE = 56;
/**
 * What it costs to UNLOCK a stage - not to build it.
 *
 * The furniture inside a stage is bought piece by piece with credits (see
 * `ROOM_PIECES`); this is the gate in front of the stage itself. Splitting the
 * two is what lets the project be a merge goal AND a steady spend: the wood
 * says "produce this", the pieces say "now choose what to buy first".
 */
export interface ProjectStage {
  /**
   * Credits charged at the unlock itself.
   *
   * Only the surfaces stage has one - it has no furniture to itemize, so its
   * 300 credits stay attached to the stage. Every later stage charges nothing
   * here and takes its credits through its pieces instead.
   */
  coins: number;
  /**
   * Delivered off the board, exactly like an order's requirements.
   *
   * Credits alone made the project a pure coin sink, and coin sinks stop
   * biting the moment order rewards outrun them - by mid-game all four stages
   * together cost less than a couple of deliveries. Requiring the ITEMS ties
   * the facility to the thing the player actually does, so a stage is a
   * production goal rather than a number going down.
   *
   * Wood only, on purpose: it is the starting family, so no stage can ever
   * demand a chain the player has no source for.
   */
  requirements: { typeId: string; tier: number; count: number }[];
}

export const PROJECT_STAGES: ProjectStage[] = [
  { coins: 300, requirements: [{ typeId: 'wood', tier: 4, count: 2 }] },
  { coins: 0, requirements: [{ typeId: 'wood', tier: 5, count: 2 }] },
  { coins: 0, requirements: [{ typeId: 'wood', tier: 6, count: 2 }] },
  { coins: 0, requirements: [{ typeId: 'wood', tier: 7, count: 2 }] }
];
/**
 * Every furniture sprite in the living room, in no particular order - the
 * manifest carries the real draw order. Listed here only so preload can
 * request them without waiting for the JSON.
 */
export const ROOM_ITEM_KEYS = [
  'rug', 'sofa', 'table', 'chair', 'bookcase', 'lamp', 'ceiling',
  'tvunit', 'tv', 'plant', 'side', 'books', 'pillow', 'plantsmall'
] as const;

export interface RoomItemDef {
  key: string;
  stage: number;
  label: string;
  /** [x, y, w, h], normalised against the 1024 frame, y measured from the top. */
  rect: [number, number, number, number];
  order: number;
}

export const PROJECT_STAGE_NAMES = [
  'UNFINISHED ROOM', 'FINISHED SURFACES', 'MAIN FURNITURE', 'COMFORT & STORAGE', 'COMPLETED LIVING ROOM'
] as const;
/**
 * Header band inside the card: reward on the left, GO on the right, both on
 * one row, with the item slots below. One panel, nothing overhanging - the
 * shape the owner picked out of the references.
 */
export const ORDER_HEADER_H = 20;
/**
 * The reward bar sits behind the card: it starts a little below the top and
 * runs well past the tray's top edge, so its lower corners are covered.
 */
export const ORDER_BAR_TOP = 4;
export const ORDER_BAR_H = ORDER_HEADER_H + 8;
export const ORDER_GO_W = 32;
export const ORDER_GO_H = 16;
export const ORDER_CARD_PAD = 9;
/** Narrow enough that short orders don't waste bar space... */
// Small enough that a one-item order HUGS its slot. At 104 a 46px item sat
// in the middle of a card with dead space either side, which is the single
// biggest reason ours did not read like the reference: there the card is
// barely bigger than the things in it.
export const ORDER_CARD_MIN_W = 58;
/** ...wide enough for `ROSEWOOD HEIRLOOM 0/3`, but never so wide one card owns the bar. */
export const ORDER_CARD_MAX_W = 212;
/** Matches TileView.snapTo, so a card reordering reads like a board swap. */
export const ORDER_REORDER_MS = 140;

/**
 * Rasterised size for the SVG art, always a POWER OF TWO.
 *
 * Phaser has no vector renderer - `load.svg` bakes to a texture at load - so
 * the only question is the bake resolution. The power-of-two part is not
 * cosmetic: WebGL only generates mipmaps for POT textures, and the game runs
 * with `mipmapFilter: 'LINEAR_MIPMAP_LINEAR'`. A non-POT size silently drops
 * to plain bilinear minification, which visibly aliases the thin details in
 * these buildings - the window mullions and roof seams. Sizing to the device
 * without rounding up did exactly that and made the sources worse.
 *
 * So: pick enough resolution for the device, then round UP to the next power
 * of two so mipmapping survives.
 */
export function potTextureSize(cssPixels: number): number {
  const needed = cssPixels * Math.min(3, window.devicePixelRatio || 1);
  return 2 ** Math.ceil(Math.log2(Math.max(64, needed)));
}

/** Sources draw at up to `cellSize` (96) CSS pixels. */
export const SOURCE_TEXTURE_PX = potTextureSize(96);

/** The small currency and producer marks. */
export const ICON_TEXTURE_PX = potTextureSize(48);

