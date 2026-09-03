import Phaser from 'phaser';
import { Grid } from '../Grid';
import type { GridCellData, SpawnerCellData } from '../Grid';
import { TileView } from '../objects/TileView';
import { SpawnerView } from '../objects/SpawnerView';
import { SpawnerPieceView, drawSpawnerPieceIcon } from '../objects/SpawnerPieceView';
import { SplitterView, drawSplitterIcon } from '../objects/SplitterView';
import type { GridPosition } from '../types';
import { CHAINS, getTierDef, isCurrencyChain } from '../data/chains';
import { burstParticles, shakeForTier, floatingScore, ensureParticleTexture } from '../fx/MergeFx';
import {
  createDefaultEconomy,
  addCoins,
  addGems,
  spendGems,
  spendCoinsGeneric,
  purchaseGemPack,
  purchaseCoinPack,
  COINS_PER_GEM,
  COINS_PER_ENERGY,
  GEM_PACKS,
  COIN_PACKS,
  formatCountdown
} from '../economy/Economy';
import type { EconomyState } from '../economy/Economy';
import {
  ENERGY_CAP,
  ENERGY_COST_PER_COLLECT,
  ENERGY_REFILL_MS,
  addEnergy,
  canSpendEnergy,
  createDefaultEnergy,
  msUntilEnergyFull,
  msUntilNextEnergy,
  normalizeEnergy,
  energyRefillCost,
  recordEnergyRefillPurchase,
  spendEnergy,
  syncEnergy
} from '../economy/Energy';
import type { EnergyState } from '../economy/Energy';
import {
  createDefaultOrderState,
  normalizeOrderState,
  activeOrders,
  syncOrderSlots,
  orderDisplaySequence,
  orderProgress,
  advanceOrder,
  playerLevel,
  playerXpProgress,
  xpForMergeTier
} from '../levels/Orders';
import type { OrderState, OrderDef, OrderProgressSource } from '../levels/Orders';
import {
  createDefaultShopState,
  normalizeShopState,
  refreshIfDue,
  rerollShopRow,
  markOfferSold,
  msUntilShopRefresh,
  SHOP_SLOTS,
  SHOP_ROW_KEYS,
  REROLL_COST_GEMS,
  coinRerollCost,
  specialRerollCost
} from '../shop/Shop';
import type { ShopState, ShopRowKey } from '../shop/Shop';

/** Height of one shop offer card. Shared by the layout cursor and the card itself. */
const SHOP_SLOT_HEIGHT = 104;
const FINAL_WATER_PAYOUT = 40_000;
import {
  drawBriefcase,
  drawCrate,
  drawSourceBuilding,
  drawTierIcon,
  iconPresentation,
  sourcePalette
} from '../objects/TierIcons';
import { RoomView3D, ROOM_SCOPES, ROOM_PIECES, roomPiecesForStage, type RoomPiece } from '../rooms/RoomView3D';
import { CrateView } from '../objects/CrateView';
import { ResourceProducerView } from '../objects/ResourceProducerView';
import { RESOURCE_PRODUCERS, currencyPayout, expectedProducerCoinValue, rollResourceTier } from '../rewards/ResourceRewards';
import type { ResourceProducerId } from '../rewards/ResourceRewards';
import {
  INVENTORY_GRID,
  INVENTORY_MAX_SLOTS,
  buySlot,
  createDefaultInventory,
  freeSlots,
  isFull,
  normalizeInventory,
  retrieveItem,
  slotCost,
  storeItem
} from '../inventory/Inventory';
import type { InventoryState, StoredItem } from '../inventory/Inventory';
import {
  CRATE_LABELS,
  CRATE_THRESHOLDS,
  METER_MAX,
  addMeterCollect,
  availableCrate,
  claimDaily,
  claimMilestone,
  dailyRewardFor,
  milestoneCrateFor,
  claimMeterCrate,
  finishMeterCooldown,
  isMeterCooling,
  meterCooldownRemaining,
  METER_COOLDOWN_MS,
  createDefaultRewardsState,
  dailyAvailable,
  nextCrateStep,
  normalizeRewardsState,
  pendingMilestones,
  cratePayload,
  rollCrate,
  availableSpawnerPieceFamilies
  ,shippingContainerPayload
} from '../rewards/Rewards';
import type { CrateTier, DailyReward, RewardsState } from '../rewards/Rewards';
import type { CratePayloadEntry } from '../Grid';
import {
  normalizeDispenserState,
  makeDispenser,
  collectDispenser,
  mergeDispenserPair,
  syncDispenser,
  capacityForTier,
  msRemaining,
  refillDispenser,
  rushCostGems,
  MAX_DISPENSER_TIER
} from '../dispensers/Dispensers';
import type { DispenserState } from '../dispensers/Dispensers';
import { Theme, hex, materialLighting, textResolution, toneAt } from '../ui/Theme';
import {
  SUPPLY_CRATES, SUPPLY_CRATE_MIN_LEVEL, type SupplyCrateOffer, supplyCratePrice,
  supplyCrateReady, supplyCooldownRemaining,
  crateReady, crateRemainingMs, formatCrateWait, supplyCrateFor
} from '../shop/SupplyCrates';
import { CURRENCY_COLOR, type CurrencyKind, applyCurrencyIcon, currencyChipOptions, currencyIcon, currencyLabel, currencyPill, drawCurrencyGlyph } from '../ui/CurrencyGlyph';
import { createLockedBoardSeed } from '../LockedBoard';
import {
  claimDiscovery,
  claimedInFamily,
  createDefaultCollectionState,
  discoverItem,
  discoverThrough,
  isClaimed,
  isDiscovered,
  normalizeCollectionState,
  unclaimedDiscoveryCount
} from '../collection/Collection';
import type { CollectionState } from '../collection/Collection';

const COLS = 7;
const ROWS = 9;
const BOARD_TO_TRAY_GAP = 6;
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
const DRAG_START_PX = 14;
/** Cell size the chrome constants below are tuned against. */
const CHROME_BASE_CELL = 54;
const EXPANSION_ROW_ONE = 7;
const EXPANSION_ROW_TWO = 8;
/** Player level the second expansion row opens at - the label quotes this, so the two cannot drift. */
const EXPANSION_ROW_TWO_LEVEL = 50;

const EXPANSION_ROW_ONE_PRICES = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000];
const EXPANSION_ROW_TWO_PRICES = [10_000, 20_000, 40_000, 80_000, 160_000, 320_000, 640_000];
const SAVE_KEY = 'merge-game-save-v1';
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
const UNREADABLE_SAVE_KEY = `${SAVE_KEY}.unreadable`;
const PREVIOUS_SAVE_KEY = `${SAVE_KEY}.prev`;

/** Writes a key without letting a full or blocked localStorage break the game. */
function stashSave(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode and quota-exceeded both land here. A missing backup is bad;
    // a crash on startup because the backup could not be written is worse.
  }
}
const AUTO_MERGE_KEY = 'merge-game-auto-merge';
const TYPE_ID = 'wood';
type BoardView = TileView | SpawnerView | SpawnerPieceView | CrateView | SplitterView | ResourceProducerView;
type ForcedSpawn =
  | { kind: 'item'; typeId: string; tier: number }
  | { kind: 'spawner-piece'; typeId: string; tier: number }
  | { kind: 'spawner'; typeId: string; tier: number }
  | { kind: 'splitter' }
  | { kind: 'resource-producer'; producerId: ResourceProducerId; remaining: number }
  // `readyAt` rides along so a bought crate that has to wait for board space
  // keeps counting down in the vault rather than restarting when it lands.
  | { kind: 'crate'; tier: CrateTier; remaining: CratePayloadEntry[]; source?: string; readyAt?: number };

/**
 * Share of its 1024px art box each currency mark's drawing actually fills.
 *
 * Every currency SVG is the same square, but the art inside is not: the
 * coin's disc reaches 65% of the box, the gem 59%, the bolt 78%. Display size
 * is therefore NOT how tall a mark comes out, which is why equal sizes drew
 * visibly unequal marks in the chips.
 *
 * Measured off the path bounds in `public/currency-*.svg`. Retrace an SVG
 * with different padding and its number here has to be remeasured - this is a
 * property of the art file, not of the shape it draws.
 */
const GLYPH_FILL_RATIO = { coin: 0.649, gem: 0.591, energy: 0.779 } as const;

/** Display size that draws `height` pixels of actual mark. */
function glyphBoxFor(mark: keyof typeof GLYPH_FILL_RATIO, height: number): number {
  return Math.round((height / GLYPH_FILL_RATIO[mark]) * 10) / 10;
}

/**
 * The Fullscreen API, across the shapes phones actually ship.
 *
 * Standard `requestFullscreen` is not enough: Safari on iPad and older
 * Android WebViews only expose the `webkit` names, and asking the standard
 * one there silently does nothing. iPhone Safari has neither - it has never
 * shipped element fullscreen at all - which is why `fullscreenSupported`
 * exists: the settings row says so plainly instead of offering a dead switch.
 */
interface FullscreenDoc extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}
interface FullscreenEl extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

/** The element fullscreen is requested on: the page itself, so nothing is clipped. */
function fullscreenTarget(): FullscreenEl {
  return document.documentElement as FullscreenEl;
}

function fullscreenElement(): Element | null {
  const doc = document as FullscreenDoc;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function fullscreenSupported(): boolean {
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
function toggleFullscreen(): void {
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
interface HudChip {
  text: Phaser.GameObjects.Text;
  /** Width preferred by the current value before responsive compression. */
  naturalWidth: () => number;
  /** Draws with its right edge at `rightX`, constrained to `width`. */
  draw: (rightX: number, width: number) => void;
}
interface ExpansionLockView {
  bg: Phaser.GameObjects.Graphics;
  price: Phaser.GameObjects.Text;
  mark: Phaser.GameObjects.Image;
  zone: Phaser.GameObjects.Zone;
}
type ShopMode = 'full' | 'coin' | 'gem';

const FAMILY_NAMES: Record<string, string> = {
  wood: 'WOOD',
  mineral: 'STONE',
  glass: 'GLASS',
  water: 'WATER',
  'currency-credit': 'CREDITS',
  'currency-energy': 'ENERGY',
  'currency-gem': 'GEMS'
};

function familyTierLabel(typeId: string, tier: number): string {
  return `${FAMILY_NAMES[typeId] ?? typeId.toUpperCase()} ${String(tier).padStart(2, '0')}`;
}

function sourceTierLabel(typeId: string, tier: number): string {
  return `${FAMILY_NAMES[typeId] ?? typeId.toUpperCase()} SOURCE ${String(tier).padStart(2, '0')}`;
}

const SPAWNER_PIECE_NAMES: Record<string, string[]> = {
  wood: ['Cut Timber', 'Joined Beams', 'Timber Frame', 'Roofed Frame'],
  mineral: ['Cut Stone', 'Joined Stone Beams', 'Stone Framework', 'Roofed Stone Frame'],
  glass: ['Glass Panel', 'Joined Panels', 'Glass Framework', 'Roofed Glass Frame'],
  water: ['Pipe Segment', 'Joined Pipes', 'Pump Frame', 'Pump Assembly']
};

function spawnerPieceLabel(typeId: string, tier: number): string {
  return SPAWNER_PIECE_NAMES[typeId]?.[tier - 1]
    ?? `${FAMILY_NAMES[typeId] ?? typeId.toUpperCase()} DISPENSER PIECE ${String(tier).padStart(2, '0')}`;
}

/** Compact only genuinely long HUD values; ordinary four-digit totals stay exact. */
function formatHudValue(value: number): string {
  const amount = Math.max(0, Math.floor(value));
  if (amount < 100_000) return String(amount);
  if (amount < 1_000_000) {
    const scaled = amount / 1_000;
    return `${scaled < 100 && !Number.isInteger(scaled) ? scaled.toFixed(1) : Math.floor(scaled)}K`;
  }
  const scaled = amount / 1_000_000;
  return `${scaled < 100 && !Number.isInteger(scaled) ? scaled.toFixed(1) : Math.floor(scaled)}M`;
}

interface OrderCardView {
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
const ORDER_CARD_GAP = 6;
/**
 * Card body. Only the requirement slots live inside it now - the rewards
 * float above the top edge and the GO chip below the bottom one, the way the
 * reference cards do it. That is what let this drop from 84 without the item
 * slots losing a single pixel.
 */
/** Room photo behind the board. Lives at `public/bg.png`. */
const BG_FILE = 'bg.jpg';
const BG_FALLBACK_FILE = 'minimalist-spa-interior-meditation-space_23-2151935107.avif';
const BG_FALLBACK_KEY = 'bgPhotoFallback';

const ORDER_CARD_H = 68;
/** Crate meter ring, beside the board's top-left corner. */
const CRATE_RING_R = 19;
const CRATE_RING_W = 6;
/**
 * The crate meter's own panel at the left of the order row: ring on the left,
 * its sentence to the right. Fixed width so the cards beside it never reflow
 * as the wording changes.
 */
const CRATE_RING_LANE = 56;
/**
 * What it costs to UNLOCK a stage - not to build it.
 *
 * The furniture inside a stage is bought piece by piece with credits (see
 * `ROOM_PIECES`); this is the gate in front of the stage itself. Splitting the
 * two is what lets the project be a merge goal AND a steady spend: the wood
 * says "produce this", the pieces say "now choose what to buy first".
 */
interface ProjectStage {
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

const PROJECT_STAGES: ProjectStage[] = [
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
const ROOM_ITEM_KEYS = [
  'rug', 'sofa', 'table', 'chair', 'bookcase', 'lamp', 'ceiling',
  'tvunit', 'tv', 'plant', 'side', 'books', 'pillow', 'plantsmall'
] as const;

interface RoomItemDef {
  key: string;
  stage: number;
  label: string;
  /** [x, y, w, h], normalised against the 1024 frame, y measured from the top. */
  rect: [number, number, number, number];
  order: number;
}

const PROJECT_STAGE_NAMES = [
  'UNFINISHED ROOM', 'FINISHED SURFACES', 'MAIN FURNITURE', 'COMFORT & STORAGE', 'COMPLETED LIVING ROOM'
] as const;
/**
 * Header band inside the card: reward on the left, GO on the right, both on
 * one row, with the item slots below. One panel, nothing overhanging - the
 * shape the owner picked out of the references.
 */
const ORDER_HEADER_H = 20;
/**
 * The reward bar sits behind the card: it starts a little below the top and
 * runs well past the tray's top edge, so its lower corners are covered.
 */
const ORDER_BAR_TOP = 4;
const ORDER_BAR_H = ORDER_HEADER_H + 8;
const ORDER_GO_W = 32;
const ORDER_GO_H = 16;
const ORDER_CARD_PAD = 9;
/** Narrow enough that short orders don't waste bar space... */
// Small enough that a one-item order HUGS its slot. At 104 a 46px item sat
// in the middle of a card with dead space either side, which is the single
// biggest reason ours did not read like the reference: there the card is
// barely bigger than the things in it.
const ORDER_CARD_MIN_W = 58;
/** ...wide enough for `ROSEWOOD HEIRLOOM 0/3`, but never so wide one card owns the bar. */
const ORDER_CARD_MAX_W = 212;
/** Matches TileView.snapTo, so a card reordering reads like a board swap. */
const ORDER_REORDER_MS = 140;

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
function potTextureSize(cssPixels: number): number {
  const needed = cssPixels * Math.min(3, window.devicePixelRatio || 1);
  return 2 ** Math.ceil(Math.log2(Math.max(64, needed)));
}

/** Sources draw at up to `cellSize` (96) CSS pixels. */
const SOURCE_TEXTURE_PX = potTextureSize(96);

/** The small currency and producer marks. */
const ICON_TEXTURE_PX = potTextureSize(48);

export class BoardScene extends Phaser.Scene {
  private grid = new Grid(COLS, ROWS);
  private views = new Map<string, BoardView>(); // key = `${col},${row}`
  private cellSize = 0;
  private boardOriginX = 0;
  private boardOriginY = 0;
  private contentTop = 0;
  private boardExpansionUnlocked = new Set<string>();
  private expansionLockViews = new Map<string, ExpansionLockView>();
  private expansionRowLabels: Phaser.GameObjects.Text[] = [];

  private levelBadgeText!: Phaser.GameObjects.Text;
  /**
   * Level the badge is currently showing, so a rise can be spotted wherever
   * it comes from. 0 means "not drawn yet": the first paint after a load must
   * not celebrate the level the player already had.
   */
  private levelBadgeShownLevel = 0;
  private levelXpRing!: Phaser.GameObjects.Graphics;
  private levelKeystone!: Phaser.GameObjects.Graphics;
  private levelMilestoneDot!: Phaser.GameObjects.Graphics;
  private levelMilestoneCount!: Phaser.GameObjects.Text;

  private economy: EconomyState = createDefaultEconomy();
  private coinText!: Phaser.GameObjects.Text;
  private gemText!: Phaser.GameObjects.Text;
  private energyText!: Phaser.GameObjects.Text;
  private energy: EnergyState = createDefaultEnergy();

  private orderState: OrderState = createDefaultOrderState();
  private orderCards: OrderCardView[] = [];
  private orderBarContainer: Phaser.GameObjects.Container | null = null;
  private orderBarMaskShape: Phaser.GameObjects.Graphics | null = null;
  private orderScrollHint: Phaser.GameObjects.Graphics | null = null;
  private orderScroll = 0;
  private orderScrollMax = 0;
  /**
   * Card position -> queue slot. Completable orders are shown first, so the
   * card the player taps is NOT necessarily the queue slot of the same
   * number; every tap goes through this map.
   */
  private orderDisplayOrder: number[] = [];
  /** Ready orders at the last refresh, to detect one becoming completable. */
  private orderReadyCount = 0;
  private orderScrollTween: Phaser.Tweens.Tween | null = null;
  /** The draggability nudge is shown once per session, on first overflow. */
  private orderPeekShown = false;
  /** In-progress horizontal flick of the order bar; `slot` is where it began. */
  private orderDrag: {
    active: boolean;
    slot: number;
    startX: number;
    startScroll: number;
    moved: number;
    /** Set when the press landed on a requirement icon rather than the card. */
    describe: { typeId: string; tier: number } | null;
  } =
    { active: false, slot: -1, startX: 0, startScroll: 0, moved: 0, describe: null };
  private dispenserCollectCount = 0;
  private headerRight = 0;
  /** Where a board drag began, to tell a tap from a move that returned home. */
  private dragStartPointer = { x: 0, y: 0 };
  private overInventory = false;
  private hudChips: HudChip[] = [];
  private rewards: RewardsState = createDefaultRewardsState();
  private crateMeterBar!: Phaser.GameObjects.Graphics;
  private crateMeterProgress!: Phaser.GameObjects.Graphics;
  private crateMeterIcon!: Phaser.GameObjects.Graphics;
  private crateMeterContainer!: Phaser.GameObjects.Container;
  private crateMeterZone!: Phaser.GameObjects.Zone;
  private crateMeterRuns: Phaser.GameObjects.Text[] = [];
  private crateMeterPulse?: Phaser.Tweens.Tween;
  private crateMeterWasCooling = false;
  private crateMeterSecond = -1;
  /** Highest stage the player has unlocked; its pieces are the buyable ones. */
  /**
   * Space between the board's bottom edge and the tray rail.
   *
   * Computed rather than constant: the tray is anchored to the bottom of the
   * screen and the board is centred above it, so on a tall phone this is
   * whatever is left over. `BOARD_TO_TRAY_GAP` is its floor, for screens with
   * nothing to spare.
   */
  private boardToTrayGap = BOARD_TO_TRAY_GAP;
  /**
   * How much bigger the chrome is than its tuned size.
   *
   * Cells grow with screen WIDTH while the order cards and reserves were
   * fixed pixels, so a big phone got a big board surrounded by small UI and
   * an ever-larger dead band. This ties the chrome to the same unit the board
   * uses. Never below 1: the constants are tuned for a ~54px cell, and a
   * small phone should keep exactly the layout it has today.
   */
  private chromeScale = 1;
  /** Fullscreen-only HUD scale, derived from the extra vertical room. */
  private hudScale = 1;
  /**
   * Redraws the open project panel's footer, or null when it is closed.
   *
   * A stage reward is granted a tick AFTER the purchase that earns it, so the
   * footer the purchase redrew still showed the reward as pending. Handing the
   * renderer out lets the reward path refresh the panel it is standing on.
   */
  private projectFooterRefresh: (() => void) | null = null;
  private projectStage = 0;
  /** Keys of every room piece bought so far. Drives what the 3D room shows. */
  private builtPieces = new Set<string>();
  /** The 3D room, alive only while the project panel is open. */
  private roomView: RoomView3D | null = null;
  /** Board objects hidden so the full-screen room can show behind the UI. */
  private roomHiddenForPanel: Phaser.GameObjects.GameObject[] = [];
  /** True while the full-screen room owns the display. */
  private roomPanelOpen = false;
  /** Epoch ms before which no further supply crate may be bought. */
  private supplyCooldownUntil = 0;
  private projectOverlay: Phaser.GameObjects.Container | null = null;
  private projectButtonBg!: Phaser.GameObjects.Graphics;
  private projectButtonIcon!: Phaser.GameObjects.Graphics;
  private projectButtonZone!: Phaser.GameObjects.Zone;
  private projectBadge!: Phaser.GameObjects.Graphics;
  /** Per-colour segments of the meter label, rebuilt on every refresh. */
  private inventory: InventoryState = createDefaultInventory();
  private collection: CollectionState = createDefaultCollectionState();
  private collectionOverlay: Phaser.GameObjects.Container | null = null;
  private mainCollectionBadge!: Phaser.GameObjects.Text;
  private mainCollectionPanel!: Phaser.GameObjects.Graphics;
  private invBg!: Phaser.GameObjects.Graphics;
  private invLabel!: Phaser.GameObjects.Text;
  private invIcon!: Phaser.GameObjects.Graphics;
  private invZone!: Phaser.GameObjects.Zone;
  /** Infinite, automatic LIFO holding area for rewards that require a board cell. */
  private forcedSpawnVault: ForcedSpawn[] = [];
  private vaultBg!: Phaser.GameObjects.Graphics;
  private vaultIcon!: Phaser.GameObjects.Graphics;
  private vaultCountDot!: Phaser.GameObjects.Graphics;
  private vaultCount!: Phaser.GameObjects.Text;
  private vaultDeliveryPending = false;
  private vaultInboundPending = 0;

  private shopState: ShopState = createDefaultShopState();
  private shopOverlay: Phaser.GameObjects.Container | null = null;
  private shopMode: ShopMode = 'full';
  private shopCountdownUpdater: (() => void) | null = null;
  /** Tears down the shop's scroll mask and input listeners. Set while the shop is open. */
  private shopScrollCleanup: (() => void) | null = null;
  private energyMenuUpdater: (() => void) | null = null;
  /**
   * Transient one-line feedback shown inside the shop panel. Needed once
   * buying stopped closing the shop: a failed buy (board full, can't
   * afford) used to be masked by the panel disappearing, and would
   * otherwise now look like the tap did nothing at all.
   */
  private shopNotice: { text: string; error: boolean } | null = null;

  private draggingView: BoardView | null = null;
  /**
   * Whether the pending press has crossed `DRAG_START_PX` and become a drag.
   *
   * `draggingView` is set on press so the release path can still resolve the
   * piece under the finger; this says whether the piece has actually been
   * picked up.
   */
  private dragActive = false;
  private dragFromCell: GridPosition | null = null;
  private mergeReadyTarget: BoardView | null = null;
  private selectedItemKey: string | null = null;
  private lastCurrencyTap: { key: string; at: number } | null = null;
  // Board cell of the source most recently tapped. Its tray stays consistent
  // across ready/recharging states; when empty, the same panel also offers
  // the gem refill action.
  private rushTargetKey: string | null = null;
  private actionBg!: Phaser.GameObjects.Graphics;
  private actionText!: Phaser.GameObjects.Text;
  private orderRewardTexts: Phaser.GameObjects.GameObject[] = [];
  private sellButtonBg!: Phaser.GameObjects.Graphics;
  private sellButton!: Phaser.GameObjects.Text;
  private sellButtonAmount!: Phaser.GameObjects.Text;
  private sellButtonZone!: Phaser.GameObjects.Zone;
  /** The currency mark on the sell/refill button's second line. */
  private sellButtonMark!: Phaser.GameObjects.Image;
  /** Right edge the sell/refill button and its mark align against. */
  private sellButtonRightX = 0;
  /**
   * Fixed vertical centre for the sell/refill chip.
   *
   * Read from a LAYOUT constant, never from the label's own y. Deriving it
   * from `sellButton.y` meant every call read a position the previous call
   * had already shifted up by half a line, so the chip walked up the screen
   * one click at a time.
   */
  private sellButtonCenterY = 0;
  private inputLocked = false;
  private modalOpen = false;
  private autoMergeEnabled = localStorage.getItem(AUTO_MERGE_KEY) === 'true';
  private autoMergeText!: Phaser.GameObjects.Text;
  private autoDispenserCursor = 0;
  private nextAutoDispenserAt = 0;
  private deadlockOverlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('BoardScene');
  }

  preload(): void {
    // Real background photo, not a procedural illustration - loaded once;
    // `scene.restart()` on viewport resize re-enters preload() each time,
    // and Phaser's loader is a no-op for a key already in the texture cache.
    if (!this.textures.exists('bgPhoto')) {
      // Prefers `public/background.png`, falling back to the original spa
      // photo when that file is not present. The fallback exists so the game
      // never boots with no background if the art is missing or renamed;
      // delete this handler once the new file is permanent.
      this.load.once(`filecomplete-image-${BG_FALLBACK_KEY}`, () => undefined);
      this.load.on('loaderror', (file: Phaser.Loader.File) => {
        if (file.key !== 'bgPhoto' || this.textures.exists(BG_FALLBACK_KEY)) return;
        this.load.image('bgPhoto', BG_FALLBACK_FILE);
        this.load.start();
      });
      this.load.image('bgPhoto', BG_FILE);
    }
    // Test asset: a real Blender-rendered, beveled button panel (single
    // upper-left key light, matching materialLighting's convention) instead
    // of a live-drawn Graphics rect - see the SHOP button in create().
    if (!this.textures.exists('uiButtonTest')) {
      this.load.image('uiButtonTest', 'ui-button-test.png');
    }
    const iconPx = { width: ICON_TEXTURE_PX * 2, height: ICON_TEXTURE_PX * 2 };
    const markPx = { width: ICON_TEXTURE_PX, height: ICON_TEXTURE_PX };

    /**
     * Loads a texture ONCE, however many times the scene restarts.
     *
     * `scene.restart()` re-enters preload on every viewport change, and an
     * unguarded load re-rasterises its SVG into a brand new canvas each time.
     * The art here is heavy - a megabyte-plus of paths per file - so a handful
     * of resizes was enough for the browser to start refusing new canvases,
     * and a refused canvas has a NULL 2d context: the loader then threw on
     * `ctx.drawImage` in the middle of create(), after the HUD was drawn but
     * before input was wired. That is the black/frozen game with a stale frame
     * still on screen, and it took a resize to trigger, never a first load.
     */
    const svgOnce = (key: string, file: string, size: { width: number; height: number }): void => {
      if (!this.textures.exists(key)) this.load.svg(key, file, size);
    };
    const imageOnce = (key: string, file: string): void => {
      if (!this.textures.exists(key)) this.load.image(key, file);
    };

    svgOnce('energy-basket', 'energy-basket.svg', iconPx);
    svgOnce('producer-coin-pouch', 'coin-pouch.svg', iconPx);
    svgOnce('producer-coin-basket', 'coin-basket.svg', iconPx);
    svgOnce('producer-energy-basket', 'energy-basket.svg', iconPx);
    svgOnce('producer-gem-basket', 'gem-basket.svg', iconPx);
    // Living room project art. The shell is one full 1024-square frame; every
    // furniture piece is its own sprite, border-rendered and cropped to just
    // its own screen rect, with the shell acting as a shadow catcher so each
    // one carries its own contact shadow. `living.json` holds each piece's
    // rect, its stage, and its back-to-front draw order.
    if (!this.cache.json.exists('room-living-manifest')) {
      this.load.json('room-living-manifest', 'rooms/living.json');
    }
    imageOnce('room-shell', 'rooms/shell.png');
    imageOnce('room-shell-raw', 'rooms/shell-raw.png');
    for (const key of ROOM_ITEM_KEYS) {
      imageOnce(`room-item-${key}`, `rooms/item-${key}.png`);
    }
    // The project button's house mark. Loaded at the source texture size
    // rather than the mark size: it draws larger than a currency glyph, and
    // `potTextureSize` keeps it power-of-two so mipmaps stay on.
    svgOnce('home-icon', 'home-icon.svg', { width: SOURCE_TEXTURE_PX, height: SOURCE_TEXTURE_PX });
    svgOnce('currency-coin', 'currency-coin.svg', markPx);
    svgOnce('currency-gem', 'currency-gem.svg', markPx);
    svgOnce('currency-energy', 'currency-energy.svg', markPx);
    for (let tier = 1; tier <= 4; tier++) {
      const textureKey = `source-wood-${tier}`;
      if (!this.textures.exists(textureKey)) {
        this.load.svg(textureKey, `wood-source0${tier}.svg`, { width: SOURCE_TEXTURE_PX, height: SOURCE_TEXTURE_PX });
      }
    }
    for (let tier = 1; tier <= 4; tier++) {
      const textureKey = `source-glass-${tier}`;
      if (!this.textures.exists(textureKey)) {
        this.load.svg(textureKey, `glass-source0${tier}.svg`, { width: SOURCE_TEXTURE_PX, height: SOURCE_TEXTURE_PX });
      }
    }
    for (let tier = 1; tier <= 5; tier++) {
      const textureKey = `source-mineral-${tier}`;
      if (!this.textures.exists(textureKey)) {
        this.load.svg(textureKey, `stone-source0${tier}.svg`, { width: SOURCE_TEXTURE_PX, height: SOURCE_TEXTURE_PX });
      }
    }
  }

  create(): void {
    // Phaser keeps the Scene instance when `scene.restart()` is used after a
    // viewport resize. Clear references to display objects that shutdown just
    // destroyed before rebuilding the responsive layout.
    this.views.clear();
    this.expansionLockViews.clear();
    this.expansionRowLabels = [];
    this.shopOverlay = null;
    this.collectionOverlay = null;
    // Points at a closure over the previous scene's objects.
    this.projectFooterRefresh = null;
    // A DOM sibling of the game canvas, so a scene teardown does not remove it.
    this.roomView?.dispose();
    this.roomView = null;
    this.roomHiddenForPanel = [];
    this.projectOverlay = null;
    this.shopCountdownUpdater = null;
    this.energyMenuUpdater = null;
    this.deadlockOverlay = null;
    this.orderCards = [];
    this.draggingView = null;
    this.dragActive = false;
    this.dragFromCell = null;
    this.mergeReadyTarget = null;
    this.inputLocked = false;
    this.modalOpen = false;
    this.selectedItemKey = null;
    this.rushTargetKey = null;
    this.orderRewardTexts = [];

    ensureParticleTexture(this);
    this.drawSceneBackground();
    this.computeLayout();
    this.drawBoardBackground();

    // The HUD row is right-anchored: the level badge hangs off the left edge
    // and everything else works leftward from the shop button. It used to be
    // laid out with fixed offsets from the left, so as soon as the board
    // narrowed the energy chip ran underneath the shop button.
    const headerX = this.boardOriginX;
    const headerRight = this.boardOriginX + COLS * this.cellSize;
    this.headerRight = headerRight;
    const rowY = this.contentTop + 18 * this.hudScale;
    // Where the header band ends. There is no longer a rule drawn on it - the
    // line is gone - but the currency chips still hang off this baseline.
    const ruleY = this.contentTop + 42 * this.hudScale;
    // Chips sit just ABOVE that rule instead of level with the badge and the
    // shop button. A phone's camera cut-out is centred in the status bar,
    // which is exactly where the chips used to sit; dropping them to the
    // bottom of the header band clears it.
    const chipTopY = ruleY - 18;
    // The chips' lower edge. Everything else in the row hangs off it rather
    // than sharing a centre line, because the badge, the gear and the shop
    // button are three different sizes and a common centre left their bottoms
    // ragged. Each offset below is that widget's own drawn half-height, not
    // half its box: the badge carries its XP ring 18px under its centre, and
    // the shop button a drop shadow 20px under its own - and the shop button's
    // container is scaled, so its offset scales with it.
    const chipBottomY = chipTopY + 16;

    this.levelBadgeText = this.buildLevelBadge(headerX + 18 * this.hudScale, chipBottomY - 18);

    // Currency chips: a bordered badge with a small drawn glyph + the
    // number, instead of bare colored text floating on the backdrop -
    // stolen from how every reference merge game shows its currencies as
    // distinct icon+number chips, not plain HUD text.
    // Energy belongs in the same compact resource row as coins and gems.
    // The previous second-row strip read as a progress bar and pushed the
    // board downward, unlike the reference merge-game HUDs.
    const coinChip = this.buildCurrencyChip(chipTopY, Theme.currencyCredit, 'coin', () => {
      this.shopNotice = null;
      this.openShop('coin');
    });
    this.coinText = coinChip.text;
    const gemChip = this.buildCurrencyChip(chipTopY, Theme.currencyGem, 'gem', () => {
      this.shopNotice = null;
      this.openShop('gem');
    });
    this.gemText = gemChip.text;
    const energyChip = this.buildEnergyChip(chipTopY);
    this.energyText = energyChip.text;
    // Right-to-left from the shop button: energy nearest it, then gems, then
    // credits, which is the widest and so gets the most room to grow into.
    this.hudChips = [energyChip, gemChip, coinChip];
    this.layoutHudChips();

    // Opening from the cart starts clean; only an in-panel action (buy,
    // reroll, pack) carries a notice through via reopenShop.
    // 18, not 20: the offset is the DISC's radius, not the disc plus its drop
    // shadow. Allowing for the shadow left the button itself sitting two
    // pixels proud of the chips.
    this.buildShopIconButton(headerRight - 18 * this.hudScale, chipBottomY - 18 * this.chromeScale, () => {
      this.shopNotice = null;
      this.openShop('full');
    });

    // RESET is a dev-only utility, not part of the real game's HUD - kept
    // fully isolated (absolute screen position, own tiny call) so it can be
    // deleted in one line without touching any other header element's math.
    this.buildSettingsButton();
    this.buildDevResetButton();
    this.buildAutoMergeButton();
    this.time.addEvent({ delay: 240, loop: true, callback: () => void this.runAutoMergeStep() });

    this.buildCrateMeter();
    this.buildInventoryButton();
    this.buildForcedSpawnVault();

    this.buildOrderBar();
    // BEFORE anything that can refresh it: `checkDeadlock` below refreshes the
    // tray, and after a restart its fields still point at the previous scene's
    // destroyed Text objects - live enough to pass an optional chain, dead
    // enough to throw inside Phaser. That killed create() half way through, so
    // the HUD drew but input was never wired.
    this.buildActionTray();

    this.loadOrSeed();
    this.buildBoardExpansionLocks();
    this.refreshForcedSpawnVault();
    this.tryReleaseVaultItem();
    this.tryDeliverMeterGold();
    this.refreshCrateMeter();
    this.refreshInventoryButton();
    this.refreshOrderBar();
    this.checkDeadlock();
    this.updateCurrencyText();

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    const autoLevelRewards = this.autoDeliverLevelRewards();
    const readyRewards = dailyAvailable(this.rewards, Date.now()) ? 1 : 0;
    this.refreshActionTray(readyRewards > 0
      ? `${readyRewards} REWARD${readyRewards === 1 ? '' : 'S'} READY\nTAP THE LEVEL BADGE TO CLAIM`
      : autoLevelRewards.length > 0
        ? `${autoLevelRewards.length} LEVEL REWARD${autoLevelRewards.length === 1 ? '' : 'S'} DELIVERED`
        : undefined);

    // On-board sources retain their charge timers while the player is away.
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        this.releaseWaterSourceItems();
        // Cheap insurance: refreshers run on their own schedules and several
        // set visibility unconditionally. Re-assert the hide rather than
        // hunting each one down.
        if (this.roomPanelOpen) {
          for (const obj of this.roomHiddenForPanel) {
            (obj as Phaser.GameObjects.GameObject & { visible?: boolean }).visible = false;
          }
        }
        this.refreshCrateWaits();
        for (const view of this.views.values()) {
          if (view instanceof SpawnerView) view.refresh();
        }
        // Energy accrues on the same 1s tick so its countdown stays live and
        // offline refills land as soon as the scene is back.
        this.updateEnergyText();
        // Keep the tray's rush countdown/cost ticking while it's showing one.
        if (this.rushTargetKey) this.refreshActionTray();
      }
    });

    // Rebuild the responsive layout when the viewport changes (rotation, the
    // Android keyboard, a desktop window drag). This is deliberately NOT a
    // `scale.once(...)` + immediate `scene.restart()`:
    //
    //  - `once` fires on the FIRST resize event only, and its replacement is
    //    re-registered at the end of the next `create()`. A real resize emits
    //    a burst of events, so any that landed while the scene was tearing
    //    down and rebuilding were dropped - leaving the scene laid out for a
    //    stale size while the canvas had already resized.
    //  - Restarting mid-burst also tore down the WebGL render targets while
    //    the canvas was still settling, which surfaced as
    //    "Framebuffer status: Incomplete Attachment" and a black screen.
    //
    // Instead: listen with `on`, debounce until the burst goes quiet, then
    // restart once against the final size. Degenerate sizes (a backgrounded
    // or not-yet-composited canvas, common during a Capacitor splash
    // transition) are skipped rather than rebuilt against 0x0.
    let resizeDebounce: Phaser.Time.TimerEvent | null = null;
    let lastW = this.scale.width;
    let lastH = this.scale.height;
    // Set by the fullscreen handler: a mode change must rebuild even when the
    // viewport lands within the noise threshold below.
    let forceRebuild = false;
    // Latched once a rebuild is committed. `scene.restart()` does not tear the
    // scene down synchronously, so a second restart queued behind the first
    // used to re-enter create() while the first was still placing pieces off
    // the save - which is how the locked board items vanished on entering
    // fullscreen and stayed gone until a page reload. The save was never
    // wrong; the half-built grid was.
    let rebuilding = false;
    const onViewportResize = () => {
      if (rebuilding) return;
      resizeDebounce?.remove();
      resizeDebounce = this.time.delayedCall(160, () => {
        resizeDebounce = null;
        const w = this.scale.width;
        const h = this.scale.height;
        if (w < 2 || h < 2) return; // canvas not composited yet - nothing safe to lay out against
        const changed = Math.abs(w - lastW) >= 2 || Math.abs(h - lastH) >= 2;
        if (!changed && !forceRebuild) return; // no meaningful change
        lastW = w;
        lastH = h;
        forceRebuild = false;
        rebuilding = true;
        this.scene.restart();
      });
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, onViewportResize);

    // Watches the CANVAS ITSELF, because Phaser's own resize handling is
    // driven by the window `resize` event and that is not the only way the
    // canvas changes size. A device-emulated viewport, a phone's browser bar
    // collapsing, an element going fullscreen - all resize the element while
    // the scene keeps the size it booted with, and the game then draws into
    // the top-left corner of a canvas that is now larger, leaving dead strips
    // down the right and along the bottom.
    //
    // `scale.resize` is what actually re-sizes the game to the element; the
    // restart then rebuilds the layout for it.
    const canvasBox = this.game.canvas.parentElement ?? this.game.canvas;
    const observer = new ResizeObserver(() => {
      const rect = canvasBox.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w < 2 || h < 2) return;
      if (Math.abs(w - this.scale.width) < 2 && Math.abs(h - this.scale.height) < 2) return;
      this.scale.resize(w, h);
      onViewportResize();
    });
    observer.observe(canvasBox);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => observer.disconnect());

    // The same check once, a beat after boot: the element can settle to its
    // real size between the game being constructed and the scene being ready,
    // which fires no event this scene was alive to hear.
    this.time.delayedCall(120, () => {
      const rect = canvasBox.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w < 2 || h < 2) return;
      if (Math.abs(w - this.scale.width) < 2 && Math.abs(h - this.scale.height) < 2) return;
      this.scale.resize(w, h);
      this.scene.restart();
    });

    // Entering or leaving fullscreen moves the canvas in the page as well as
    // resizing it. `refresh()` makes the scale manager re-read that geometry;
    // without it Phaser keeps hit-testing pointers against the canvas's old
    // position, so taps land somewhere other than where they were made. The
    // resize listener above cannot cover this: it fires on the same burst,
    // but its own 160ms debounce means input is wrong for those 160ms, and if
    // the viewport happens to land within 2px of its old size it never
    // rebuilds at all.
    const onFullscreenChange = () => {
      // `refresh()` makes the scale manager re-read the canvas geometry, which
      // a fullscreen transition changes as well as the size; without it Phaser
      // keeps hit-testing pointers against the old position.
      this.scale.refresh();
      // Rebuild through the SAME debounced path as any other resize rather
      // than restarting on a timer of its own. Entering fullscreen fires this
      // handler, Phaser's RESIZE event and the canvas ResizeObserver within a
      // few frames of each other, and three independent restarts is what left
      // the board half built.
      forceRebuild = true;
      onViewportResize();
    };
    this.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, onFullscreenChange);
    this.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, onFullscreenChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, onViewportResize);
      this.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, onFullscreenChange);
      this.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, onFullscreenChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      resizeDebounce?.remove();
      resizeDebounce = null;
    });
  }

  /**
   * The real background photo (loaded in `preload()`), cover-scaled and
   * centered behind the whole scene. Replaced two earlier procedural
   * attempts (a technical grid, then an illustrated room) - the user
   * explicitly wants this specific photo, not a vector interpretation of it.
   */
  private drawSceneBackground(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const img = this.add.image(w / 2, h / 2, 'bgPhoto').setDepth(-100);
    // Overscanned. Cover-scaling to the exact viewport left the photo short of
    // the bottom edge whenever the canvas grew after the scene was laid out.
    const scale = Math.max(w / img.width, h / img.height) * 1.15;
    img.setScale(scale);
    // Slight dim so foreground UI/tiles stay readable over whatever the
    // photo's brightest areas are.
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.2).setDepth(-99);
  }

  private computeLayout(): void {
    // 1.2%, floor 4: at 3.5% with a 12px floor a 390px phone spent 28px on
    // side margins, and since the board is width-limited on a phone - nine
    // rows fit the height easily, seven columns do not fit the width - every
    // one of those pixels came straight off the cell size. The board is meant
    // to reach for the screen edges; the HUD row above it keeps its own
    // insets, so nothing lands under a rounded corner.
    const margin = Phaser.Math.Clamp(Math.round(this.scale.width * 0.012), 4, 10);
    // Header row, then the order cards with their GO chips above them. The
    // crate ring shares the cards' row now, so it costs no height of its own.
    // The order row is lifted 10px below, leaving four pixels between its
    // 68px cards and the board pane while reclaiming that height for cells.
    // The inventory/vault rail and 66px information tray end roughly 82px
    // below the board. The old 116px reserve left unused space underneath;
    // reclaim it for the two additional board rows.
    const trayReserve = 74;
    const trayGap = 0;
    const outerReserve = 4;
    const availW = this.scale.width - margin * 2;

    // TWO passes, because the two sizes depend on each other: the chrome
    // scales off the cell, and the cell has to fit in what the chrome leaves.
    // Pass one sizes the cell against the untouched reserve, which fixes the
    // chrome scale; pass two re-fits the cell inside the scaled reserve, and
    // only ever shrinks it - on a phone the board is width-limited, so this
    // changes nothing there.
    const widthCellSize = Math.floor(Math.min(96, availW / COLS));
    const cellFor = (header: number): number => Math.max(38, Math.min(
      widthCellSize,
      Math.floor((this.scale.height - header - trayReserve - trayGap - outerReserve) / ROWS)
    ));
    const isFullscreen = !!fullscreenElement();
    const extraPortraitRoom = Math.max(0, this.scale.height - this.scale.width * 1.72);
    this.hudScale = isFullscreen
      ? Phaser.Math.Clamp(1 + extraPortraitRoom / Math.max(1, this.scale.height), 1.12, 1.2)
      : 1;
    this.chromeScale = Phaser.Math.Clamp(
      Math.max(cellFor(124) / CHROME_BASE_CELL, this.hudScale),
      1,
      1.5
    );
    const headerReserve = Math.round(124 * this.chromeScale);
    this.cellSize = cellFor(headerReserve);
    const contentH = headerReserve + ROWS * this.cellSize + trayGap + trayReserve;
    this.boardOriginX = Math.floor((this.scale.width - COLS * this.cellSize) / 2);

    // Anchored, not centred as one block.
    //
    // A seven-column board is WIDTH-limited on a phone - nine rows fit the
    // height with room to spare - so on a 20:9 screen the block came out
    // several hundred pixels shorter than the viewport, and centring split
    // that leftover evenly above and below. The half below the tray read as a
    // black bar along the bottom of the phone, because nothing is drawn there.
    //
    // Instead: the header sits near the top, the tray is pinned to the bottom,
    // and the board is centred in the band between them. The same pixels are
    // still spare, but they become breathing room around the board rather than
    // a dead strip at one end.
    this.contentTop = Phaser.Math.Clamp(
      Math.floor((this.scale.height - contentH) / 2), 10, 28
    );
    const headerBottom = this.contentTop + headerReserve;
    const trayTop = this.scale.height - outerReserve - trayReserve;
    const band = trayTop - headerBottom;
    // `max(0, ...)` for short screens, where the band is smaller than the
    // board: there the board keeps its old position directly under the header
    // and the gap falls back to its floor, exactly as before.
    this.boardOriginY = headerBottom + Math.max(0, Math.floor((band - ROWS * this.cellSize) / 2));
    // The rail and the information tray belong to the BOARD, not to the screen
    // edge. Letting the gap absorb all the leftover height pushed them to the
    // bottom of the phone with a canyon between them and the last row, so the
    // readout for the piece you just tapped was nowhere near the piece.
    this.boardToTrayGap = Phaser.Math.Clamp(
      trayTop - (this.boardOriginY + ROWS * this.cellSize), BOARD_TO_TRAY_GAP, 12
    );
  }

  /**
   * The board as a pane of glass sitting in the room, not an opaque panel -
   * translucent fill so the wall/floor behind it shows through faintly, a
   * soft diagonal reflection streak, and a bright rim on the lit (upper-
   * left) edge fading to a dim one on the shadowed edge, matching the same
   * fixed light source every tile uses. Grid lines are thin pale etched
   * lines rather than dark rules, to read as cut into glass.
   */
  private drawBoardBackground(): void {
    // Hugs the grid. At 8px of padding the pane sat wider than the order bar
    // and the tray above and below it, which are both exactly the grid's
    // width - so the one element that framed everything else was also the one
    // that did not line up with it.
    const pad = 2;
    const x0 = this.boardOriginX - pad;
    const y0 = this.boardOriginY - pad;
    const bw = COLS * this.cellSize + pad * 2;
    const bh = ROWS * this.cellSize + pad * 2;

    const g = this.add.graphics();

    // Translucent glass body - lets the room show through faintly instead
    // of hiding it behind an opaque panel.
    g.fillStyle(0x181613, 0.9);
    g.fillRoundedRect(x0, y0, bw, bh, Theme.radiusPanel);

    // Diagonal reflection streak, the single clearest "this is glass" cue.
    // Points stay a few px inset from the panel edges so the streak doesn't
    // poke past the rounded corners (simpler than masking for a radius this
    // small, and avoids Graphics API pitfalls with save/restore, which
    // Phaser's Graphics doesn't have - only the canvas 2D context does).
    const inset = Theme.radiusPanel + 2;
    g.fillStyle(0xffffff, 0.018);
    g.beginPath();
    g.moveTo(x0 + bw * 0.08, y0 + inset * 0.3);
    g.lineTo(x0 + bw * 0.28, y0 + inset * 0.3);
    g.lineTo(x0 + inset * 0.3, y0 + bh * 0.5);
    g.lineTo(x0 + inset * 0.3, y0 + bh * 0.28);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xffffff, 0.024);
    g.beginPath();
    g.moveTo(x0 + bw * 0.34, y0 + inset * 0.3);
    g.lineTo(x0 + bw * 0.5, y0 + inset * 0.3);
    g.lineTo(x0 + inset * 0.3, y0 + bh * 0.72);
    g.lineTo(x0 + inset * 0.3, y0 + bh * 0.52);
    g.closePath();
    g.fillPath();

    // Rim - bright on the lit upper-left edge, dim on the shadowed
    // lower-right edge, same convention as materialLighting.
    g.lineStyle(Theme.borderWidth, 0xf4f0e8, 0.5);
    g.beginPath();
    g.moveTo(x0, y0 + bh * 0.4);
    g.lineTo(x0, y0);
    g.lineTo(x0 + bw * 0.4, y0);
    g.strokePath();
    g.lineStyle(Theme.borderWidth, Theme.borderOnDark, 0.9);
    g.beginPath();
    g.moveTo(x0 + bw, y0 + bh * 0.4);
    g.lineTo(x0 + bw, y0 + bh);
    g.lineTo(x0 + bw * 0.4, y0 + bh);
    g.strokePath();
    g.lineStyle(1, Theme.borderOnDark, 0.5);
    g.strokeRoundedRect(x0, y0, bw, bh, Theme.radiusPanel);

    // Etched grid - thin pale lines, not dark rules.
    g.lineStyle(1, 0xf4f0e8, 0.11);
    for (let c = 1; c < COLS; c++) {
      const x = this.boardOriginX + c * this.cellSize;
      g.lineBetween(x, this.boardOriginY, x, this.boardOriginY + ROWS * this.cellSize);
    }
    for (let r = 1; r < ROWS; r++) {
      const y = this.boardOriginY + r * this.cellSize;
      g.lineBetween(this.boardOriginX, y, this.boardOriginX + COLS * this.cellSize, y);
    }
  }

  private cellToWorld(pos: GridPosition): { x: number; y: number } {
    return {
      x: this.boardOriginX + pos.col * this.cellSize + this.cellSize / 2,
      y: this.boardOriginY + pos.row * this.cellSize + this.cellSize / 2
    };
  }

  private worldToCell(x: number, y: number): GridPosition | null {
    const col = Math.floor((x - this.boardOriginX) / this.cellSize);
    const row = Math.floor((y - this.boardOriginY) / this.cellSize);
    const pos = { col, row };
    return this.grid.inBounds(pos) ? pos : null;
  }

  private keyOf(pos: GridPosition): string {
    return `${pos.col},${pos.row}`;
  }

  private expansionPrice(pos: GridPosition): number {
    return pos.row === EXPANSION_ROW_ONE
      ? EXPANSION_ROW_ONE_PRICES[pos.col]
      : EXPANSION_ROW_TWO_PRICES[pos.col];
  }

  private expansionRowEligible(row: number): boolean {
    if (row === EXPANSION_ROW_ONE) {
      return !this.grid.serialize().some((cells) => cells.some((cell) => cell?.kind === 'locked-item'));
    }
    return row === EXPANSION_ROW_TWO
      && this.firstExpansionRowComplete()
      && playerLevel(this.orderState) >= EXPANSION_ROW_TWO_LEVEL;
  }

  private firstExpansionRowComplete(): boolean {
    return EXPANSION_ROW_ONE_PRICES.every((_, col) => !this.grid.isBlocked({ col, row: EXPANSION_ROW_ONE }));
  }

  /** Applies saved expansion purchases as real unavailable grid cells. */
  private applyBoardExpansionLocks(savedCells?: (GridCellData | null)[][]): void {
    for (const row of [EXPANSION_ROW_ONE, EXPANSION_ROW_TWO]) {
      for (let col = 0; col < COLS; col++) {
        const pos = { col, row };
        const key = this.keyOf(pos);
        // A short-lived nine-row development save may already contain an
        // owned object here from before row locking existed. Preserve it and
        // treat that particular cell as purchased rather than deleting it.
        if (savedCells?.[row]?.[col]) this.boardExpansionUnlocked.add(key);
        if (!this.boardExpansionUnlocked.has(key)) this.grid.block(pos);
      }
    }
  }

  private buildBoardExpansionLocks(): void {
    for (const row of [EXPANSION_ROW_ONE, EXPANSION_ROW_TWO]) {
      const worldY = this.cellToWorld({ col: 0, row }).y;
      const label = this.add.text(
        this.boardOriginX + COLS * this.cellSize / 2,
        worldY,
        row === EXPANSION_ROW_ONE
          ? 'CLEAR ALL LOCKED ITEMS TO UNLOCK ROW'
          : `UNLOCKS AT LEVEL ${EXPANSION_ROW_TWO_LEVEL}`,
        {
          resolution: textResolution,
          fontFamily: Theme.fontMono,
          fontSize: '10px',
          fontStyle: 'bold',
          color: hex(Theme.textOnDark),
          backgroundColor: 'rgba(0,0,0,0.58)',
          padding: { x: 3, y: 1 },
          align: 'center'
        }
      ).setOrigin(0.5).setDepth(6)
        .setStroke(hex(Theme.textOnDark), 1)
        .setShadow(0, 0, '#000000', 3, true, true);
      this.expansionRowLabels.push(label);

      for (let col = 0; col < COLS; col++) {
        const pos = { col, row };
        if (!this.grid.isBlocked(pos)) continue;
        const world = this.cellToWorld(pos);
        const bg = this.add.graphics().setDepth(4);
        const price = this.add.text(world.x, world.y, '', {
          resolution: textResolution,
          fontFamily: Theme.fontNumeric,
          fontSize: '11px',
          fontStyle: 'bold',
          color: hex(Theme.currencyCredit),
          align: 'center'
        }).setOrigin(0, 0.5).setDepth(6);
        const mark = this.add.image(0, 0, 'currency-coin').setDepth(6);
        const zone = this.add.zone(world.x, world.y, this.cellSize, this.cellSize)
          .setDepth(7)
          .setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => this.buyExpansionCell(pos));
        this.expansionLockViews.set(this.keyOf(pos), { bg, price, mark, zone });
      }
    }
    this.refreshBoardExpansionLocks();
  }

  private refreshBoardExpansionLocks(): void {
    for (const [key, view] of this.expansionLockViews) {
      const [col, row] = key.split(',').map(Number);
      const eligible = this.expansionRowEligible(row);
      const concealed = row === EXPANSION_ROW_TWO && !this.firstExpansionRowComplete();
      const world = this.cellToWorld({ col, row });
      const left = world.x - this.cellSize / 2;
      const top = world.y - this.cellSize / 2;
      view.bg.clear();
      this.drawExpansionMetalTile(view.bg, left - 0.5, top - 0.5, this.cellSize + 1, eligible, concealed);
      const showPrice = eligible && !concealed && !this.roomPanelOpen;
      const rawPrice = this.expansionPrice({ col, row });
      const priceLabel = rawPrice >= 1_000 ? `${rawPrice / 1_000}k` : String(rawPrice);
      view.price.setVisible(showPrice).setText(priceLabel);
      view.mark.setVisible(showPrice);
      if (showPrice) {
        const glyphSize = 15;
        const gap = 3;
        const groupW = view.price.width + gap + glyphSize;
        const startX = world.x - groupW / 2;
        view.price.setPosition(startX, world.y);
        applyCurrencyIcon(view.mark, 'credit', glyphSize);
        view.mark.setPosition(startX + view.price.width + gap + glyphSize / 2, world.y);
      }
    }
    this.expansionRowLabels.forEach((label, index) => {
      const row = index === 0 ? EXPANSION_ROW_ONE : EXPANSION_ROW_TWO;
      const visible = (
        !this.expansionRowEligible(row)
        && !(row === EXPANSION_ROW_TWO && !this.firstExpansionRowComplete())
      );
      // Hiding the board for the room panel sets visible=false on everything
      // below depth 3000, but this refresher runs afterwards and would set it
      // straight back - which is how the locked-row caption reappeared over
      // the 3D room.
      label.setVisible(visible && !this.roomPanelOpen);
    });
  }

  /** Front-facing square steel access plate used by every locked board cell. */
  private drawExpansionMetalTile(
    g: Phaser.GameObjects.Graphics, left: number, top: number, size: number, eligible: boolean, concealed: boolean
  ): void {
    const edge = concealed ? 0x4b5053 : eligible ? 0x858f95 : 0x737c81;
    const face = concealed ? 0x5a6063 : eligible ? 0xaeb7bb : 0x969fa3;
    const faceDark = concealed ? 0x393e41 : eligible ? 0x717b81 : 0x626b70;
    const recess = concealed ? 0x414649 : eligible ? 0x808a90 : 0x70797e;
    const outline = 0x20252a;
    const inset = Math.max(5, size * 0.105);
    const boltInset = Math.max(5, size * 0.115);
    const boltR = Math.max(1.8, size * 0.043);

    // Full square footprint makes neighboring plates meet with no exposed
    // board between them. The dark bottom band suggests thickness without
    // rotating the tile into an isometric diamond.
    g.fillStyle(outline, 1);
    g.fillRect(left, top, size, size);
    g.fillStyle(faceDark, 1);
    g.fillRect(left + 1, top + 3, size - 2, size - 4);
    g.fillStyle(face, 1);
    g.fillRect(left + 2, top + 2, size - 4, size - 7);
    // Broad top-light-to-shadow treatment shared by both locked rows. The
    // first row keeps its brighter palette; only the lighting progression
    // matches the concealed row beneath it.
    g.fillStyle(0xffffff, concealed ? 0.07 : 0.12);
    g.fillRect(left + 2, top + 2, size - 4, size * 0.28);
    g.fillStyle(0x000000, concealed ? 0.13 : 0.09);
    g.fillRect(left + 2, top + size * 0.62, size - 4, size * 0.28);

    // Square recessed center with a restrained curved highlight across its
    // upper half, echoing the reference's polished inset at board scale.
    g.fillStyle(outline, 0.95);
    g.fillRoundedRect(left + inset - 1, top + inset - 1, size - inset * 2 + 2, size - inset * 2 + 2, 3);
    g.fillStyle(recess, 1);
    g.fillRoundedRect(left + inset, top + inset, size - inset * 2, size - inset * 2, 2);
    g.fillStyle(0xd7dde0, eligible ? 0.24 : 0.17);
    g.fillRoundedRect(left + inset + 2, top + inset + 2, size - inset * 2 - 4, Math.max(3, size * 0.12), 2);

    // Crisp top/left light and bottom/right shadow form the outer bevel.
    g.lineStyle(1, 0xe7ecee, eligible ? 0.78 : 0.58);
    g.lineBetween(left + 2, top + 2, left + size - 2, top + 2);
    g.lineBetween(left + 2, top + 2, left + 2, top + size - 5);
    g.lineStyle(1, outline, 0.95);
    g.lineBetween(left + size - 2, top + 2, left + size - 2, top + size - 2);
    g.lineBetween(left + 1, top + size - 2, left + size - 1, top + size - 2);

    // Four small fasteners remain readable even at the 52px phone size.
    for (const [x, y] of [
      [left + boltInset, top + boltInset],
      [left + size - boltInset, top + boltInset],
      [left + boltInset, top + size - boltInset],
      [left + size - boltInset, top + size - boltInset]
    ]) {
      g.fillStyle(outline, 1);
      g.fillCircle(x, y, boltR + 1);
      g.fillStyle(edge, 1);
      g.fillCircle(x, y, boltR);
      g.fillStyle(0xf0f3f4, 0.72);
      g.fillCircle(x - boltR * 0.25, y - boltR * 0.3, Math.max(0.8, boltR * 0.42));
    }
  }

  private buyExpansionCell(pos: GridPosition): void {
    if (!this.grid.isBlocked(pos)) return;
    if (!this.expansionRowEligible(pos.row)) {
      this.refreshActionTray(
        pos.row === EXPANSION_ROW_ONE
          ? 'ROW LOCKED\nCLEAR ALL LOCKED BOARD ITEMS FIRST'
          : !this.firstExpansionRowComplete()
            ? 'ROW LOCKED\nUNLOCK THE ROW ABOVE FIRST'
          : 'ROW LOCKED\nREACH PLAYER LEVEL 50 FIRST'
      );
      return;
    }
    const cost = this.expansionPrice(pos);
    if (!spendCoinsGeneric(this.economy, cost)) {
      this.refreshActionTray(`NOT ENOUGH CREDITS\nTHIS BOARD TILE COSTS ${cost.toLocaleString()}`);
      return;
    }

    this.grid.unblock(pos);
    this.boardExpansionUnlocked.add(this.keyOf(pos));
    const view = this.expansionLockViews.get(this.keyOf(pos));
    view?.bg.destroy();
    view?.price.destroy();
    view?.mark.destroy();
    view?.zone.destroy();
    this.expansionLockViews.delete(this.keyOf(pos));
    this.updateCurrencyText();
    this.refreshProjectButton();
    this.saveState();
    this.tryReleaseVaultItem();
    this.tryDeliverMeterGold();
    this.checkDeadlock();
    this.refreshActionTray(`BOARD TILE UNLOCKED\n${cost.toLocaleString()} CREDITS SPENT`);
  }

  /**
   * The empty cell(s) closest to `from` (Chebyshev distance - a ring
   * outward, matching how a piece could actually slide off a source).
   * Ties broken randomly so repeated collects don't all land in the exact
   * same spot. Used so a source's output appears next to it instead of
   * teleporting to a random empty square anywhere on the board.
   */
  private nearestEmptyCells(from: GridPosition, empties: GridPosition[]): GridPosition[] {
    let best = Infinity;
    for (const pos of empties) {
      const dist = Math.max(Math.abs(pos.col - from.col), Math.abs(pos.row - from.row));
      if (dist < best) best = dist;
    }
    return empties.filter((pos) => Math.max(Math.abs(pos.col - from.col), Math.abs(pos.row - from.row)) === best);
  }

  // ---- Header chrome ----

  /** Energy chip: value only; tapping opens the live countdown and refill details. */
  private buildEnergyChip(y: number): HudChip {
    const s = this.hudScale;
    const accent = Theme.currencyEnergy;
    const numberColor = materialLighting(accent, 4).light;
    const bg = this.add.graphics().setDepth(20);
    const iconSize = glyphBoxFor('energy', 17 * s);
    const iconShadow = this.add.image(0, 0, 'currency-energy').setDisplaySize(iconSize, iconSize).setTintFill(0x000000).setAlpha(0.28).setDepth(21);
    const icon = this.add.image(0, 0, 'currency-energy').setDisplaySize(iconSize, iconSize).setDepth(22);
    const iconGloss = this.add.image(0, 0, 'currency-energy').setDisplaySize(iconSize, iconSize).setTintFill(0xffffff).setAlpha(0.2).setDepth(23);
    iconGloss.setCrop(0, 0, iconGloss.width, iconGloss.height * 0.42);
    const text = this.add.text(0, 0, '', {
      fontFamily: Theme.fontNumeric,
      fontSize: `${10.5 * s}px`,
      fontStyle: 'bold',
      color: hex(numberColor),
      resolution: textResolution
    }).setOrigin(1, 0.5).setDepth(24);
    const hit = this.add.rectangle(0, 0, 10, 20, 0x000000, 0).setDepth(25).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.time.delayedCall(0, () => this.offerEnergyRefill()));

    const naturalWidth = (): number => Math.max(38 * s, Math.ceil(text.width) + 24 * s);
    const draw = (rightX: number, w: number): void => {
      const h = 16 * s;
      const x = rightX - w;

      bg.clear();
      // Darker than the surfaces around it, so the bar reads as a recess the
      // number sits in rather than as another raised panel.
      const chipLighting = materialLighting(Theme.bgElevated, 2);
      bg.fillGradientStyle(chipLighting.light, chipLighting.base, chipLighting.dark, chipLighting.shadow, 1);
      bg.fillRoundedRect(x, y, w, h, Theme.radiusChip);
      const edgeLighting = materialLighting(accent, 6);
      bg.lineGradientStyle(
        Theme.borderWidth + 0.5,
        edgeLighting.highlight, edgeLighting.light,
        edgeLighting.dark, edgeLighting.shadow, 0.95
      );
      bg.strokeRoundedRect(x, y, w, h, Theme.radiusChip);

      iconShadow.setPosition(x + 8 * s, y + h / 2 + 1.25 * s);
      icon.setPosition(x + 8 * s, y + h / 2);
      iconGloss.setPosition(x + 8 * s, y + h / 2);

      text.setScale(Math.min(1, Math.max(0.72, (w - 22 * s) / Math.max(1, text.width))), 1);
      text.setPosition(x + w - 6 * s, y + h / 2);
      hit.setPosition(x + w / 2, y + h / 2).setSize(w, h);
      hit.input!.hitArea.setTo(0, 0, w, h);
    };

    return { text, naturalWidth, draw };
  }

  /**
   * Packs the currency chips right-to-left from the shop button.
   *
   * Re-run whenever a value changes, because each chip is now sized to its
   * own number - so gaining a digit has to push its neighbours along rather
   * than overlap them.
   */
  private layoutHudChips(): void {
    if (!this.hudChips.length) return;
    // Equal insets keep the three slot centres symmetrical across the board.
    // 70, not 44: the settings gear occupies the 26px immediately left of the
    // shop button now, and chips pack right-to-left from this inset - without
    // widening it a long credit balance would run underneath the gear.
    const right = this.headerRight - 70 * this.hudScale;
    // The level badge ends at roughly boardOriginX + 37. Seven more pixels
    // form a protected gap that resource balances may never enter.
    const left = this.boardOriginX + 44 * this.hudScale;
    const available = Math.max(1, right - left);
    const gap = (available >= 180 * this.hudScale ? 8 : 3) * this.hudScale;
    const widths = this.hudChips.map((chip) => chip.naturalWidth());
    const gapTotal = gap * (widths.length - 1);
    const naturalTotal = widths.reduce((sum, width) => sum + width, 0);
    if (naturalTotal + gapTotal > available) {
      const scale = Math.max(0, (available - gapTotal) / naturalTotal);
      for (let i = 0; i < widths.length; i++) widths[i] *= scale;
    }
    const total = widths.reduce((sum, width) => sum + width, 0) + gapTotal;
    let cursor = (left + right + total) / 2;
    for (let i = 0; i < this.hudChips.length; i++) {
      this.hudChips[i].draw(cursor, widths[i]);
      cursor -= widths[i] + gap;
    }
  }

  /** A bordered icon+number badge for a currency, right-aligned at `rightX`. */
  private buildCurrencyChip(
    y: number,
    accent: number,
    glyph: 'coin' | 'gem',
    onTap: () => void
  ): HudChip {
    const s = this.hudScale;
    const numberColor = materialLighting(accent, 4).light;
    const bg = this.add.graphics().setDepth(20);
    const iconKey = glyph === 'coin' ? 'currency-coin' : 'currency-gem';
    // 24px of drawn mark, against the bolt's 26 - see GLYPH_FILL_RATIO for
    // why that is not the same as a 24px display size.
    const iconSize = glyphBoxFor(glyph, 15 * s);
    const iconShadow = this.add.image(0, 0, iconKey).setDisplaySize(iconSize, iconSize).setTintFill(0x000000).setAlpha(0.28).setDepth(21);
    const icon = this.add.image(0, 0, iconKey).setDisplaySize(iconSize, iconSize).setDepth(22);
    const iconGloss = this.add.image(0, 0, iconKey).setDisplaySize(iconSize, iconSize).setTintFill(0xffffff).setAlpha(0.2).setDepth(23);
    iconGloss.setCrop(0, 0, iconGloss.width, iconGloss.height * 0.42);
    const text = this.add.text(0, 0, '', {
      fontFamily: Theme.fontNumeric,
      fontSize: `${11 * s}px`,
      fontStyle: 'bold',
      color: hex(numberColor),
      resolution: textResolution
    }).setOrigin(1, 0.5).setDepth(24);
    const hit = this.add.rectangle(0, 0, 10, 28, 0x000000, 0).setDepth(25).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.time.delayedCall(0, onTap));

    const naturalWidth = (): number => Math.max(38 * s, Math.ceil(text.width) + 24 * s);
    const draw = (rightX: number, w: number): void => {
      const h = 16 * s;
      const x = rightX - w;

      bg.clear();
      // Darker than the surfaces around it, so the bar reads as a recess the
      // number sits in rather than as another raised panel.
      const chipLighting = materialLighting(Theme.bgElevated, 2);
      bg.fillGradientStyle(chipLighting.light, chipLighting.base, chipLighting.dark, chipLighting.shadow, 1);
      bg.fillRoundedRect(x, y, w, h, Theme.radiusChip);
      const edgeLighting = materialLighting(accent, 6);
      bg.lineGradientStyle(
        Theme.borderWidth + 0.5,
        edgeLighting.highlight, edgeLighting.light,
        edgeLighting.dark, edgeLighting.shadow, 0.95
      );
      bg.strokeRoundedRect(x, y, w, h, Theme.radiusChip);

      iconShadow.setPosition(x + 9 * s, y + h / 2 + 1.25 * s);
      icon.setPosition(x + 9 * s, y + h / 2);
      iconGloss.setPosition(x + 9 * s, y + h / 2);

      text.setScale(Math.min(1, Math.max(0.72, (w - 22 * s) / Math.max(1, text.width))), 1);
      text.setPosition(x + w - 6 * s, y + h / 2);
      hit.setPosition(x + w / 2, y + h / 2).setSize(w, 28);
      hit.input!.hitArea.setTo(0, 0, w, 28);
    };

    return { text, naturalWidth, draw };
  }

  /**
   * Fills a rect with the Blender-rendered button texture, scaled uniformly
   * (cover-fit, same technique as the scene background photo) and clipped
   * to a rounded-rect mask - NOT 9-sliced. The source has a continuous
   * diagonal reflection streak across its whole surface, so stretching a
   * sliced middle region to fill different button widths warps that streak;
   * uniform scaling avoids any axis-independent distortion.
   */
  private buildTexturedButtonFill(x: number, y: number, w: number, h: number, container?: Phaser.GameObjects.Container, radius: number = Theme.radiusChip): Phaser.GameObjects.Image {
    const img = this.add.image(x + w / 2, y + h / 2, 'uiButtonTest');
    const scale = Math.max(w / img.width, h / img.height);
    img.setScale(scale);

    const maskShape = this.add.graphics().setVisible(false);
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRoundedRect(x, y, w, h, radius);
    img.setMask(maskShape.createGeometryMask());

    if (container) {
      container.add(img);
      container.add(maskShape);
    }
    return img;
  }

  /** Layered vector badge showing the player's current level number. */
  private buildLevelBadge(cx: number, cy: number): Phaser.GameObjects.Text {
    const s = this.hudScale;
    const radius = 15 * s;
    const lighting = materialLighting(Theme.playerLevel, 5);
    this.levelXpRing = this.add.graphics();
    const badgePoints = (centerY: number, outer: number, inner: number): Phaser.Geom.Point[] => {
      const points: Phaser.Geom.Point[] = [];
      for (let i = 0; i < 16; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 8;
        const r = i % 2 === 0 ? outer : inner;
        points.push(new Phaser.Geom.Point(cx + Math.cos(angle) * r, centerY + Math.sin(angle) * r));
      }
      return points;
    };
    const bg = this.add.graphics();
    bg.fillStyle(lighting.shadow, 0.9);
    bg.fillPoints(badgePoints(cy + 2 * s, radius + s, radius - 3 * s), true);
    bg.fillStyle(lighting.light, 1);
    bg.fillPoints(badgePoints(cy, radius, radius - 4 * s), true);
    bg.fillGradientStyle(lighting.light, lighting.highlight, Theme.playerLevel, lighting.dark, 1);
    bg.fillCircle(cx, cy, radius - 4 * s);
    bg.lineStyle(1.5 * s, lighting.highlight, 0.75);
    bg.strokeCircle(cx, cy, radius - 5 * s);
    bg.fillStyle(lighting.highlight, 0.3);
    bg.fillEllipse(cx - 3 * s, cy - 5 * s, 8 * s, 4 * s);
    this.levelKeystone = this.add.graphics();

    const text = this.add.text(cx, cy, '1', {
      fontFamily: Theme.fontNumeric,
      fontSize: `${13 * s}px`,
      fontStyle: 'bold',
      color: hex(Theme.textOnDark),
      resolution: textResolution
    }).setOrigin(0.5).setShadow(0, 1, '#000000', 1, true, false);
    const hit = this.add.circle(cx, cy, radius, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.time.delayedCall(0, () => this.openPlayerInfo()));

    // Persistent but quiet ready marker. It belongs to the level badge
    // because milestone crates are earned by levelling and claimed from the
    // profile; no second header currency or detached inbox is introduced.
    this.levelMilestoneDot = this.add.graphics();
    this.levelMilestoneCount = this.add.text(cx + 11 * s, cy - 11 * s, '', {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric,
      fontSize: `${8 * s}px`,
      fontStyle: 'bold',
      color: hex(Theme.bg)
    }).setOrigin(0.5).setDepth(3);
    return text;
  }

  /**
   * Level-up flourish on the profile badge.
   *
   * Two rings leaving the badge and a punch on the number. The rings are the
   * XP ring's own radius and colour, so the effect reads as the ring the
   * player just filled letting go, rather than as a sparkle arriving from
   * nowhere - and the second, thinner one trails the first so it lands as a
   * pulse rather than as one hard flash.
   *
   * Drawn as throwaway Graphics rather than by animating the badge itself:
   * the badge's dome, rim, ring and keystone are separate objects at absolute
   * coordinates, so there is nothing to scale as a unit without rebuilding it
   * into a container.
   */
  private playLevelUpFlourish(): void {
    const s = this.hudScale;
    const x = this.levelBadgeText.x;
    const y = this.levelBadgeText.y + 1.5;
    const lighting = materialLighting(Theme.playerLevel, 5);

    for (const wave of [
      { delay: 0, width: 3, tone: lighting.highlight, scale: 2.05, duration: 520 },
      { delay: 110, width: 1.5, tone: lighting.light, scale: 2.5, duration: 620 }
    ]) {
      const ring = this.add.graphics().setPosition(x, y).setDepth(3).setAlpha(0);
      ring.lineStyle(wave.width, wave.tone, 1);
      // Centred on the graphics' own origin so `scale` grows it from the
      // badge rather than sliding it across the header.
      ring.strokeCircle(0, 0, 16.5 * s);
      this.tweens.add({
        targets: ring,
        alpha: { from: 0.9, to: 0 },
        scale: { from: 1, to: wave.scale },
        delay: wave.delay,
        duration: wave.duration,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy()
      });
    }

    // Killed first: levelling twice in quick succession - which a milestone
    // crate's own XP can cause - would otherwise leave the number stranded
    // mid-punch at whatever scale the interrupted tween had reached.
    this.tweens.killTweensOf(this.levelBadgeText);
    this.levelBadgeText.setScale(1);
    this.tweens.add({
      targets: this.levelBadgeText,
      scale: 1.4,
      duration: 150,
      hold: 70,
      yoyo: true,
      ease: 'Back.easeOut',
      onComplete: () => this.levelBadgeText.setScale(1)
    });
  }

  private updateLevelBadge(): void {
    const s = this.hudScale;
    const level = playerLevel(this.orderState);
    this.levelBadgeText.setText(String(level));
    // Detected here rather than at the order-completion call site, because
    // XP also arrives from milestones, daily claims and discoveries - every
    // one of which already routes through this method.
    if (this.levelBadgeShownLevel !== 0 && level > this.levelBadgeShownLevel) {
      this.playLevelUpFlourish();
    }
    this.levelBadgeShownLevel = level;
    const xp = playerXpProgress(this.orderState);
    const progress = Phaser.Math.Clamp(xp.current / xp.required, 0, 1);
    const gap = Phaser.Math.DegToRad(38);
    const start = -Math.PI / 2 + gap / 2;
    const span = Math.PI * 2 - gap;
    const ringX = this.levelBadgeText.x;
    const ringY = this.levelBadgeText.y + 1.5 * s;
    this.levelXpRing.clear();
    this.levelXpRing.lineStyle(5 * s, Theme.borderOnDark, 0.8);
    this.levelXpRing.beginPath();
    this.levelXpRing.arc(ringX, ringY, 16.5 * s, start, start + span);
    this.levelXpRing.strokePath();
    if (progress > 0) {
      const xpLighting = materialLighting(Theme.currencyXp, 5);
      const segments = Math.max(2, Math.ceil(36 * progress));
      for (let i = 0; i < segments; i++) {
        const from = start + span * progress * (i / segments);
        const to = start + span * progress * ((i + 1) / segments);
        this.levelXpRing.lineStyle(5 * s, toneAt(xpLighting, 0.25 + 0.75 * (i / Math.max(1, segments - 1))), 1);
        this.levelXpRing.beginPath();
        this.levelXpRing.arc(ringX, ringY, 16.5 * s, from, to + 0.002);
        this.levelXpRing.strokePath();
      }
    }
    const capLighting = materialLighting(Theme.playerLevel, 5);
    const keystone = [
      new Phaser.Geom.Point(ringX - 7 * s, ringY - 20 * s),
      new Phaser.Geom.Point(ringX + 7 * s, ringY - 20 * s),
      new Phaser.Geom.Point(ringX + 5 * s, ringY - 13 * s),
      new Phaser.Geom.Point(ringX - 5 * s, ringY - 13 * s)
    ];
    this.levelKeystone.clear();
    // Shaded as horizontal slices rather than one flat fill. Graphics has no
    // gradient fill for an arbitrary polygon - fillGradientStyle only reaches
    // rects and triangles, and on a triangulated path it keys off vertex
    // order, which for this trapezoid lands wherever the tessellator happens
    // to cut it. Slicing the shape puts the ramp under our control.
    //
    // Lit at the top face, falling to a shadowed underside where the cap
    // meets the ring: the same upper-left key light the dome, rim and XP
    // ring below it are all shaded by. A flat cap was the one surface on
    // this badge that read as a sticker sitting on the art.
    const capTop = ringY - 20 * s;
    const capBottom = ringY - 13 * s;
    const capSlices = 9;
    for (let i = 0; i < capSlices; i++) {
      const t0 = i / capSlices;
      const t1 = (i + 1) / capSlices;
      const halfAt = (t: number) => (7 - 2 * t) * s;
      const yAt = (t: number) => capTop + (capBottom - capTop) * t;
      this.levelKeystone.fillStyle(toneAt(capLighting, 0.88 - 0.55 * ((t0 + t1) / 2)), 1);
      this.levelKeystone.fillPoints([
        new Phaser.Geom.Point(ringX - halfAt(t0), yAt(t0)),
        new Phaser.Geom.Point(ringX + halfAt(t0), yAt(t0)),
        // Half a pixel of overlap onto the next slice; butted edges leave
        // hairline seams once the canvas is scaled by devicePixelRatio.
        new Phaser.Geom.Point(ringX + halfAt(t1), yAt(t1) + 0.5),
        new Phaser.Geom.Point(ringX - halfAt(t1), yAt(t1) + 0.5)
      ], true);
    }
    this.levelKeystone.lineStyle(1, capLighting.highlight, 0.8);
    this.levelKeystone.strokePoints(keystone, true);
    const projectReady = this.projectStageReady();
    const readyCount = (dailyAvailable(this.rewards, Date.now()) ? 1 : 0)
      + unclaimedDiscoveryCount(this.collection)
      + (projectReady ? 1 : 0);
    this.refreshMainCollectionButton();
    if (!this.levelMilestoneDot || !this.levelMilestoneCount) return;
    this.levelMilestoneDot.clear();
    this.levelMilestoneCount.setText('');
    if (readyCount > 0) {
      const x = this.levelBadgeText.x + 11 * s;
      const y = this.levelBadgeText.y - 11 * s;
      this.levelMilestoneDot.fillStyle(Theme.accentAmber, 1);
      this.levelMilestoneDot.fillCircle(x, y, 6 * s);
      this.levelMilestoneDot.lineStyle(1, Theme.textOnDark, 0.75);
      this.levelMilestoneDot.strokeCircle(x, y, 6 * s);
      this.levelMilestoneDot.setDepth(2);
      this.levelMilestoneCount
        .setPosition(x, y - 0.75)
        .setText(readyCount > 9 ? '9+' : String(readyCount));
    }
  }

  /** Layered vector storefront button, matching the board item's drawn-material treatment. */
  private buildShopIconButton(cx: number, cy: number, onTap: () => void): void {
    const s = this.hudScale;
    const radius = 18;
    const diameter = radius * 2;
    const lighting = materialLighting(Theme.panelAlt, 4);
    const icon = this.add.graphics();
    icon.fillStyle(0x000000, 0.3);
    icon.fillCircle(1, 2, radius);
    icon.fillStyle(lighting.dark, 1);
    icon.fillCircle(0, 0, radius);
    icon.lineStyle(1.5, lighting.light, 0.9);
    icon.strokeCircle(0, 0, radius - 1);
    icon.fillStyle(lighting.highlight, 0.16);
    icon.fillEllipse(-5, -8, 18, 8);

    // Store body and window.
    icon.fillStyle(Theme.textOnDarkMuted, 1);
    icon.fillRoundedRect(-9, -3, 18, 13, 2);
    icon.fillStyle(Theme.bgElevated, 1);
    icon.fillRect(-6, 2, 5, 8);
    icon.fillRect(2, 2, 5, 5);

    // Striped awning gives the silhouette a clear "shop" read at icon size.
    icon.fillStyle(Theme.textOnDark, 1);
    icon.fillRoundedRect(-11, -9, 22, 7, 2);
    icon.fillStyle(Theme.currencyCredit, 1);
    icon.fillRect(-6, -9, 5, 7);
    icon.fillRect(4, -9, 5, 7);
    icon.lineStyle(1, lighting.shadow, 0.75);
    icon.lineBetween(-11, -2, 11, -2);

    this.add.container(cx, cy, [icon]).setScale(s);

    const zone = this.add.zone(cx, cy, diameter * s, diameter * s).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', onTap);
  }

  /**
   * Settings: a small gear immediately left of the shop button.
   *
   * It sits in the band `layoutHudChips` gives up for it - the chips pack
   * right-to-left from a fixed inset, so the gear's width has to come out of
   * that inset or the credit balance would slide underneath it.
   */
  private buildSettingsButton(): void {
    const s = this.hudScale;
    const size = 22 * s;
    // The shop button is a radius-18 circle centred at `headerRight - 18`, so
    // its left edge is `headerRight - 36`; four pixels of air, then the gear.
    const x = this.headerRight - 36 * s - 4 * s - size / 2;
    // Bottom-aligned with the currency chips, like the badge and the shop
    // button beside it - see `chipBottomY` in create().
    const y = this.contentTop + 42 * this.hudScale - 2 - size / 2;

    const bg = this.add.graphics().setDepth(4);
    bg.fillStyle(Theme.bg, 0.94);
    bg.fillRoundedRect(x - size / 2, y - size / 2, size, size, Theme.radiusChip);
    bg.lineStyle(1, Theme.borderOnDark, 1);
    bg.strokeRoundedRect(x - size / 2, y - size / 2, size, size, Theme.radiusChip);

    const icon = this.add.graphics().setPosition(x, y).setDepth(5).setScale(s);
    const lighting = materialLighting(Theme.textOnDarkMuted, 4);
    icon.fillStyle(lighting.light, 1);
    const teeth = 8;
    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      // Each tooth is drawn at the origin and moved into place by the canvas
      // transform, so they sit square to their own radius instead of being
      // axis-aligned squares that read as a blur at this size.
      icon.save();
      icon.translateCanvas(Math.cos(angle) * 6, Math.sin(angle) * 6);
      icon.rotateCanvas(angle);
      icon.fillRect(-1.9, -1.9, 3.8, 3.8);
      icon.restore();
    }
    icon.fillCircle(0, 0, 5.2);
    icon.fillStyle(Theme.bg, 1);
    icon.fillCircle(0, 0, 2.2);

    // Hit area stays finger-sized even though the art shrank - a 22px target
    // is under every touch guideline, and this one sits next to the shop
    // button, where a miss costs the player a wrong panel.
    const zone = this.add.zone(x, y, size + 14, size + 14)
      .setDepth(6).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => this.time.delayedCall(0, () => this.openSettings()));
  }

  /**
   * The settings panel. One setting so far: fullscreen.
   *
   * Toggling fullscreen resizes the viewport, and this scene answers a resize
   * by restarting itself, so the panel closes on its own a moment after the
   * tap. That is the architecture working rather than a bug - the whole HUD
   * has to be laid out again against the new size - so the panel does not try
   * to survive it.
   */
  private openSettings(): void {
    if (this.modalOpen || this.inputLocked) return;
    this.modalOpen = true;
    const w = this.scale.width;
    const h = this.scale.height;
    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.6)
      .setDepth(3000).setInteractive();

    const card = this.add.container(w / 2, h / 2).setDepth(3001);
    const cw = Math.min(300, w - 40);
    const ch = 168;
    const cardBg = this.add.graphics();
    cardBg.fillStyle(Theme.panel, 1);
    cardBg.fillRoundedRect(-cw / 2, -ch / 2, cw, ch, Theme.radiusPanel);
    cardBg.lineStyle(Theme.borderWidthStrong, Theme.borderOnDark, 0.85);
    cardBg.strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, Theme.radiusPanel);

    const title = this.add.text(0, -ch / 2 + 26, 'SETTINGS', {
      resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '16px',
      fontStyle: 'bold', color: hex(Theme.textOnLight)
    }).setOrigin(0.5);

    // Not every browser has the Fullscreen API - iOS Safari on iPhone has
    // never shipped it - so the row says so plainly and points at the route
    // that does work there, rather than offering a control that does nothing.
    const available = fullscreenSupported();
    const rowY = -6;
    const label = this.add.text(-cw / 2 + 20, rowY, 'FULLSCREEN', {
      resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '13px',
      fontStyle: 'bold', color: hex(available ? Theme.textOnLight : Theme.textOnLightMuted)
    }).setOrigin(0, 0.5);

    const toggleW = 68;
    const toggleH = 28;
    const toggleX = cw / 2 - 20 - toggleW / 2;
    const toggleBg = this.add.graphics();
    const toggleText = this.add.text(toggleX, rowY, '', {
      resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '11px',
      fontStyle: 'bold', color: hex(Theme.textOnLight)
    }).setOrigin(0.5);

    const paintToggle = (): void => {
      const on = !!fullscreenElement();
      const tone = !available ? Theme.textOnLightMuted : on ? Theme.accentGreen : Theme.textOnLightMuted;
      toggleBg.clear();
      toggleBg.fillStyle(on && available ? Theme.accentGreen : Theme.panelAlt, on && available ? 0.22 : 1);
      toggleBg.fillRoundedRect(toggleX - toggleW / 2, rowY - toggleH / 2, toggleW, toggleH, Theme.radiusChip);
      toggleBg.lineStyle(1, tone, 0.9);
      toggleBg.strokeRoundedRect(toggleX - toggleW / 2, rowY - toggleH / 2, toggleW, toggleH, Theme.radiusChip);
      toggleText.setText(!available ? 'N/A' : on ? 'ON' : 'OFF').setColor(hex(tone));
    };
    paintToggle();

    const note = this.add.text(
      0, ch / 2 - 46,
      available
        ? 'THE GAME REBUILDS ITS LAYOUT WHEN THIS CHANGES.'
        : 'THIS BROWSER HAS NO FULLSCREEN API.\nADD THE GAME TO YOUR HOME SCREEN INSTEAD.',
      {
        resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '9px',
        color: hex(Theme.textOnLightMuted), align: 'center', lineSpacing: 3
      }
    ).setOrigin(0.5);

    const close = this.add.text(0, ch / 2 - 22, 'CLOSE', {
      resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '13px',
      fontStyle: 'bold', color: hex(Theme.textOnLightMuted)
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    card.add([cardBg, title, label, toggleBg, toggleText, note, close]);

    const dismiss = () => {
      overlay.destroy();
      card.destroy();
      this.modalOpen = false;
    };

    if (available) {
      const toggleZone = this.add.zone(toggleX, rowY, toggleW, toggleH)
        .setInteractive({ useHandCursor: true });
      // Fullscreen has to be requested from inside a real user gesture, which
      // a pointerdown handler is - so this is NOT deferred through a
      // delayedCall the way the panel's other taps are. Deferring drops it
      // out of the gesture and the browser refuses the request.
      toggleZone.on('pointerdown', () => {
        // Phaser's own toggle wraps the canvas in an element it creates, which
        // does not survive this scene's restart-on-resize; the request went
        // through the DOM instead, and `toggleFullscreen` handles the prefixed
        // spellings phones still ship.
        toggleFullscreen();
        // Closed immediately rather than left open to be torn down by the
        // resize-driven restart. Entering fullscreen moves and resizes the
        // canvas, and until the scale manager re-reads its bounds every
        // pointer hit lands at the old coordinates - so CLOSE stops
        // responding and the panel becomes a trap with the game running
        // behind it. Nothing to be trapped in if it is already gone.
        dismiss();
      });
      card.add(toggleZone);
    }

    const deferDismiss = () => this.time.delayedCall(0, dismiss);
    overlay.on('pointerdown', deferDismiss);
    close.on('pointerdown', deferDismiss);
  }

  /**
   * RESET is a dev-only utility, not part of the real game's HUD. Pinned to
   * an absolute screen corner with its own tiny footprint so it can be
   * deleted in one line without touching any other header element.
   */
  private buildDevResetButton(): void {
    const text = this.add.text(this.scale.width - 8, this.scale.height - 8, 'reset', {
      resolution: textResolution,
      fontFamily: Theme.fontMono,
      fontSize: '10px',
      color: hex(Theme.textOnDarkMuted)
    }).setOrigin(1, 1).setAlpha(0.5).setInteractive({ useHandCursor: true });
    text.on('pointerover', () => text.setAlpha(1));
    text.on('pointerout', () => text.setAlpha(0.5));
    text.on('pointerdown', () => this.confirmReset());
  }

  private buildAutoMergeButton(): void {
    this.autoMergeText = this.add.text(this.scale.width - 48, this.scale.height - 8, '', {
      resolution: textResolution,
      fontFamily: Theme.fontMono,
      fontSize: '10px',
      color: hex(Theme.textOnDarkMuted)
    }).setOrigin(1, 1).setAlpha(0.65).setDepth(10).setInteractive({ useHandCursor: true });
    const refresh = (): void => {
      this.autoMergeText.setText(`auto: ${this.autoMergeEnabled ? 'on' : 'off'}`)
        .setColor(hex(this.autoMergeEnabled ? Theme.accentGreen : Theme.textOnDarkMuted));
    };
    refresh();
    this.autoMergeText.on('pointerdown', () => {
      this.autoMergeEnabled = !this.autoMergeEnabled;
      localStorage.setItem(AUTO_MERGE_KEY, String(this.autoMergeEnabled));
      refresh();
    });
  }

  /** Performs one legal merge through the same drop path used by the player. */
  private async runAutoMergeStep(): Promise<void> {
    if (!this.autoMergeEnabled || this.inputLocked || this.modalOpen || this.draggingView) return;
    const projectStage = PROJECT_STAGES[this.projectStage];
    if (projectStage && this.projectUnlockReady()) {
      this.completeProjectStage(projectStage, {
        x: Math.max(22, this.boardOriginX - 24),
        y: this.crateRingCentre().cy
      });
      return;
    }
    const readyOrderSlot = activeOrders(this.orderState).findIndex(({ order }) =>
      orderProgress(order, this.orderState, this.orderProgressSource()).ready
    );
    if (readyOrderSlot >= 0) {
      this.submitOrderSlot(readyOrderSlot);
      return;
    }

    const maxCurrency = [...this.views.entries()].find(([, view]) =>
      view instanceof TileView &&
      isCurrencyChain(view.typeId) &&
      getTierDef(view.typeId, view.tier + 1) == null
    );
    if (maxCurrency) {
      const [key, view] = maxCurrency as [string, TileView];
      const now = Date.now();
      if (this.lastCurrencyTap?.key === key && now - this.lastCurrencyTap.at <= 360) {
        this.lastCurrencyTap = null;
        this.collectCurrencyItem(view);
      } else {
        this.lastCurrencyTap = { key, at: now };
        this.selectItem(key);
      }
      return;
    }

    const now = Date.now();
    syncEnergy(this.energy, now);
    if (this.energy.current <= 0) {
      const refillCost = energyRefillCost(this.energy, now);
      if (refillCost <= 40 && spendGems(this.economy, refillCost)) {
        recordEnergyRefillPurchase(this.energy, now);
        addEnergy(this.energy, ENERGY_CAP, now);
        this.updateCurrencyText();
        this.updateEnergyText();
        this.saveState();
        this.refreshActionTray(`ENERGY REFILLED  ·  ${this.energy.current}/${ENERGY_CAP}`);
        return;
      }
    }
    if (now >= this.nextAutoDispenserAt) {
      this.nextAutoDispenserAt = now + 1_000;
      const dispensers = [...this.views.values()].filter(
        (view): view is SpawnerView | CrateView | ResourceProducerView =>
          view instanceof SpawnerView || view instanceof CrateView || view instanceof ResourceProducerView
      );
      for (let offset = 0; offset < dispensers.length; offset++) {
        const index = (this.autoDispenserCursor + offset) % dispensers.length;
        const dispenser = dispensers[index];
        if (dispenser instanceof SpawnerView) {
          syncDispenser(dispenser.spawner, now);
          if (dispenser.spawner.charges <= 0 && msRemaining(dispenser.spawner, now) > 0) {
            const refillCost = rushCostGems(dispenser.spawner, now);
            if (!spendGems(this.economy, refillCost)) continue;
            refillDispenser(dispenser.spawner);
            dispenser.refresh(now);
            dispenser.playSpawnPulse();
            this.updateCurrencyText();
            this.saveState();
            this.autoDispenserCursor = (index + 1) % dispensers.length;
            break;
          }
          // Water already releases one stored item on its own one-second
          // timer. Auto-tapping it here gave it a second production pass.
          if (dispenser.spawner.typeId === 'water') continue;
          if (this.grid.emptyCells().length === 0 || dispenser.spawner.charges <= 0) continue;
          if (!canSpendEnergy(this.energy, ENERGY_COST_PER_COLLECT)) continue;
        } else if (dispenser instanceof ResourceProducerView) {
          if (this.grid.emptyCells().length === 0) continue;
        } else {
          const cell = this.grid.get(dispenser.gridPos);
          if (cell?.kind !== 'crate' || !crateReady(cell.readyAt, now)) continue;
          const next = cell.remaining[0];
          const needsBoardCell = next?.kind === 'item' || next?.kind === 'spawner-piece';
          if (needsBoardCell && this.grid.emptyCells().length === 0) continue;
        }
        this.autoDispenserCursor = (index + 1) % dispensers.length;
        if (dispenser instanceof SpawnerView) this.spawnFromSpawner(dispenser);
        else if (dispenser instanceof CrateView) this.tapCrate(dispenser);
        else this.tapResourceProducer(dispenser);
        break;
      }
    }

    const mergeTier = (view: BoardView): number => {
      if (view instanceof TileView || view instanceof SpawnerPieceView) return view.tier;
      if (view instanceof SpawnerView) return view.spawner.tier;
      return Number.POSITIVE_INFINITY;
    };
    const entries = [...this.views.entries()]
      .sort(([, a], [, b]) => mergeTier(a) - mergeTier(b));
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        let [fromKey, fromView] = entries[i];
        let [targetKey, targetView] = entries[j];
        if (!this.canMergeViews(fromView, targetView)) {
          if (!this.canMergeViews(targetView, fromView)) continue;
          [fromKey, targetKey] = [targetKey, fromKey];
          [fromView, targetView] = [targetView, fromView];
        }
        const [fromCol, fromRow] = fromKey.split(',').map(Number);
        const [targetCol, targetRow] = targetKey.split(',').map(Number);
        const fromCell = { col: fromCol, row: fromRow };
        const targetCell = { col: targetCol, row: targetRow };
        const target = this.cellToWorld(targetCell);
        this.draggingView = fromView;
        // A programmatic move, not a finger: mark it as a real drag so the
        // release resolves as a move rather than as a tap on the source cell.
        this.dragActive = true;
        this.dragFromCell = fromCell;
        this.dragStartPointer = this.cellToWorld(fromCell);
        await this.onPointerUp({ x: target.x, y: target.y } as Phaser.Input.Pointer);
        return;
      }
    }
  }

  // ---- Orders ----

  private orderProgressSource(): OrderProgressSource {
    return {
      countAtTier: (tier, typeId) => this.grid.countAtTier(tier, typeId),
      dispenserCollects: this.dispenserCollectCount
    };
  }

  /** Geometry shared by the order bar's build and refresh passes. */
  private orderBarMetrics(): { cardH: number; y: number; viewW: number } {
    // `viewW` is the CARD lane only - the ring sits outside it at the left.
    const fullscreenY = this.boardOriginY
      - ORDER_CARD_H * this.chromeScale
      - Math.round(10 * this.hudScale);
    return {
      // LOCAL height: the cards are drawn at their tuned size and scaled as a
      // unit, so everything inside them - rows, plates, GO chip, text - grows
      // together instead of a taller card holding the same small contents.
      cardH: ORDER_CARD_H,
      // In fullscreen the board gains vertical breathing room. Keep the
      // orders attached to the board instead of leaving them behind under
      // the header, which created the large empty band seen on tall phones.
      y: fullscreenElement()
        ? fullscreenY
        : this.contentTop + Math.round(48 * this.chromeScale),
      viewW: COLS * this.cellSize - this.crateLaneW()
    };
  }

  /**
   * Builds one card per open order slot inside a horizontally scrolling,
   * masked container.
   *
   * Slot count grows with player level (3 at the start, up to
   * MAX_ORDER_SLOTS), so this tears down and rebuilds rather than assuming a
   * fixed count - `refreshOrderBar` calls it whenever the count changes.
   *
   * Each card gets its OWN container, with every child at local coordinates.
   * That is what lets a card be repositioned or animated by moving one
   * object, which both the content-driven widths and the reorder slide
   * depend on. Sizes and positions are all set by `refreshOrderBar`, since
   * they follow from content that is not known yet here.
   */
  private buildOrderBar(): void {
    this.destroyOrderBar();

    const { cardH, y, viewW } = this.orderBarMetrics();
    const slots = this.orderState.activeOrderIndices.length;

    // Above the board. Tiles, dispensers and the glass pane all draw at the
    // default depth, so the GO chip - which now hangs below its card, over the
    // top of the board - was coming out behind a piece or its outline. 8 clears
    // every board object and the expansion locks (4-7) while staying under the
    // HUD chips at 20.
    const container = this.add.container(0, 0).setDepth(8);
    this.orderBarContainer = container;

    for (let position = 0; position < slots; position++) {
      const root = this.add.container(this.boardOriginX, y);
      const bg = this.add.graphics();
      const progress = this.add.text(ORDER_CARD_PAD, cardH - 8, '', {
        resolution: textResolution,
        fontFamily: Theme.fontMono,
        fontSize: '9px',
        color: hex(Theme.textOnDarkMuted)
      }).setOrigin(0, 1);
      const zone = this.add.zone(0, cardH / 2, ORDER_CARD_MIN_W, cardH)
        .setInteractive({ useHandCursor: true });

      // Tap vs. drag, same rule the shop uses: a card must not fire when the
      // player was actually flicking the bar sideways to reach another order.
      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        this.orderDrag = { active: true, slot: position, startX: pointer.x, startScroll: this.orderScroll, moved: 0, describe: null };
      });

      root.add([bg, progress, zone]);
      container.add(root);
      this.orderCards.push({ root, bg, progress, rewardTexts: [], zone, width: ORDER_CARD_MIN_W });
    }

    // The mask is world-space and NOT on the display list, so it stays put
    // while the container slides under it - hence the explicit destroy in
    // destroyOrderBar.
    const maskShape = this.make.graphics({});
    maskShape.fillStyle(0xffffff);
    // Tall enough for the overhanging pill above and the GO chip below,
    // or the scroll mask clips exactly the parts that moved outside.
    maskShape.fillRect(
      this.boardOriginX + this.crateLaneW(),
      y - 4 * this.chromeScale,
      viewW,
      (cardH + ORDER_GO_H + 8) * this.chromeScale
    );
    this.orderBarMaskShape = maskShape;
    container.setMask(maskShape.createGeometryMask());
    container.x = -this.orderScroll;

    // Edge fades: the only cue that more orders exist off-screen, since the
    // bar has no room for a scrollbar without stealing a card's height.
    this.orderScrollHint = this.add.graphics().setDepth(8);
  }

  private inventoryButtonBounds(): Phaser.Geom.Rectangle {
    const x = this.boardOriginX;
    const y = this.boardOriginY + ROWS * this.cellSize + this.boardToTrayGap;
    // Generous on purpose: a drop target the size of the drawn chip is
    // fiddly to hit with a fingertip that is already holding a tile.
    return new Phaser.Geom.Rectangle(x - 3, y - 3, 48, 37);
  }

  private isOverInventoryButton(x: number, y: number): boolean {
    return Phaser.Geom.Rectangle.Contains(this.inventoryButtonBounds(), x, y);
  }

  /** Level milestone crates are automatic physical rewards, never profile claims. */
  private autoDeliverLevelRewards(): { level: number; tier: CrateTier }[] {
    const earned = pendingMilestones(this.rewards, playerLevel(this.orderState));
    if (earned.length === 0) return earned;
    const from = { x: this.levelBadgeText.x, y: this.levelBadgeText.y };
    for (const reward of earned) {
      claimMilestone(this.rewards, reward.level);
      this.awardCrate(reward.tier, `LEVEL ${reward.level} REWARD`, from);
    }
    this.updateLevelBadge();
    this.saveState();
    return earned;
  }

  /**
   * Moves a dragged board piece into storage. Returns false when it cannot
   * go - full inventory, or a locked tile - so the caller snaps it back.
   */
  private storeDraggedView(view: BoardView, fromCell: GridPosition): boolean {
    const cell = this.grid.get(fromCell);
    if (!cell) return false;

    let entry: StoredItem | null = null;
    let label = '';
    if (view instanceof CrateView && cell.kind === 'crate') {
      // Carries its REMAINING contents, so tidying a part-emptied crate away
      // never refills or resets it.
      // `readyAt` travels with it. Without this, storing a sealed supply crate
      // and taking it back out cleared its timer and it opened immediately -
      // and it also freed a SUPPLY_CRATE_LIMIT slot while still sealed, so the
      // cap could be sidestepped by shuffling crates through the inventory.
      entry = { kind: 'crate', tier: cell.tier, remaining: cell.remaining, readyAt: cell.readyAt };
      label = CRATE_LABELS[cell.tier as CrateTier];
    } else if (view instanceof ResourceProducerView && cell.kind === 'resource-producer') {
      entry = { kind: 'resource-producer', producerId: cell.producerId, remaining: cell.remaining, tier: 1 };
      label = RESOURCE_PRODUCERS[cell.producerId].label.toUpperCase();
    } else if (view instanceof TileView) {
      if (view.locked) {
        this.refreshActionTray('LOCKED ITEMS CANNOT BE STORED\nMERGE A MATCH ONTO IT TO UNLOCK');
        return false;
      }
      entry = { kind: 'item', typeId: view.typeId, tier: view.tier };
      label = familyTierLabel(view.typeId, view.tier);
    } else if (view instanceof SpawnerPieceView) {
      entry = { kind: 'spawner-piece', typeId: view.typeId, tier: view.tier };
      label = spawnerPieceLabel(view.typeId, view.tier);
    }
    if (!entry) return false;

    if (!storeItem(this.inventory, entry)) {
      this.refreshActionTray(
        `INVENTORY FULL  ·  ${this.inventory.slots}/${this.inventory.slots}\nOPEN IT TO BUY A SLOT OR TAKE SOMETHING OUT`
      );
      return false;
    }

    this.grid.set(fromCell, null);
    this.views.delete(this.keyOf(fromCell));
    if (this.selectedItemKey === this.keyOf(fromCell)) this.selectedItemKey = null;
    view.destroy();
    this.refreshInventoryButton();
    this.playInventoryNudge();
    this.tryReleaseVaultItem();
    this.tryDeliverMeterGold();
    this.saveState();
    this.refreshOrderBar();
    this.checkDeadlock();
    this.refreshActionTray(`${label} STORED\n${freeSlots(this.inventory)} INVENTORY SLOTS FREE`);
    return true;
  }

  /** World-space centre of a card, for the delivery animation to fly toward. */
  private orderCardWorldCenter(position: number): { x: number; y: number } | null {
    const view = this.orderCards[position];
    if (!view || !this.orderBarContainer) return null;
    return {
      x: this.orderBarContainer.x + view.root.x + view.width / 2,
      y: view.root.y + (ORDER_CARD_H / 2) * this.chromeScale
    };
  }

  private destroyOrderBar(): void {
    // The cooldown meter temporarily lives inside the scrolling order
    // container. Detach it before destroying/rebuilding that container so the
    // meter itself is not destroyed with the cards.
    if (this.crateMeterContainer?.parentContainer === this.orderBarContainer) {
      this.orderBarContainer?.remove(this.crateMeterContainer);
      this.add.existing(this.crateMeterContainer);
    }
    this.orderScrollTween?.stop();
    this.orderScrollTween = null;
    for (const view of this.orderCards) for (const text of view.rewardTexts) text.destroy();
    this.orderCards = [];
    this.orderDisplayOrder = [];
    this.orderBarContainer?.destroy(true);
    this.orderBarContainer = null;
    this.orderBarMaskShape?.destroy();
    this.orderBarMaskShape = null;
    this.orderScrollHint?.destroy();
    this.orderScrollHint = null;
  }

  /**
   * Tells the player the bar moves. Two cues, because the fades alone were
   * not enough - they read as the board panel overlapping the cards rather
   * than as content continuing past the edge.
   *
   * The track and thumb are the SAME idiom the shop's scrolling list already
   * uses (4px, `Theme.bg` track, `Theme.borderOnDark` thumb), just turned on
   * its side, so the game keeps one scroll language instead of growing a
   * second one. The thumb also answers "how much more is there", which an
   * arrow or a chevron would not.
   */
  private drawOrderScrollHint(): void {
    const hint = this.orderScrollHint;
    if (!hint) return;
    hint.clear();
    if (this.orderScrollMax <= 0) return;

    const { cardH, y, viewW } = this.orderBarMetrics();

    // Edge fades only. The track-and-thumb slider that used to sit directly
    // under the cards is gone: it read as chrome, and it occupied exactly the
    // strip the GO chip now overhangs into. The fades plus the one-time peek
    // nudge already say the bar continues and can be dragged.
    //
    // Fades are lifted above the board glass - the hint is created with the
    // order bar, before drawBoardBackground runs, so without this it renders
    // underneath the panel.
    this.children.bringToTop(hint);
    const fadeW = 18;
    const bands = 6;
    const laneX = this.boardOriginX + (isMeterCooling(this.rewards) ? 0 : this.crateLaneW());
    const visibleW = isMeterCooling(this.rewards) ? COLS * this.cellSize : viewW;
    if (this.orderScroll > 1) {
      for (let i = 0; i < bands; i++) {
        hint.fillStyle(Theme.bg, 0.55 * (1 - i / bands));
        // Scaled, like the cards it fades: the raw band sat high and stopped
        // short of the bottom of a scaled card.
        hint.fillRect(laneX + (fadeW / bands) * i, y - 2 * this.chromeScale, fadeW / bands + 1, (cardH + 4) * this.chromeScale);
      }
    }
    if (this.orderScroll < this.orderScrollMax - 1) {
      const right = laneX + visibleW;
      for (let i = 0; i < bands; i++) {
        hint.fillStyle(Theme.bg, 0.55 * (1 - i / bands));
        hint.fillRect(right - (fadeW / bands) * (i + 1), y - 2 * this.chromeScale, fadeW / bands + 1, (cardH + 4) * this.chromeScale);
      }
    }

  }

  /**
   * A single nudge on first sight of an overflowing bar: slides a little way
   * and settles back, which is the one cue that says the thing is DRAGGABLE
   * rather than merely wider than the screen. Fires once per session, never
   * while the player is already touching the bar, and never if they have
   * already scrolled it themselves.
   */
  private peekOrderScroll(): void {
    if (this.orderDrag.active || this.orderScrollMax <= 0 || this.orderScroll > 1) return;
    this.orderScrollTween?.stop();
    this.orderScrollTween = this.tweens.addCounter({
      from: 0,
      to: Math.min(22, this.orderScrollMax),
      duration: 300,
      ease: 'Quad.Out',
      yoyo: true,
      hold: 110,
      onUpdate: (tween) => {
        if (this.orderDrag.active) {
          tween.stop();
          return;
        }
        this.setOrderScroll(tween.getValue() ?? 0);
      },
      onComplete: () => {
        if (!this.orderDrag.active) this.setOrderScroll(0);
      }
    });
  }

  private setOrderScroll(value: number): void {
    this.orderScroll = Phaser.Math.Clamp(value, 0, this.orderScrollMax);
    if (this.orderBarContainer) this.orderBarContainer.x = -this.orderScroll;
    this.drawOrderScrollHint();
  }

  private refreshOrderBar(): void {
    // Level-ups open new slots, so the bar is rebuilt whenever the queue
    // length moves rather than being assumed fixed.
    const rebuilt = this.orderCards.length !== this.orderState.activeOrderIndices.length;
    if (rebuilt) this.buildOrderBar();

    const orders = activeOrders(this.orderState);
    const source = this.orderProgressSource();
    const { cardH, y, viewW } = this.orderBarMetrics();
    const cooling = isMeterCooling(this.rewards);
    const laneX = this.boardOriginX + (cooling ? 0 : this.crateLaneW());
    const visibleW = cooling ? COLS * this.cellSize : viewW;
    if (this.orderBarMaskShape) {
      this.orderBarMaskShape.clear();
      this.orderBarMaskShape.fillStyle(0xffffff);
      // Scaled, exactly like the rect `buildOrderBar` lays down. Redrawing it
      // with the raw constants quietly undid that on the first refresh, and a
      // mask shorter than the scaled cards shaves their bottom edge - and
      // clips the crate meter, which rides inside this same container while
      // the meter is cooling.
      this.orderBarMaskShape.fillRect(
        laneX,
        y - 4 * this.chromeScale,
        visibleW,
        (cardH + ORDER_GO_H + 8) * this.chromeScale
      );
    }

    // Completable orders move to the LEFT so the ones you can act on are
    // always the first cards - visible without scrolling, which is the whole
    // point of surfacing them. An insertion, not a swap: see
    // `orderDisplaySequence`, which owns the rule and is unit-tested.
    const statuses = orders.map(({ order }) => orderProgress(order, this.orderState, source));
    this.orderDisplayOrder = orderDisplaySequence(statuses.map((s) => s.ready));

    // Newly completable work is worth surfacing: if the bar is scrolled away
    // from the left when an order becomes ready, it would otherwise slide to
    // a position the player cannot see. Only fires when the ready COUNT
    // rises, so idle browsing is never yanked around.
    const readyCount = statuses.filter((s) => s.ready).length;
    if (readyCount > this.orderReadyCount && this.orderScroll > 1 && !this.orderDrag.active) {
      this.animateOrderScrollTo(0);
    }
    this.orderReadyCount = readyCount;

    // A reward token on an order card. `kind` swaps the letter code for the
    // currency's drawn mark; XP and a source reward have no mark and keep
    // their words.
    type CompactReward = {
      label: string;
      color: number;
      kind?: CurrencyKind;
      art?: 'shipping';
      size?: number;
      bold?: boolean;
    };
    const ROW_GAP = 5;
    /**
     * Requirement icon box. The band between the title and the reward rows is
     * ~35px, and `iconPresentation` scales art to roughly half its box, so a
     * smaller number here buys nothing but a shape too small to recognise -
     * which would defeat the whole point of drawing it.
     */
    const REQ_ICON = 38;
    /** Requirement tokens need more air than text tokens - each is a picture. */
    const REQ_GAP = 4;
    const REQ_ROW_Y = ORDER_HEADER_H + 5;
    /** The bevelled square each requirement sits in. */
    const REQ_PLATE = 38;
    /**
     * Art size inside the plate. `iconPresentation` draws at roughly half of
     * what it is given, so this is deliberately larger than the plate - it
     * makes the item nearly fill its square, as in the reference.
     */
    const REQ_ICON_ART = 52;
    /** The unlit plate: a recessed slot, still visibly a square. */
    const REQ_PLATE_DARK = 0x14120f;
    const innerW = (width: number) => width - ORDER_CARD_PAD * 2;

    /**
     * One requirement as the ITEM ITSELF plus its count, rather than the
     * item's name in words. A player matching an order against their board is
     * comparing shapes, so a card that shows the shape removes the
     * translation step - the full name still exists in the order info box.
     */
    const buildRequirementIcon = (
      view: OrderCardView,
      queueSlot: number,
      cardReady: boolean,
      line: { typeId: string; tier: number; count: number; ready: boolean },
      rowY: number
    ): Phaser.GameObjects.Container => {
      const def = getTierDef(line.typeId, line.tier);
      const baseColor = def?.color ?? 0x555555;

      // Each requirement sits in a bevelled square, and it is the SQUARE that
      // lights up when the board can satisfy it - not the item.
      //
      // Recolouring the item itself never worked: an item is already a shaded
      // object, so pushing it toward white destroyed the shading that makes it
      // recognisable, and a halo behind it read as decoration. A plate has no
      // such job - going from recessed to lit is the only thing it does.
      const plate = this.add.graphics();
      const half = REQ_PLATE / 2;
      const px = REQ_ICON / 2;
      // Same corner radius as the order card the plate sits on, so the two
      // are cut from the same shape language.
      const radius = Theme.radiusChip;

      // Same recessed slot in both states - the difference is the GREEN, not
      // a change of material. The bone-coloured lit plate that used to sit
      // here read as a hole punched in the card.
      plate.fillStyle(REQ_PLATE_DARK, 1);
      plate.fillRoundedRect(px - half, -half, REQ_PLATE, REQ_PLATE, radius);
      // Inner shadow along the top edge. The board, the card and the slot
      // were three near-identical values stacked on each other, which is why
      // the squares never read as INSET - fixed by pushing the slot down the
      // value range rather than pulling the card up it, so the dark
      // aesthetic is unchanged.
      plate.fillStyle(0x000000, 0.35);
      plate.fillRect(px - half + 1, -half + 1, REQ_PLATE - 2, REQ_PLATE * 0.22);
      if (line.ready) {
        // The acid green that used to flood the whole card, spent here
        // instead: it now marks WHICH requirement the board can satisfy
        // rather than only that the order as a whole is done.
        plate.fillStyle(Theme.accentGreen, 0.28);
        plate.fillRoundedRect(px - half, -half, REQ_PLATE, REQ_PLATE, radius);
        // Lit along the top edge, from the same fixed upper-left key every
        // drawn object in the game shares.
        plate.fillStyle(Theme.accentGreen, 0.16);
        plate.fillRect(px - half + 1, -half + 1, REQ_PLATE - 2, REQ_PLATE * 0.45);
      }
      plate.lineStyle(Theme.borderWidth, line.ready ? Theme.accentGreen : Theme.borderOnDark, line.ready ? 0.85 : 0.5);
      plate.strokeRoundedRect(px - half, -half, REQ_PLATE, REQ_PLATE, radius);

      // The item keeps its own colour in both states. It is the item.
      const icon = this.add.graphics();
      const render = drawTierIcon(
        icon, line.typeId, line.tier, REQ_ICON_ART, materialLighting(baseColor, line.tier)
      );
      icon.setAlpha(render.materialAlpha);
      const present = iconPresentation(line.typeId, line.tier, REQ_ICON_ART);

      // The board's own contact shadow, so an item sits ON the plate rather
      // than floating in front of it - the single cue that made board tiles
      // read as objects. Sized from the measured footprint, exactly as
      // TileView does it.
      const shadow = this.add.graphics();
      const { width: fw, centerX, baselineY } = render.footprint;
      if (fw > 0) {
        // Tighter than the board's, and pulled back up under the item: the
        // board version trails down and to the right into open space, which
        // here ran straight off the edge of the plate.
        for (let i = 3; i >= 1; i--) {
          shadow.fillStyle(0x000000, (line.ready ? 0.09 : 0.07) * i);
          shadow.fillEllipse(
            centerX + fw * 0.035 * i,
            baselineY - fw * 0.09 + fw * 0.022 * i,
            fw * (0.78 - i * 0.05),
            fw * 0.17
          );
        }
      }
      for (const g of [shadow, icon]) {
        g.setScale(present.scale).setPosition(px + present.offsetX, present.offsetY);
      }

      const token = this.add.container(0, rowY, [plate, shadow, icon]);
      // The plate is its own press target, sitting above the card's zone so
      // `topOnly` routes the press here. It still arms the bar's horizontal
      // drag, or the bar could not be flicked from an icon - only the TAP
      // resolves differently.
      const press = this.add.zone(px, 0, REQ_PLATE, REQ_PLATE).setInteractive();
      press.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        this.orderDrag = {
          active: true,
          slot: queueSlot,
          startX: pointer.x,
          startScroll: this.orderScroll,
          moved: 0,
          // Only an order that CANNOT be delivered describes its items. Once
          // it can, the whole card is one button - asking the player to aim
          // between the icons to complete an order they have already earned
          // is a trap the card's own readiness invites them into.
          describe: cardReady ? null : { typeId: line.typeId, tier: line.tier }
        };
      });
      token.add(press);
      // Only MULTIPLES are worth a number. "x1" on every single-item order is
      // noise on the one card the player reads at a glance.
      if (line.count > 1) {
        const badge = this.add.text(0, 0, `×${line.count}`, {
          resolution: textResolution,
          fontFamily: Theme.fontNumeric,
          fontSize: '9px',
          fontStyle: 'bold',
          color: hex(line.ready ? Theme.accentGreen : Theme.textOnDark)
        }).setOrigin(0.5, 0.5);
        // Its own chip. Every other label in the game sits on a panel; this
        // one is drawn over ITEM ART, which is the busiest surface on the
        // card and the only place a bare number has nothing behind it.
        const bw = badge.width + 8;
        const bh = 13;
        const bx = REQ_ICON - 2 - bw / 2;
        const by = -REQ_PLATE / 2 + bh / 2 + 2;
        const chip = this.add.graphics();
        chip.fillStyle(Theme.bg, 0.92);
        chip.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, Theme.radiusChip);
        chip.lineStyle(1, line.ready ? Theme.accentGreen : Theme.borderOnDark, 1);
        chip.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, Theme.radiusChip);
        badge.setPosition(bx, by);
        token.add([chip, badge]);
      }
      token.setSize(REQ_ICON, REQ_ICON);
      view.root.add(token);
      view.rewardTexts.push(token);
      return token;
    };

    /** Creates a row of tokens at local coords and reports its natural width. */
    const buildRow = (view: OrderCardView, tokens: CompactReward[], rowY: number) => {
      const texts = tokens.map((token) => {
        // Containers centre on their y; a text object's default origin is its
        // top-left. Both are anchored to the same visual row explicitly.
        const built = token.art === 'shipping'
          ? (() => {
              const icon = this.add.graphics().setX(15);
              drawCrate(icon, 30, 'shipping');
              return this.add.container(0, rowY, [icon]).setSize(30, 30);
            })()
          : token.kind
            ? currencyLabel(this, token.label, token.kind, {
              fontSize: 11,
              glyphSize: 17,
              gap: 3,
              color: token.color
            }).setPosition(0, rowY)
            : this.add.text(0, rowY, token.label, {
                resolution: textResolution,
                fontFamily: Theme.fontNumeric,
                fontSize: `${token.size ?? 11}px`,
                fontStyle: token.bold === false ? 'normal' : 'bold',
                color: hex(token.color)
              }).setOrigin(0, 0.5);
        view.root.add(built);
        view.rewardTexts.push(built);
        return built;
      });
      const natural = texts.reduce((sum, t) => sum + t.width, 0) + ROW_GAP * Math.max(0, texts.length - 1);
      return { texts, natural, gap: ROW_GAP, align: 'center' as 'center' | 'left', fluid: false };
    };

    // PASS 1 - build every card's content and measure it. A width cannot be
    // chosen until its text exists, and a position cannot be chosen until
    // every width is known, so layout is deliberately split in two.
    // Card index IS the queue slot. Each card object owns one order for that
    // order's whole life; only its POSITION in the row changes.
    //
    // This used to be the other way round - cards were bound to screen
    // positions and had their content rewritten when the display order
    // changed. Nothing ever moved, so a completable order arriving at the
    // front was an instant content swap with no motion to follow, which is
    // exactly what made it read as a pop. The slide below could never fire
    // either, because a card's target x was always the x it already had.
    const built = this.orderCards.map((view, queueSlot) => {
      const active = orders[queueSlot];
      for (const text of view.rewardTexts) text.destroy();
      view.rewardTexts = [];
      if (!active) return null;

      const { order } = active;
      const status = statuses[queueSlot];

      // The GO chip. Nothing on a ready card actually said "tap me" - the
      // green plates and the move to the front of the queue both read as
      // status rather than as an invitation, which is the one thing the
      // reference cards do that ours did not.
      view.progress
        .setText('GO')
        .setFontSize(11)
        .setColor(hex(Theme.bg))
        .setVisible(status.ready);

      // Requirements are DRAWN, side by side on one row: the item's own art
      // with its count beside it. They used to be one full name per line,
      // which is what the order info box is for - the card is the thing the
      // player scans against their board, and a shape matches a shape faster
      // than a name does.
      //
      // A collection order has no item to draw, so it keeps its words.
      const requirementRows = order.type === 'dispenser-collects'
        // Two stacked rows: the label, then a LIVE count under it. Collection
        // orders are the one case where a running total is worth showing -
        // there is no item on the board to light up, so the number is the
        // only progress the card can carry.
        ? [
            buildRow(view, [{
              // Sized so a collection card comes out the same width as an
              // item card. At 11px the text set the width and this card came
              // out visibly wider than every other one in the row.
              label: `SPEND ${status.target} ENERGY`,
              color: status.ready ? Theme.accentGreen : Theme.textOnDark,
              size: 9
            }], REQ_ROW_Y + REQ_ICON / 2 - 6),
            buildRow(view, [{
              label: `${status.current}/${status.target}`,
              color: status.ready ? Theme.accentGreen : Theme.textOnDark,
              size: 11,
              bold: false
            }], REQ_ROW_Y + REQ_ICON / 2 + 8)
          ]
        : [(() => {
            const tokens = status.lines.map((line) => buildRequirementIcon(view, queueSlot, status.ready, {
              typeId: line.requirement.typeId,
              tier: line.requirement.tier,
              count: line.requirement.count,
              ready: line.ready
            }, REQ_ROW_Y + REQ_ICON / 2));
            const natural = tokens.reduce((sum, t) => sum + t.width, 0)
              + REQ_GAP * Math.max(0, tokens.length - 1);
            return { texts: tokens, natural, gap: REQ_GAP, align: 'center' as 'center' | 'left', fluid: false };
          })()];

      const primary: CompactReward[] = [
        { label: `+${order.rewardCoins}`, color: Theme.currencyCredit, kind: 'credit' }
        // No XP figure anywhere player-facing - see the profile panel for why.
        // The order's other rewards are what the card is for; XP is carried by
        // the level bar instead of by a number on every card.
      ];
      const secondary: CompactReward[] = [];
      if (order.rewardEnergy) {
        secondary.push({ label: `+${order.rewardEnergy}`, color: Theme.currencyEnergy, kind: 'energy' });
      }
      if (order.rewardGems) {
        secondary.push({ label: `+${order.rewardGems}`, color: Theme.currencyGem, kind: 'gem' });
      }
      if (order.rewardSpawner) {
        secondary.push({
          label: '+SRC',
          color: getTierDef(order.rewardSpawner.typeId, 1)?.color ?? Theme.accentGreen
        });
      }
      if (order.rewardShippingContainer) {
        secondary.push({ label: '', color: 0x9fb2bd, art: 'shipping' });
      }

      // ONE reward line, and it sits ABOVE the card rather than inside it.
      // Credits and gems/energy are the same kind of information; stacked on
      // two rows at the card's dimmest edge they competed with each other and
      // made the card bottom-heavy. Lifting them out - and the GO chip below
      // - leaves the body as nothing but slots.
      // Reward on the header's left, GO on its right - see ORDER_HEADER_H.
      const rewardRow = buildRow(view, [...primary, ...secondary], (ORDER_BAR_TOP + ORDER_HEADER_H) / 2);
      rewardRow.align = 'left';
      // The reward bar is its OWN element, sized to what is in it - like the
      // HUD currency chips. It does not stretch to the card and the card does
      // not stretch to it; it just extends rightward as its contents grow.
      rewardRow.fluid = true;
      const rows = [...requirementRows, rewardRow];

      // No title to size against any more: the card is its contents.
      // Width comes from the SLOTS, but never less than the reward bar needs.
      // The bar still sizes itself to its own contents - it just cannot hang
      // off the end of the tray any more, which a two-reward order did.
      const widest = Math.max(rewardRow.natural, ...requirementRows.map((row) => row.natural));
      const width = Phaser.Math.Clamp(
        Math.ceil(widest) + ORDER_CARD_PAD * 2,
        ORDER_CARD_MIN_W,
        ORDER_CARD_MAX_W
      );
      return { view, status, rows, width };
    });

    // PASS 2 - size, paint and place. A running cursor rather than
    // `position * cardW`, since cards no longer share a width.
    let cursor = laneX;
    // Walked in DISPLAY order while the cards themselves stay bound to their
    // queue slots - which is what turns a reorder into a change of x, and
    // therefore into something that can be animated.
    for (const queueSlot of this.orderDisplayOrder) {
      const entry = built[queueSlot];
      if (!entry) continue;
      const { view, status, rows, width } = entry;
      view.root.setScale(this.chromeScale);
      // Bookkeeping is WORLD width - callers use it to find a card's centre
      // on screen - while everything inside the card stays in local units.
      view.width = width * this.chromeScale;

      view.bg.clear();
      // NO outer card panel. There were three stacked shapes - an outer card,
      // a reward bar and a slot tray - and the outer one was doing nothing but
      // putting a second border around the other two. The card IS the reward
      // bar plus the slot tray, sitting directly on the board.

      // Only content that hit the MAX width cap still needs squeezing.
      for (const row of rows) {
        // A fluid row keeps its size and runs on past the card if it has to.
        const scale = row.fluid ? 1 : Math.min(1, innerW(width) / Math.max(1, row.natural));
        // Centred, not left-aligned. Without a title the card is just its
        // contents, and a lone icon pinned to the left edge left most of the
        // card empty.
        let x = row.align === 'left'
          ? ORDER_CARD_PAD
          : Math.max(ORDER_CARD_PAD, (width - row.natural * scale) / 2);
        for (const text of row.texts) {
          text.setX(x).setScale(scale);
          // Each row carries its own gap: a row of pictures needs more air
          // between tokens than a row of text, and measuring with one gap
          // while packing with another leaves the row misaligned.
          x += (text.width + row.gap) * scale;
        }
      }

      // The reward BAR: its own shape, hugging its own contents. Shorter than
      // the card is fine and expected; longer is allowed too, and it simply
      // runs past the edge rather than dragging the card wider with it.
      const rewardNatural = rows[rows.length - 1]?.natural ?? 0;
      const barW = rewardNatural + ORDER_CARD_PAD * 2;
      // Drawn BEFORE the tray and running past its top edge, so the tray
      // paints over the bar's lower half. Only the top of the bar is ever
      // seen - its bottom bevels finish behind the card, which is what makes
      // it read as a tab slotted in behind rather than a chip stuck on front.
      // Same translucent glass as the board pane: nothing sits behind the bar
      // any more, so it can let the room show through exactly as the board
      // does, which ties the two together without a new colour.
      view.bg.fillStyle(Theme.bgElevated, 0.84);
      view.bg.fillRoundedRect(0, ORDER_BAR_TOP, barW, ORDER_BAR_H, Theme.radiusChip);
      view.bg.lineStyle(1, Theme.borderOnDark, 1);
      view.bg.strokeRoundedRect(0, ORDER_BAR_TOP, barW, ORDER_BAR_H, Theme.radiusChip);

      // The SLOTS get their own inset tray beneath it, and that change of
      // material is what divides the two.
      // Full width now that nothing sits behind it, and flush-left with the
      // reward bar above so the two share an edge.
      view.bg.fillStyle(Theme.bg, 0.9);
      view.bg.fillRoundedRect(0, ORDER_HEADER_H, width, cardH - ORDER_HEADER_H, Theme.radiusChip);
      view.bg.lineStyle(Theme.borderWidth, Theme.borderOnDark, 1);
      view.bg.strokeRoundedRect(0, ORDER_HEADER_H, width, cardH - ORDER_HEADER_H, Theme.radiusChip);

      if (status.ready) {
        // Centred over the REWARD BAR, not over the card: the bar hugs its
        // own contents and can be much narrower than the card, so aligning to
        // the card put the chip off to one side of the thing it belongs to.
        const gx = (barW - ORDER_GO_W) / 2;
        // Straddling the card's bottom edge - half on the card, half off it.
        // Below the top edge it reached into the header band, where a ready
        // order could sit under the currency chips; underneath there is
        // nothing but the board.
        const gy = cardH - ORDER_GO_H / 2;
        const goLighting = materialLighting(Theme.accentGreen, 5);
        view.bg.fillGradientStyle(goLighting.highlight, goLighting.light, goLighting.base, goLighting.dark, 1);
        view.bg.fillRoundedRect(gx, gy, ORDER_GO_W, ORDER_GO_H, Theme.radiusChip);
        view.progress.setPosition(gx + ORDER_GO_W / 2, gy + ORDER_GO_H / 2).setOrigin(0.5, 0.5);
      }

      // Reaches DOWN over the half of the GO chip that hangs past the card.
      const below = status.ready ? ORDER_GO_H / 2 + 1 : 0;
      view.zone.setPosition(width / 2, (cardH + below) / 2).setSize(width, cardH + below);
      const hit = view.zone.input?.hitArea as Phaser.Geom.Rectangle | undefined;
      hit?.setTo(0, 0, width, cardH + below);

      // Cards SLIDE to their new position rather than jumping, on the same
      // 140ms Quad.Out as TileView.snapTo - so an order reordering itself
      // reads like two board pieces trading places, which is the one
      // move-animation the player already knows.
      const targetX = cursor;
      this.tweens.killTweensOf(view.root);
      if (rebuilt || view.root.x === targetX) {
        view.root.setPosition(targetX, y);
      } else {
        view.root.y = y;
        this.tweens.add({ targets: view.root, x: targetX, duration: ORDER_REORDER_MS, ease: 'Quad.Out' });
      }
      cursor += width * this.chromeScale + ORDER_CARD_GAP;
    }

    if (cooling && this.orderBarContainer && this.crateMeterContainer) {
      const wasInQueue = this.crateMeterContainer.parentContainer === this.orderBarContainer;
      if (!wasInQueue) this.orderBarContainer.add(this.crateMeterContainer);
      // Even a short early-game order queue must put the cooling meter beyond
      // the visible edge. It remains reachable by swiping to the end.
      const targetLeft = Math.max(cursor, laneX + visibleW + ORDER_CARD_GAP);
      const targetX = targetLeft - this.boardOriginX;
      this.tweens.killTweensOf(this.crateMeterContainer);
      if (wasInQueue && Math.abs(this.crateMeterContainer.x - targetX) < 0.5) {
        this.crateMeterContainer.x = targetX;
      } else {
        this.tweens.add({
          targets: this.crateMeterContainer,
          x: targetX,
          duration: ORDER_REORDER_MS,
          ease: 'Quad.Out'
        });
      }
      cursor = targetLeft + this.crateLaneW();
    } else if (!cooling && this.crateMeterContainer?.parentContainer === this.orderBarContainer) {
      const worldX = this.orderBarContainer.x + this.crateMeterContainer.x;
      this.orderBarContainer.remove(this.crateMeterContainer);
      this.add.existing(this.crateMeterContainer);
      this.crateMeterContainer.x = worldX;
      this.tweens.killTweensOf(this.crateMeterContainer);
      this.tweens.add({
        targets: this.crateMeterContainer,
        x: 0,
        duration: ORDER_REORDER_MS,
        ease: 'Quad.Out'
      });
    }

    // Ready cards travel IN FRONT. They are the ones moving left through the
    // others, so they have to pass over rather than under - a card sliding
    // behind its neighbours is most of what made the movement hard to follow.
    if (this.orderBarContainer) {
      for (const queueSlot of this.orderDisplayOrder) {
        const entry = built[queueSlot];
        if (entry?.status.ready) this.orderBarContainer.bringToTop(entry.view.root);
      }
    }

    const contentW = Math.max(0, cursor - ORDER_CARD_GAP - laneX);
    this.orderScrollMax = Math.max(0, contentW - visibleW);
    this.setOrderScroll(this.orderScroll);

    // Delayed so the nudge lands after the board has finished appearing,
    // where it reads as a hint rather than as part of the load.
    if (!this.orderPeekShown && this.orderScrollMax > 0) {
      this.orderPeekShown = true;
      this.time.delayedCall(700, () => this.peekOrderScroll());
    }
  }

  /**
   * `queueSlot` is both the card and the order it holds: a card object owns
   * one queue slot for that order's whole life and merely moves around the
   * row, so the two can no longer diverge. The indirection through
   * `orderDisplayOrder` that used to be needed here is gone with it.
   */
  /**
   * Names an item tapped on an order CARD, in the same tray line the board
   * uses when that item is tapped in its cell. Nothing is selected and
   * nothing is sold - the card is not the board, so the sell action stays off.
   */
  private describeOrderItem(typeId: string, tier: number): void {
    if (this.modalOpen || this.inputLocked) return;
    const def = getTierDef(typeId, tier);
    this.selectedItemKey = null;
    this.rushTargetKey = null;
    this.refreshActionTray(
      `${def?.label?.toUpperCase() ?? 'ITEM'}
${familyTierLabel(typeId, tier)}`
    );
  }

  private submitOrderSlot(queueSlot: number): void {
    if (this.modalOpen || this.inputLocked) return;
    const active = activeOrders(this.orderState)[queueSlot];
    if (!active) return;
    const status = orderProgress(active.order, this.orderState, this.orderProgressSource());
    if (!status.ready) {
      this.showOrderDetails(active.order, status.current, status.target);
      return;
    }
    // The consuming animation flies to the CARD, which is now indexed by the
    // same number.
    if (active.order.type === 'deliver-items') this.consumeOrderItems(active.order, queueSlot);
    this.completeOrder(active.index, active.order, queueSlot);
  }

  /** Eases the order bar to a scroll offset, used when new work appears off-screen. */
  private animateOrderScrollTo(target: number): void {
    this.orderScrollTween?.stop();
    this.orderScrollTween = this.tweens.addCounter({
      from: this.orderScroll,
      to: Phaser.Math.Clamp(target, 0, this.orderScrollMax),
      duration: 220,
      ease: 'Quad.Out',
      // A drag beginning mid-tween must win immediately, or the bar would
      // fight the player's finger.
      onUpdate: (tween) => {
        if (this.orderDrag.active) {
          tween.stop();
          return;
        }
        this.setOrderScroll(tween.getValue() ?? 0);
      }
    });
  }

  private consumeOrderItems(order: OrderDef, slot: number): void {
    // Target the card that took them, so the flight visibly connects the
    // board to the order being filled. Resolved in WORLD space: card parts
    // now live in a per-card container inside the scrolling bar, so their
    // own x/y are local and would send items to the wrong place.
    const card = this.orderCardWorldCenter(slot);
    // One pass per requirement line. The stagger counter is shared across
    // lines so a three-line order still reads as a single sequence being
    // collected, not three simultaneous bursts.
    let delay = 0;
    for (const requirement of order.requirements) {
      let remaining = requirement.count;
      for (let row = 0; row < ROWS && remaining > 0; row++) {
        for (let col = 0; col < COLS && remaining > 0; col++) {
          const pos = { col, row };
          const cell = this.grid.get(pos);
          if (cell?.kind !== 'item' || cell.typeId !== requirement.typeId || cell.tier !== requirement.tier) continue;
          const key = this.keyOf(pos);
          const view = this.views.get(key);
          // The cell is freed and the view detached IMMEDIATELY, so the board
          // is playable the instant the order submits - the flight is purely
          // decorative and owns nothing the game state depends on.
          this.views.delete(key);
          this.grid.set(pos, null);
          if (this.selectedItemKey === key) this.selectedItemKey = null;
          if (view instanceof TileView && card) {
            this.children.bringToTop(view);
            // Staggered so two or three items read as a sequence being
            // collected rather than one blur leaving at once.
            void view.playDeliverTo(card.x, card.y, delay);
            delay += 90;
          } else {
            view?.destroy();
          }
          remaining--;
        }
      }
    }
  }


  // ---- Selection / sell tray ----

  /**
   * How many required items the board is still short, summed across lines.
   * Zero means the stage can be built.
   */
  /** Puts the board back after the full-screen room panel closes. */
  private restoreBoardAfterRoom(): void {
    for (const obj of this.roomHiddenForPanel) {
      (obj as Phaser.GameObjects.GameObject & { visible?: boolean }).visible = true;
    }
    this.roomHiddenForPanel = [];
    this.roomPanelOpen = false;
    this.game.canvas.style.zIndex = '';
  }

  private projectShortfall(stage: ProjectStage): number {
    return stage.requirements.reduce(
      (short, req) => short + Math.max(0, req.count - this.grid.countAtTier(req.tier, req.typeId)),
      0
    );
  }

  /**
   * The single answer to "does the project want the player's attention" -
   * shared by the level badge, the board button's dot and the profile panel,
   * which each used to re-derive it from the coin cost alone and would now
   * disagree about whether a stage was actually buildable.
   */
  private projectStageReady(): boolean {
    if (playerLevel(this.orderState) < 3) return false;
    return this.projectPieceAffordable() || this.projectUnlockReady();
  }

  /** A piece of the open stage the player could buy right now. */
  private projectPieceAffordable(): boolean {
    return roomPiecesForStage(this.projectStage)
      .some((piece) => !this.builtPieces.has(piece.key) && this.economy.coins >= piece.price);
  }

  /** Every piece a stage sells is bought. Stages with no pieces are trivially done. */
  private projectStageFurnished(stage: number): boolean {
    return roomPiecesForStage(stage).every((piece) => this.builtPieces.has(piece.key));
  }

  /**
   * The next stage can be unlocked.
   *
   * Furnishing the CURRENT stage is part of the gate: buying into stage 4
   * while stage 3 still has an empty corner would let the room fill out of
   * order and leave pieces sitting on supports that were never bought.
   */
  private projectUnlockReady(): boolean {
    const stage = PROJECT_STAGES[this.projectStage];
    if (!stage || playerLevel(this.orderState) < 3) return false;
    if (!this.projectStageFurnished(this.projectStage)) return false;
    return this.economy.coins >= stage.coins && this.projectShortfall(stage) === 0;
  }

  /**
   * Buys one piece of furniture and stands it in the room.
   *
   * The stage's reward waits for its LAST piece: a stage is finished when it
   * is furnished, not when it is unlocked, so the crate or the gems land on
   * the purchase that completes the look rather than on the one that opened
   * the list.
   */
  /**
   * Whether the thing this piece sits on has been bought.
   *
   * The stage table already keeps a support in an earlier-or-equal stage, but
   * within a stage the shelf can be bought in any order - so the books could
   * be bought before the bookcase they stand in, and would hang in the air
   * until it arrived.
   */
  private roomPieceSupported(piece: RoomPiece): boolean {
    return piece.restsOn == null || this.builtPieces.has(piece.restsOn);
  }

  private buyRoomPiece(piece: RoomPiece, from: { x: number; y: number }): boolean {
    if (piece.stage > this.projectStage) return false;
    if (this.builtPieces.has(piece.key)) return false;
    if (!this.roomPieceSupported(piece)) return false;
    if (!spendCoinsGeneric(this.economy, piece.price)) return false;
    this.builtPieces.add(piece.key);
    this.roomView?.setBuilt(this.builtPieces);
    if (this.projectStageFurnished(piece.stage)) {
      this.time.delayedCall(0, () => {
        this.grantStageReward(piece.stage, from);
        this.updateCurrencyText();
        this.saveState();
      });
    }
    this.updateCurrencyText();
    this.refreshProjectButton();
    this.updateLevelBadge();
    this.saveState();
    return true;
  }

  /** The one-off payout for finishing a stage's furniture. */
  private grantStageReward(stage: number, from: { x: number; y: number }): void {
    // The panel is usually still open behind the reward flying out of it, and
    // it was left showing the reward as pending until it was closed and
    // reopened. Redrawn at the end of this method.
    if (stage === 1) {
      addEnergy(this.energy, 25);
      this.playProjectCurrencyReward('energy', 25, from);
    } else if (stage === 2) {
      this.awardCrate('bronze', 'PROJECT REWARD', from);
    } else if (stage === 3) {
      addGems(this.economy, 10);
      this.playProjectCurrencyReward('gem', 10, from);
    } else if (stage === 4) {
      this.awardCrate('gold', 'PROJECT REWARD', from);
    }
    this.projectFooterRefresh?.();
  }

  private consumeProjectItems(stage: ProjectStage): void {
    for (const req of stage.requirements) {
      let remaining = req.count;
      for (let row = 0; row < ROWS && remaining > 0; row++) {
        for (let col = 0; col < COLS && remaining > 0; col++) {
          const pos = { col, row };
          const cell = this.grid.get(pos);
          if (cell?.kind !== 'item' || cell.typeId !== req.typeId || cell.tier !== req.tier) continue;
          const key = this.keyOf(pos);
          this.views.get(key)?.destroy();
          this.views.delete(key);
          this.grid.set(pos, null);
          if (this.selectedItemKey === key) this.selectedItemKey = null;
          remaining--;
        }
      }
    }
  }

  private buildProjectButton(): void {
    const { cy } = this.crateRingCentre();
    const x = Math.max(22, this.boardOriginX - 24);
    const s = 38;
    this.projectButtonBg = this.add.graphics().setDepth(4);
    this.projectButtonIcon = this.add.graphics().setPosition(x, cy).setDepth(5);
    this.projectBadge = this.add.graphics().setDepth(6);
    this.projectButtonZone = this.add.zone(x, cy, s, s).setDepth(7).setInteractive({ useHandCursor: true });
    this.projectButtonZone.on('pointerdown', () => this.openProject());

    this.projectButtonBg.fillStyle(Theme.bg, 0.94);
    this.projectButtonBg.fillRoundedRect(x - s / 2, cy - s / 2, s, s, Theme.radiusChip);
    this.projectButtonBg.lineStyle(1, Theme.borderOnDark, 1);
    this.projectButtonBg.strokeRoundedRect(x - s / 2, cy - s / 2, s, s, Theme.radiusChip);

    // Compact modern-house silhouette: concrete shell, glass opening, flat roof.
    this.projectButtonIcon.fillStyle(0xb9c2c7, 1);
    this.projectButtonIcon.fillRect(-12, -8, 24, 17);
    this.projectButtonIcon.fillStyle(0x74858d, 1);
    this.projectButtonIcon.fillRect(-14, -11, 28, 4);
    this.projectButtonIcon.fillStyle(0x31454f, 1);
    this.projectButtonIcon.fillRect(-7, -2, 7, 11);
    this.projectButtonIcon.fillStyle(0x91a9b4, 0.85);
    this.projectButtonIcon.fillRect(3, -3, 6, 6);
    this.refreshProjectButton();
  }

  private refreshProjectButton(): void {
    if (!this.projectBadge || !this.projectButtonIcon) return;
    const unlocked = playerLevel(this.orderState) >= 3;
    this.projectButtonIcon.setAlpha(unlocked ? 1 : 0.38);
    this.projectBadge.clear();
    if (!this.projectStageReady()) return;
    const { cy } = this.crateRingCentre();
    const x = Math.max(22, this.boardOriginX - 24);
    this.projectBadge.fillStyle(Theme.accentAmber, 1);
    this.projectBadge.fillCircle(x + 15, cy - 15, 6);
    this.projectBadge.lineStyle(1, Theme.bg, 1);
    this.projectBadge.strokeCircle(x + 15, cy - 15, 6);
  }

  private drawLivingRoom(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number, h: number, stage: number): void {
    const left = cx - w / 2;
    const top = cy - h / 2;
    const floorY = top + h * 0.57;
    // Fixed three-quarter room shell. Every stage adds to these same planes.
    g.fillStyle(stage === 0 ? 0x59636a : 0xd2d5d4, 1);
    g.beginPath();
    g.moveTo(left, top + h * 0.12); g.lineTo(cx + w * 0.15, top);
    g.lineTo(cx + w * 0.15, floorY); g.lineTo(left, top + h * 0.72); g.closePath(); g.fillPath();
    g.fillStyle(stage === 0 ? 0x4b555c : 0xbec5c6, 1);
    g.beginPath();
    g.moveTo(cx + w * 0.15, top); g.lineTo(left + w, top + h * 0.18);
    g.lineTo(left + w, top + h * 0.73); g.lineTo(cx + w * 0.15, floorY); g.closePath(); g.fillPath();
    g.fillStyle(stage === 0 ? 0x3d454b : 0x7a8588, 1);
    g.beginPath();
    g.moveTo(left, top + h * 0.72); g.lineTo(cx + w * 0.15, floorY);
    g.lineTo(left + w, top + h * 0.73); g.lineTo(cx - w * 0.02, top + h); g.closePath(); g.fillPath();
    g.lineStyle(2, 0x273139, 0.75);
    g.lineBetween(cx + w * 0.15, top, cx + w * 0.15, floorY);

    if (stage >= 1) {
      // Cool daylight window and finished floor seams.
      g.fillStyle(0x58727e, 0.95);
      g.fillRect(left + w * 0.66, top + h * 0.25, w * 0.2, h * 0.25);
      g.lineStyle(2, 0xb9d0d8, 0.7);
      g.lineBetween(left + w * 0.76, top + h * 0.25, left + w * 0.76, top + h * 0.5);
      g.lineStyle(1, 0x59666b, 0.5);
      for (let i = 1; i < 5; i++) g.lineBetween(left + w * i / 5, top + h * 0.72, cx - w * 0.02 + w * i / 5, top + h);
    }
    if (stage >= 2) {
      // Main sofa and low table, broad architectural blocks rather than cartoon props.
      g.fillStyle(0x48565d, 1);
      g.fillRoundedRect(left + w * 0.2, top + h * 0.58, w * 0.42, h * 0.14, 5);
      g.fillStyle(0x68777d, 1);
      g.fillRoundedRect(left + w * 0.22, top + h * 0.52, w * 0.38, h * 0.1, 5);
      g.fillStyle(0x9da6a6, 1);
      g.fillRoundedRect(left + w * 0.53, top + h * 0.76, w * 0.2, h * 0.08, 4);
    }
    if (stage >= 3) {
      g.fillStyle(0x343f45, 1);
      g.fillRect(left + w * 0.06, top + h * 0.38, w * 0.1, h * 0.32);
      g.fillStyle(0x75898e, 1);
      g.fillRect(left + w * 0.075, top + h * 0.41, w * 0.07, h * 0.04);
      g.fillRect(left + w * 0.075, top + h * 0.49, w * 0.07, h * 0.04);
      g.lineStyle(3, 0x414c52, 1);
      g.lineBetween(left + w * 0.83, top + h * 0.51, left + w * 0.83, top + h * 0.69);
      g.fillStyle(0xc8d2d2, 1);
      g.fillCircle(left + w * 0.83, top + h * 0.48, 8);
    }
    if (stage >= 4) {
      g.fillStyle(0x405b55, 1);
      g.fillCircle(left + w * 0.88, top + h * 0.67, 13);
      g.fillStyle(0x69766f, 1);
      g.fillRect(left + w * 0.865, top + h * 0.68, 8, h * 0.12);
      g.fillStyle(0x87979a, 0.55);
      g.fillRoundedRect(left + w * 0.31, top + h * 0.79, w * 0.34, h * 0.12, 8);
      g.lineStyle(3, 0x758a92, 1);
      g.strokeRect(left + w * 0.28, top + h * 0.2, w * 0.2, h * 0.18);
    }
  }

  private openProject(): void {
    if (this.modalOpen) return;
    if (playerLevel(this.orderState) < 3) {
      this.refreshActionTray('LIVING ROOM PROJECT UNLOCKS AT LEVEL 3');
      return;
    }
    this.modalOpen = true;

    // FULL SCREEN. The room fills the whole game area rather than sitting in an
    // inset panel, so the 3D canvas matches the game canvas exactly and the
    // panel's own UI draws on top of it.
    //
    // That means the 3D canvas goes UNDER Phaser's (which now clears to alpha)
    // and the board has to be hidden while the panel is open, or it would be
    // drawn over the room. Everything below depth 3000 is board content; the
    // overlay itself is 4000.
    //
    // Swept FIRST, before any of the panel's own objects exist. Run later, it
    // caught the panel's title, its stage line and the inspect readout - they
    // are created at depth 0 and only afterwards handed to the overlay - and
    // left them permanently invisible. Tapping a piece in the room highlighted
    // it and set a name that could never be seen.
    const hiddenForRoom: Phaser.GameObjects.GameObject[] = [];
    for (const child of this.children.list) {
      const obj = child as Phaser.GameObjects.GameObject & { depth?: number; visible?: boolean };
      if ((obj.depth ?? 0) < 3000 && obj.visible !== false) {
        obj.visible = false;
        hiddenForRoom.push(child);
      }
    }
    this.roomHiddenForPanel = hiddenForRoom;
    this.roomPanelOpen = true;

    const overlay = this.add.container(0, 0).setDepth(4000);
    this.projectOverlay = overlay;
    const w = this.scale.width;
    const h = this.scale.height;
    // Fully TRANSPARENT: it exists to swallow taps that miss the panel's own
    // controls, not to darken anything. It was opaque and went unnoticed only
    // because the board-hiding sweep ran after it and swept it up too; with
    // the sweep moved earlier it became a sheet of paint over the room.
    // Phaser hit-tests interactive shapes by geometry, so alpha 0 still
    // catches the pointer.
    const dim = this.add.rectangle(w / 2, h / 2, w, h, 0x111619, 0).setInteractive();
    const title = this.add.text(w / 2, 34, 'LIVING ROOM', {
      resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '21px', fontStyle: 'bold', color: hex(Theme.textOnDark)
    }).setOrigin(0.5);
    const stage = this.add.text(w / 2, 58, `STAGE ${this.projectStage + 1}/5  ·  ${PROJECT_STAGE_NAMES[this.projectStage]}`, {
      resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px', color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0.5);
    const artPanel = this.add.graphics();
    // The room fills the screen rather than sitting in a 390x430 box in the
    // middle of it. Everything below the art - the bill of materials, the
    // build button and the row under it - needs about 150px, and the title
    // pair above needs 78, so the art takes whatever is left.
    const artW = w - 16;
    // 152 was too little: the bill of materials, the reward row and the build
    // button collided once the art grew to fill the width.
    const artH = Math.max(240, h - 78 - 210);
    const artCx = w / 2;
    const artCy = 78 + artH / 2;
    // The room is real 3D, on its own canvas layered over the Phaser view.
    //
    // It used to be a shell sprite plus one sprite per piece, composited
    // back-to-front. That could never give camera movement - the camera is
    // baked into every pre-rendered frame - which is the thing the long-term
    // design actually needs. Three.js rather than a second game engine: it
    // shares this page and this JS heap, so object state can go straight into
    // the save file with no interop bridge.
    const roomParts: Phaser.GameObjects.GameObject[] = [];

    // Names the piece the player last tapped. Inspect only, for now.
    const inspect = this.add.text(artCx, 86, '', {
      resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '11px',
      fontStyle: 'bold', color: hex(Theme.textOnDark),
      backgroundColor: 'rgba(10, 12, 14, 0.72)', padding: { x: 8, y: 4 }
    }).setOrigin(0.5).setAlpha(0);
    let inspectHide: Phaser.Time.TimerEvent | null = null;
    const showInspect = (label: string | null): void => {
      this.tweens.killTweensOf(inspect);
      inspectHide?.remove(false);
      inspectHide = null;
      if (!label) { inspect.setAlpha(0); return; }
      inspect.setText(label.toUpperCase()).setAlpha(0).setScale(0.92);
      this.tweens.add({
        targets: inspect, alpha: 1, scale: 1, duration: 120,
        onComplete: () => {
          inspectHide = this.time.delayedCall(900, () => {
            this.tweens.add({ targets: inspect, alpha: 0, duration: 220 });
          });
        }
      });
    };

    const canvasRect = this.game.canvas.getBoundingClientRect();
    const roomCanvas = document.createElement('canvas');
    roomCanvas.style.zIndex = '0';
    this.game.canvas.style.position = 'relative';
    this.game.canvas.style.zIndex = '1';
    this.game.canvas.parentElement?.appendChild(roomCanvas);

    this.roomView?.dispose();
    this.roomView = new RoomView3D(roomCanvas, {
      rect: {
        x: canvasRect.left, y: canvasRect.top,
        width: canvasRect.width, height: canvasRect.height
      },
      built: this.builtPieces,
      onSelect: showInspect
    });
    void this.roomView.load('rooms/living-room.glb');

    // Phaser owns input, so the orbit is driven from a Phaser zone rather than
    // from the 3D canvas - which is underneath and never sees a pointer.
    // Pushed into `roomParts` so it is added to the overlay BEFORE the title,
    // bill and build button, leaving those on top and still clickable.
    const orbitZone = this.add.zone(w / 2, h / 2, w, h)
      .setInteractive({ useHandCursor: false, draggable: true });
    // Assigned once the scope label exists further down. Wheel and pinch change
    // scope too, so they have to refresh the same readout the buttons do -
    // otherwise the label only tracks button presses and silently goes stale.
    let refreshScopeLabel: () => void = () => {};
    let orbitMoved = 0;
    // The tap that OPENED this panel finishes here: its pointerup lands on a
    // zone that did not exist when the press began, and was picking whatever
    // object happened to sit under the button. A pick only counts when the
    // press started on this zone.
    let pressedHere = false;
    orbitZone.on('pointerdown', () => { orbitMoved = 0; pressedHere = true; });
    orbitZone.on('drag', (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      const dx = pointer.x - pointer.prevPosition.x;
      const dy = pointer.y - pointer.prevPosition.y;
      orbitMoved += Math.abs(dx) + Math.abs(dy);
      this.roomView?.orbitBy(dx, dy);
      // `drag` gives absolute positions we do not use; consuming them keeps
      // Phaser from complaining about unused parameters.
      void dragX; void dragY;
    });
    orbitZone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // A drag orbits; only a genuine tap selects, same rule as the board.
      // Rotation settles on a quarter turn, so a released drag always lands on
      // a composed corner rather than wherever the finger stopped.
      if (!pressedHere) return;
      pressedHere = false;
      if (orbitMoved > 6) { this.roomView?.settleRotation(); return; }
      // Scene units -> normalised device coordinates. The 3D canvas covers the
      // game canvas exactly, so the two spaces map straight onto each other.
      this.roomView?.pickAt(
        (pointer.x / this.scale.width) * 2 - 1,
        -(pointer.y / this.scale.height) * 2 + 1
      );
    });
    // Wheel has to come through Phaser too - the 3D canvas is pointer-events
    // none, so its own wheel listener never fires.
    orbitZone.on('wheel', (_p: Phaser.Input.Pointer, _dx: number, dy: number) => {
      if (this.roomView?.zoomBy(dy * 0.01)) refreshScopeLabel();
    });

    // Pinch: Phaser reports two pointers, and the change in the distance
    // between them is the zoom. Tracked here because a zone only reports one.
    // Phaser tracks one pointer by default; pinch needs a second.
    this.input.addPointer(1);
    let pinchStart = 0;
    orbitZone.on('pointermove', () => {
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (!p1.isDown || !p2.isDown) { pinchStart = 0; return; }
      const spread = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
      if (pinchStart === 0) { pinchStart = spread; return; }
      if (this.roomView?.zoomBy((pinchStart - spread) * 0.02)) refreshScopeLabel();
      pinchStart = spread;
    });

    // Discrete zoom, stepping between scopes. The view itself communicates
    // the scale, so no ROOM/HOUSE/STREET label is drawn over the scene.
    const showScope = (): void => {};
    refreshScopeLabel = showScope;

    const zoomBtn = (dy: number, glyph: string, onTap: () => void): Phaser.GameObjects.GameObject[] => {
      const bx = w - 34;
      const by = h / 2 + dy;
      const g = this.add.graphics();
      g.fillStyle(Theme.bg, 0.82);
      g.fillRoundedRect(bx - 17, by - 17, 34, 34, Theme.radiusChip);
      g.lineStyle(1, Theme.borderOnDark, 0.9);
      g.strokeRoundedRect(bx - 17, by - 17, 34, 34, Theme.radiusChip);
      const t = this.add.text(bx, by, glyph, {
        resolution: textResolution, fontFamily: Theme.fontHeading,
        fontSize: '18px', fontStyle: 'bold', color: hex(Theme.textOnDark)
      }).setOrigin(0.5);
      const z = this.add.zone(bx, by, 40, 40).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => { onTap(); showScope(); });
      return [g, t, z];
    };

    // Dev-only light tuning. Arrow keys move the key light and the readout
    // shows where it is, so the angle can be found by eye and then baked into
    // RoomView3D's defaults. Stripped from production builds.
    if (import.meta.env?.DEV) {
      const keys = this.input.keyboard;
      const onKey = (e: KeyboardEvent): void => {
        const step = e.shiftKey ? 0.02 : 0.08;
        let dz = 0;
        let de = 0;
        if (e.key === 'ArrowLeft') dz = -step;
        else if (e.key === 'ArrowRight') dz = step;
        else if (e.key === 'ArrowUp') de = step;
        else if (e.key === 'ArrowDown') de = -step;
        else return;
        e.preventDefault();
        const at = this.roomView?.nudgeLight(dz, de);
        if (at) inspect.setText(`LIGHT  OFFSET ${at.offset}   ELEVATION ${at.elevation}`);
      };
      keys?.on('keydown', onKey);
      orbitZone.once('destroy', () => keys?.off('keydown', onKey));
    }

    roomParts.push(orbitZone);
    roomParts.push(...zoomBtn(-24, '+', () => this.roomView?.zoomIn()));
    roomParts.push(...zoomBtn(24, '−', () => this.roomView?.zoomOut()));
    roomParts.push(inspect);
    this.time.delayedCall(80, showScope);
    void ROOM_SCOPES;

    const close = this.add.text(22, 28, '‹ BOARD', {
      resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '13px', fontStyle: 'bold', color: hex(Theme.textOnDark)
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    const closeProject = () => {
      // The 3D canvas is a DOM sibling of the game canvas, so it is not owned
      // by the Phaser overlay and has to be disposed explicitly.
      this.restoreBoardAfterRoom();
      this.roomView?.dispose();
      this.roomView = null;
      overlay.destroy(true);
      this.projectOverlay = null;
      this.projectFooterRefresh = null;
      this.modalOpen = false;
      this.refreshProjectButton();
    };
    close.on('pointerdown', closeProject);

    // ---- Footer ----
    //
    // Two modes, and the state picks which: while the open stage still has
    // furniture for sale it is a SHOPPING LIST, and once that stage is fully
    // furnished it becomes the unlock for the next one. Both draw into one
    // container that re-renders after every purchase, because buying the last
    // piece of a stage has to turn the list into the unlock without the player
    // closing the panel.
    const footer = this.add.container(0, 0);
    const rewardOrigin = { x: w / 2, y: artCy };

    const renderShoppingList = (pieces: RoomPiece[]): void => {
      const rowW = Math.min(330, w - 28);
      const rowH = 28;
      const top = artCy + artH / 2 + 26;
      footer.add(this.add.text(w / 2, top - 16, 'FURNISH THIS STAGE', {
        resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
        fontStyle: 'bold', color: hex(Theme.textOnDarkMuted)
      }).setOrigin(0.5));

      pieces.forEach((piece, i) => {
        const y = top + rowH / 2 + i * (rowH + 3);
        const owned = this.builtPieces.has(piece.key);
        const supported = this.roomPieceSupported(piece);
        const affordable = !owned && supported && this.economy.coins >= piece.price;
        const support = piece.restsOn == null
          ? null
          : ROOM_PIECES.find((other) => other.key === piece.restsOn) ?? null;
        // Colour carries the state, not opacity - the same rule the order
        // cards and the inventory slots follow.
        const tone = owned ? Theme.accentGreen : affordable ? Theme.accentAmber : Theme.borderOnDark;
        const row = this.add.graphics();
        row.fillStyle(owned ? Theme.accentGreen : Theme.bgElevated, owned ? 0.16 : 1);
        row.fillRoundedRect(w / 2 - rowW / 2, y - rowH / 2, rowW, rowH, Theme.radiusChip);
        row.lineStyle(1, tone, owned ? 0.85 : affordable ? 0.8 : 0.5);
        row.strokeRoundedRect(w / 2 - rowW / 2, y - rowH / 2, rowW, rowH, Theme.radiusChip);
        footer.add(row);

        footer.add(this.add.text(w / 2 - rowW / 2 + 12, y, piece.label.toUpperCase(), {
          resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '11px', fontStyle: 'bold',
          color: hex(owned ? Theme.accentGreen : affordable ? Theme.textOnDark : Theme.textOnDarkMuted)
        }).setOrigin(0, 0.5));

        if (owned) {
          footer.add(this.add.text(w / 2 + rowW / 2 - 12, y, 'BUILT', {
            resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
            fontStyle: 'bold', color: hex(Theme.accentGreen)
          }).setOrigin(1, 0.5));
          return;
        }

        // A piece with nowhere to sit names what it is waiting for instead of
        // showing a price it cannot take.
        if (!supported && support) {
          footer.add(this.add.text(w / 2 + rowW / 2 - 12, y, `NEEDS ${support.label.toUpperCase()}`, {
            resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '9px',
            color: hex(Theme.textOnDarkMuted)
          }).setOrigin(1, 0.5));
          return;
        }

        const priceColor = affordable ? CURRENCY_COLOR.credit : Theme.textOnDarkMuted;
        const price = currencyPill(this, piece.price.toLocaleString(), 'credit', {
          ...currencyChipOptions('credit'),
          fontSize: 11, iconSize: 16, height: 20,
          textColor: priceColor, stroke: priceColor
        });
        price.setPosition(w / 2 + rowW / 2 - 10 - price.width / 2, y);
        // `currencyPill` has no colour hook for the mark itself, so the icon -
        // its third child - is dimmed directly to match an unaffordable price.
        const mark = price.list[2] as Partial<Phaser.GameObjects.Components.Alpha> | undefined;
        if (!affordable) mark?.setAlpha?.(0.45);
        footer.add(price);

        if (!affordable) return;
        const zone = this.add.zone(w / 2, y, rowW, rowH).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => {
          if (this.buyRoomPiece(piece, rewardOrigin)) renderFooter();
        });
        footer.add(zone);
      });

      // What finishing the stage pays. The unlock step already showed this,
      // but that is the one moment the player is NOT working toward it - the
      // pull belongs here, on the list they are working through. On the last
      // stage it is the reward for completing the room.
      const lineY = top + pieces.length * (rowH + 3) + 16;
      const prompt = this.add.text(w / 2, lineY, 'FINISH THIS STAGE  ·  GET', {
        resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
        fontStyle: 'bold', color: hex(Theme.textOnDarkMuted)
      }).setOrigin(1, 0.5).setPosition(w / 2 - 6, lineY);
      footer.add(prompt);

      // Mirrors `grantStageReward`: stage 2 pays a bronze crate, 3 pays gems,
      // 4 pays the gold crate.
      if (this.projectStage === 3) {
        footer.add(currencyPill(this, '10', 'gem', {
          ...currencyChipOptions('gem'), fontSize: 11, iconSize: 16, height: 22
        }).setPosition(w / 2 + 26, lineY));
      } else {
        // The crate art carries its own tier, so it is shown WITHOUT a label.
        // Text belongs here only where a number is the reward, as with gems.
        const tier: CrateTier = this.projectStage === 4 ? 'gold' : 'bronze';
        const icon = this.add.graphics().setPosition(w / 2 + 14, lineY);
        drawCrate(icon, 26, tier);
        footer.add(icon);
      }
    };

    const renderUnlock = (stageDef: ProjectStage | undefined): void => {
      const complete = stageDef == null;
      const shortfall = stageDef ? this.projectShortfall(stageDef) : 0;
      const affordable = stageDef != null && this.economy.coins >= stageDef.coins;
      const buildable = stageDef != null && affordable && shortfall === 0;

      // Built UPWARD from the bottom of the screen, in the same rows the
      // shopping list uses: one line per thing you owe, its state on the
      // right. The old version scattered a coin chip, square item plates and
      // a separate reward line across the middle of the panel at three
      // different sizes, and none of them lined up with anything.
      const rowW = Math.min(330, w - 28);
      const rowH = 28;
      const left = w / 2 - rowW / 2;
      const right = w / 2 + rowW / 2;
      const buttonH = 42;
      const buttonY = h - 16 - buttonH / 2;

      // Rows: the credits, when a stage charges any, then the materials.
      const rows: { label: string; met: boolean; req?: { typeId: string; tier: number; count: number } }[] = [];
      if (stageDef && stageDef.coins > 0) {
        rows.push({ label: `${stageDef.coins.toLocaleString()} CREDITS`, met: affordable });
      }
      for (const req of stageDef?.requirements ?? []) {
        const have = this.grid.countAtTier(req.tier, req.typeId);
        rows.push({
          label: `${req.count}x ${familyTierLabel(req.typeId, req.tier)}`,
          met: have >= req.count,
          req
        });
      }

      const rewardY = buttonY - buttonH / 2 - 20;
      const rowsBottom = rewardY - 18;
      const rowsTop = rowsBottom - rows.length * (rowH + 3);

      if (stageDef) {
        footer.add(this.add.text(w / 2, rowsTop - 14, `TO OPEN ${PROJECT_STAGE_NAMES[this.projectStage + 1]}`, {
          resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
          fontStyle: 'bold', color: hex(Theme.textOnDarkMuted)
        }).setOrigin(0.5));
      }

      rows.forEach((row, i) => {
        const y = rowsTop + rowH / 2 + i * (rowH + 3);
        const tone = row.met ? Theme.accentGreen : Theme.borderOnDark;
        const bg = this.add.graphics();
        bg.fillStyle(row.met ? Theme.accentGreen : Theme.bgElevated, row.met ? 0.16 : 1);
        bg.fillRoundedRect(left, y - rowH / 2, rowW, rowH, Theme.radiusChip);
        bg.lineStyle(1, tone, row.met ? 0.85 : 0.5);
        bg.strokeRoundedRect(left, y - rowH / 2, rowW, rowH, Theme.radiusChip);
        footer.add(bg);

        // The item's own art, at the row's height, so a requirement is
        // recognisable without reading it.
        let textX = left + 12;
        if (row.req) {
          const def = getTierDef(row.req.typeId, row.req.tier);
          const art = rowH + 8;
          const icon = this.add.graphics();
          const { materialAlpha } = drawTierIcon(
            icon, row.req.typeId, row.req.tier, art,
            materialLighting(def?.color ?? Theme.panelAlt, row.req.tier)
          );
          icon.setAlpha(row.met ? materialAlpha : materialAlpha * 0.55);
          const present = iconPresentation(row.req.typeId, row.req.tier, art);
          icon.setScale(present.scale).setPosition(left + 20 + present.offsetX, y + present.offsetY);
          footer.add(icon);
          textX = left + 40;
        }

        footer.add(this.add.text(textX, y, row.label.toUpperCase(), {
          resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '11px', fontStyle: 'bold',
          color: hex(row.met ? Theme.accentGreen : Theme.textOnDark)
        }).setOrigin(0, 0.5));

        // Right edge carries the state: how many you have, or a tick.
        const status = row.req
          ? `${Math.min(this.grid.countAtTier(row.req.tier, row.req.typeId), row.req.count)}/${row.req.count}`
          : row.met ? 'READY' : 'SHORT';
        footer.add(this.add.text(right - 12, y, status, {
          resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px', fontStyle: 'bold',
          color: hex(row.met ? Theme.accentGreen : Theme.textOnDarkMuted)
        }).setOrigin(1, 0.5));
      });

      // Reward line, worded and placed exactly like the shopping list's, so
      // the two halves of the panel read as one thing.
      if (stageDef) {
        footer.add(this.add.text(w / 2 - 6, rewardY, 'ON OPENING  ·  GET', {
          resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
          fontStyle: 'bold', color: hex(Theme.textOnDarkMuted)
        }).setOrigin(1, 0.5));

        if (this.projectStage === 0 || this.projectStage === 2) {
          const kind = this.projectStage === 0 ? 'energy' : 'gem';
          const amount = this.projectStage === 0 ? 25 : 10;
          footer.add(currencyPill(this, String(amount), kind, {
            ...currencyChipOptions(kind), fontSize: 11, iconSize: 16, height: 22
          }).setPosition(w / 2 + 26, rewardY));
        } else {
          const tier: CrateTier = this.projectStage === 1 ? 'bronze' : 'gold';
          const rewardIcon = this.add.graphics().setPosition(w / 2 + 14, rewardY);
          drawCrate(rewardIcon, 26, tier);
          footer.add(rewardIcon);
        }
      }

      const buttonBg = this.add.graphics();
      const buttonColor = complete ? Theme.panelAlt : buildable ? Theme.accentGreen : Theme.textOnDarkMuted;
      const buttonLighting = materialLighting(buttonColor, buildable ? 5 : 2);
      buttonBg.fillGradientStyle(
        buttonLighting.highlight, buttonLighting.light,
        buttonLighting.dark, buttonLighting.shadow, 1
      );
      // Full row width, so the button is the base of the same column the rows
      // stand in rather than a narrower shape floating under them.
      buttonBg.fillRoundedRect(left, buttonY - buttonH / 2, rowW, buttonH, Theme.radiusChip);
      // The label names the MISSING half rather than repeating the price, which
      // the rows above already show. It says OPEN rather than BUILD: the button
      // no longer builds a stage, it unlocks one to be furnished.
      const label = complete
        ? 'PROJECT COMPLETE  ·  NEXT ROOM COMING SOON'
        : buildable ? `OPEN ${PROJECT_STAGE_NAMES[this.projectStage + 1]}`
        : shortfall > 0 ? 'MISSING REQUIREMENTS'
        : 'NOT ENOUGH CREDITS';
      const buttonText = this.add.text(w / 2, buttonY, label, {
        resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '13px',
        fontStyle: 'bold', color: hex(complete ? Theme.textOnDarkMuted : Theme.bg)
      }).setOrigin(0.5);
      const buttonZone = this.add.zone(w / 2, buttonY, rowW, buttonH).setInteractive({ useHandCursor: true });
      if (buildable && stageDef) buttonZone.on('pointerdown', () => this.confirmProjectPurchase(stageDef));
      footer.add([buttonBg, buttonText, buttonZone]);
    };

    const renderFooter = (): void => {
      if (!this.projectOverlay) return;
      footer.removeAll(true);
      stage.setText(`STAGE ${this.projectStage + 1}/5  ·  ${PROJECT_STAGE_NAMES[this.projectStage]}`);
      const pieces = roomPiecesForStage(this.projectStage);
      if (pieces.some((piece) => !this.builtPieces.has(piece.key))) {
        renderShoppingList(pieces);
        return;
      }
      renderUnlock(PROJECT_STAGES[this.projectStage]);
    };

    overlay.add([dim, artPanel, ...roomParts, title, stage, close, footer]);
    this.projectFooterRefresh = renderFooter;
    renderFooter();
  }

  private confirmProjectPurchase(stageDef: ProjectStage): void {
    if (!this.projectOverlay || this.projectStage >= PROJECT_STAGES.length) return;
    const cost = stageDef.coins;
    const w = this.scale.width;
    const h = this.scale.height;
    const confirm = this.add.container(0, 0).setDepth(4100);
    const dim = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.68).setInteractive();
    const panel = this.add.graphics();
    const pw = Math.min(310, w - 42);
    panel.fillStyle(Theme.bgElevated, 1).fillRoundedRect(w / 2 - pw / 2, h / 2 - 92, pw, 184, Theme.radiusPanel);
    panel.lineStyle(1, Theme.borderOnDark, 1).strokeRoundedRect(w / 2 - pw / 2, h / 2 - 92, pw, 184, Theme.radiusPanel);
    const rewardNames = ['25 ENERGY', 'BRONZE CRATE', '10 GEMS', 'GOLD CRATE'];
    const title = this.add.text(w / 2, h / 2 - 55, `OPEN ${PROJECT_STAGE_NAMES[this.projectStage + 1]}?`, {
      resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '14px', fontStyle: 'bold', color: hex(Theme.textOnDark), align: 'center', wordWrap: { width: pw - 30 }
    }).setOrigin(0.5);
    // Spells out the items as well as the credits: they leave the board on
    // confirm, and that is not recoverable.
    const materials = stageDef.requirements
      .map((req) => `${req.count}x ${req.typeId.toUpperCase()} ${String(req.tier).padStart(2, '0')}`)
      .join('  ·  ');
    // The credits line is dropped when the unlock is materials-only, which is
    // every stage but the surfaces one - printing "0 CREDITS" would read as a
    // price rather than as the absence of one. The reward line says when it
    // arrives, because for a stage with furniture it is no longer paid here:
    // it waits for the last piece of that stage to be bought.
    const price = cost > 0 ? `${cost.toLocaleString()} CREDITS  ·  ${materials}` : materials;
    const pieceCount = roomPiecesForStage(this.projectStage + 1).length;
    const rewardLine = pieceCount > 0
      ? `REWARD ${rewardNames[this.projectStage]} WHEN FURNISHED`
      : `REWARD ${rewardNames[this.projectStage]}`;
    const detail = this.add.text(
      w / 2, h / 2 - 12,
      `${price}
${rewardLine}`,
      {
        resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
        color: hex(Theme.textOnDarkMuted), align: 'center', lineSpacing: 4
      }
    ).setOrigin(0.5);
    const makeChoice = (x: number, label: string, color: number) => {
      const bg = this.add.graphics();
      bg.fillStyle(Theme.panelAlt, 1).fillRoundedRect(x - 55, h / 2 + 35, 110, 36, Theme.radiusChip);
      bg.lineStyle(1, color, 1).strokeRoundedRect(x - 55, h / 2 + 35, 110, 36, Theme.radiusChip);
      const text = this.add.text(x, h / 2 + 53, label, {
        resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '12px', fontStyle: 'bold', color: hex(color)
      }).setOrigin(0.5);
      const zone = this.add.zone(x, h / 2 + 53, 110, 36).setInteractive({ useHandCursor: true });
      return { bg, text, zone };
    };
    const cancel = makeChoice(w / 2 - 64, 'CANCEL', Theme.textOnDarkMuted);
    const build = makeChoice(w / 2 + 64, 'BUILD', Theme.accentGreen);
    const close = () => confirm.destroy(true);
    dim.on('pointerdown', close);
    cancel.zone.on('pointerdown', close);
    build.zone.on('pointerdown', () => {
      const from = { x: w / 2, y: h / 2 - 8 };
      if (!this.completeProjectStage(stageDef, from, true)) {
        close();
        return;
      }
      confirm.destroy(true);
      // Reopening the panel builds a fresh RoomView3D, so the current one must
      // be disposed or its canvas stays in the DOM forever.
      this.restoreBoardAfterRoom();
      this.roomView?.dispose();
      this.roomView = null;
      this.projectOverlay?.destroy(true);
      this.projectOverlay = null;
      this.projectFooterRefresh = null;
      this.modalOpen = false;
    });
    confirm.add([dim, panel, title, detail, cancel.bg, cancel.text, cancel.zone, build.bg, build.text, build.zone]);
    this.projectOverlay.add(confirm);
  }

  private completeProjectStage(
    stageDef: ProjectStage,
    from: { x: number; y: number },
    reopenProject = false
  ): boolean {
    if (stageDef !== PROJECT_STAGES[this.projectStage]) return false;
    if (!this.projectStageFurnished(this.projectStage)) return false;
    if (this.projectShortfall(stageDef) > 0 || !spendCoinsGeneric(this.economy, stageDef.coins)) return false;
    this.consumeProjectItems(stageDef);
    this.refreshOrderBar();
    this.checkDeadlock();
    const unlockedStage = ++this.projectStage;
    // The surfaces stage sells no furniture, so unlocking it is the whole of
    // it - there is no later purchase for its reward to wait on. Every other
    // stage pays out when its last piece is bought.
    if (roomPiecesForStage(unlockedStage).length === 0) {
      this.time.delayedCall(0, () => {
        this.grantStageReward(unlockedStage, from);
        this.updateCurrencyText();
        this.saveState();
      });
    }
    if (reopenProject) {
      this.time.delayedCall(900, () => {
        if (!this.modalOpen) this.openProject();
      });
    }
    return true;
  }

  private playProjectCurrencyReward(
    kind: 'energy' | 'gem',
    amount: number,
    from: { x: number; y: number }
  ): void {
    const target = kind === 'energy' ? this.energyText : this.gemText;
    const color = kind === 'energy' ? Theme.currencyEnergy : Theme.currencyGem;
    const icon = currencyIcon(this, kind, 48).setPosition(from.x, from.y).setDepth(4100);
    const label = this.add.text(from.x, from.y + 34, `+${amount} ${kind.toUpperCase()}`, {
      resolution: textResolution,
      fontFamily: Theme.fontHeading,
      fontSize: '14px',
      fontStyle: 'bold',
      color: hex(color)
    }).setOrigin(0.5).setDepth(4100);
    burstParticles(this, from.x, from.y, color, 1);
    this.tweens.add({
      targets: label,
      y: from.y + 17,
      alpha: 0,
      delay: 360,
      duration: 340,
      ease: 'Quad.In',
      onComplete: () => label.destroy()
    });
    this.tweens.add({
      targets: icon,
      x: target.x,
      y: target.y,
      scale: 0.45,
      alpha: 0.2,
      delay: 220,
      duration: 520,
      ease: 'Cubic.InOut',
      onComplete: () => {
        icon.destroy();
        this.tweens.add({
          targets: target,
          scale: { from: 1.3, to: 1 },
          duration: 240,
          ease: 'Back.Out'
        });
      }
    });
  }

  /**
   * The output meter: a thin full-width rule that fills as sources are run,
   * with a notch at each crate threshold.
   *
   * Drawn as a machined hairline rather than a chunky progress bar because
   * that is what the art brief's "industrial techno" tenth actually is - a
   * precise indicator, never the subject. It also costs almost no vertical
   * space, which the header did not have to spare.
   *
   * Every number it shows is real: the fill is exactly `collects / 100` and
   * the notches sit exactly at the thresholds that grant each crate. See
   * Rewards.ts for why that matters.
   */
  private buildCrateMeter(): void {
    this.crateMeterContainer = this.add.container(0, 0).setDepth(2);
    this.crateMeterBar = this.add.graphics();
    this.crateMeterProgress = this.add.graphics();
    this.crateMeterIcon = this.add.graphics();
    const { cx, cy } = this.crateRingCentre();
    this.crateMeterZone = this.add.zone(cx, cy, this.crateRingR() * 2 + 8, this.crateRingR() * 2 + 8)
      .setInteractive({ useHandCursor: true });
    this.crateMeterZone.on('pointerdown', () => this.claimMeterCrate());
    this.crateMeterContainer.add([
      this.crateMeterBar,
      this.crateMeterProgress,
      this.crateMeterIcon,
      this.crateMeterZone
    ]);
    this.refreshCrateMeter();
  }

  /**
   * Ring centre: the left end of the ORDER ROW, in line with the cards rather
   * than in a strip of its own. The cards scroll past it; the ring does not
   * move, because it is not one of them.
   */
  /**
   * Width of the crate meter's lane at the current chrome scale.
   *
   * The order cards are drawn at their tuned size and scaled as a unit, so
   * anything that has to line up beside them - this lane, the bar's mask, the
   * cursor the cards are packed from - has to grow by the same factor. Left
   * fixed, the lane stayed 56px while the cards grew, and the meter ended up
   * overlapping the first card with its own ring clipped.
   */
  private crateLaneW(): number {
    return Math.round(CRATE_RING_LANE * this.chromeScale);
  }

  /** Ring radius at the current chrome scale. */
  private crateRingR(): number {
    return CRATE_RING_R * this.chromeScale;
  }

  private crateRingCentre(): { cx: number; cy: number } {
    const { cardH, y } = this.orderBarMetrics();
    return {
      cx: this.boardOriginX + (this.crateLaneW() - Math.round(8 * this.chromeScale)) / 2,
      cy: y + (ORDER_HEADER_H + (cardH - ORDER_HEADER_H) / 2) * this.chromeScale
    };
  }

  private refreshCrateMeter(now = Date.now()): void {
    if (!this.crateMeterBar) return;
    const cooling = isMeterCooling(this.rewards, now);
    const { cx, cy } = this.crateRingCentre();
    const earned = availableCrate(this.rewards);
    const next = nextCrateStep(this.rewards);
    const cooldownRemaining = meterCooldownRemaining(this.rewards, now);
    const fill = cooling
      ? cooldownRemaining / Math.max(1, this.rewards.meterCooldownDurationMs || METER_COOLDOWN_MS)
      : Math.min(1, this.rewards.meterCollects / METER_MAX);

    const g = this.crateMeterBar;
    g.clear();

    {
    // Compact icon-only meter. Progress and claimability are communicated by
    // the ring and crate itself; persistent explanatory copy was unnecessary.
    for (const text of this.crateMeterRuns) text.destroy();
    this.crateMeterRuns = [];
    const { cardH: laneH, y: laneY } = this.orderBarMetrics();
    // Same scale the cards are drawn at, so the meter's box lines up with the
    // card band beside it instead of sitting short and high.
    const boxY = laneY + ORDER_HEADER_H * this.chromeScale;
    const boxH = (laneH - ORDER_HEADER_H) * this.chromeScale;
    const boxW = this.crateLaneW() - Math.round(8 * this.chromeScale);
    g.fillStyle(Theme.bg, 0.9);
    g.fillRoundedRect(this.boardOriginX, boxY, boxW, boxH, Theme.radiusChip);
    g.lineStyle(Theme.borderWidth, Theme.borderOnDark, 1);
    g.strokeRoundedRect(this.boardOriginX, boxY, boxW, boxH, Theme.radiusChip);
    this.drawCrateMeterProgress(now);
    const showTier = earned ?? next?.tier ?? 'bronze';
    this.crateMeterIcon.clear().setPosition(cx - 3, cy + 1).setAlpha(cooling ? 0.3 : earned ? 1 : 0.55);
    drawCrate(this.crateMeterIcon, (CRATE_RING_R * 1.25 + 14) * this.chromeScale, showTier);
    if (cooling) {
      const timer = this.add.text(cx, boxY + boxH - 6, formatCountdown(cooldownRemaining), {
        resolution: textResolution,
        fontFamily: Theme.fontNumeric,
        fontSize: '8px',
        fontStyle: 'bold',
        color: hex(Theme.textOnDark),
        backgroundColor: 'rgba(0,0,0,0.72)',
        padding: { x: 3, y: 1 }
      }).setOrigin(0.5).setDepth(3);
      this.crateMeterContainer.add(timer);
      this.crateMeterRuns.push(timer);
    }
    this.crateMeterPulse?.stop();
    this.crateMeterIcon.setScale(1);
    if (earned && !cooling) {
      this.crateMeterPulse = this.tweens.add({
        targets: this.crateMeterIcon,
        scale: { from: 1, to: 1.12 },
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut'
      });
    }
    this.crateMeterWasCooling = cooling;
    this.crateMeterSecond = cooling ? Math.ceil(cooldownRemaining / 1000) : -1;
    return;
    }

  }

  /** Draws only the circular indicator, allowing cooldown motion every frame without rebuilding text. */
  private drawCrateMeterProgress(now = Date.now()): void {
    if (!this.crateMeterProgress) return;
    const { cx, cy } = this.crateRingCentre();
    const cooling = isMeterCooling(this.rewards, now);
    const earned = availableCrate(this.rewards);
    const fill = cooling
      ? meterCooldownRemaining(this.rewards, now) / METER_COOLDOWN_MS
      : Math.min(1, this.rewards.meterCollects / METER_MAX);
    const g = this.crateMeterProgress;
    const tau = Math.PI * 2;
    const start = -Math.PI / 2;

    g.clear();
    const ringR = this.crateRingR();
    g.lineStyle(CRATE_RING_W * this.chromeScale, Theme.bgElevated, 1);
    g.beginPath();
    g.arc(cx, cy, ringR, 0, tau);
    g.strokePath();

    if (fill > 0) {
      g.lineStyle(
        CRATE_RING_W,
        cooling ? Theme.textOnDarkMuted : earned ? this.crateAccent(earned) : Theme.currencyEnergy,
        cooling ? 0.65 : earned ? 1 : 0.8
      );
      g.beginPath();
      g.arc(cx, cy, ringR, start, start + tau * fill);
      g.strokePath();
    }

    for (const step of CRATE_THRESHOLDS) {
      const angle = start + tau * (step.collects / METER_MAX);
      const reached = !cooling && this.rewards.meterCollects >= step.collects;
      const inner = ringR - (CRATE_RING_W * this.chromeScale) / 2 - 1;
      const outer = ringR + (CRATE_RING_W * this.chromeScale) / 2 + 1;
      g.lineStyle(2, reached ? Theme.textOnDark : Theme.borderOnDark, 1);
      g.lineBetween(
        cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner,
        cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer
      );
    }
  }

  /**
   * Cashes the meter in. Refuses when the board cannot hold the crate's
   * items rather than dropping them, matching what buying from the shop
   * already does on a full board - and crucially WITHOUT consuming the
   * meter, so nothing is lost.
   */
  private claimMeterCrate(): void {
    if (this.modalOpen || this.inputLocked) return;
    if (isMeterCooling(this.rewards)) {
      const seconds = Math.ceil(meterCooldownRemaining(this.rewards) / 1000);
      this.refreshActionTray(`CRATE METER RECHARGING  ·  ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
      return;
    }
    const tier = availableCrate(this.rewards);
    if (!tier) return;

    // Gold closes the cycle and becomes a physical board object; if the board
    // is full, the automatic vault owns the wait rather than blocking meter
    // progress behind an invisible reward.
    if (tier === 'gold') {
      this.tryDeliverMeterGold();
      return;
    }

    const { cx, cy } = this.crateRingCentre();
    if (!this.awardCrate(tier, 'METER REWARD', { x: cx, y: cy })) return;
    claimMeterCrate(this.rewards);
    this.refreshCrateMeter();
    this.refreshOrderBar();
    this.saveState();
  }

  /** Converts a completed Gold meter into a forced spawn exactly once. */
  private tryDeliverMeterGold(): boolean {
    if (this.rewards.meterCollects < METER_MAX || availableCrate(this.rewards) !== 'gold') return false;
    const payload = cratePayload(rollCrate(
      'gold', playerLevel(this.orderState), Math.random, this.ownedDispenserTypeIds()
    ));
    claimMeterCrate(this.rewards);
    const { cx, cy } = this.crateRingCentre();
    this.enqueueForcedSpawn(
      { kind: 'crate', tier: 'gold', remaining: payload, source: 'METER REWARD' },
      { x: cx, y: cy }
    );
    this.refreshCrateMeter();
    this.refreshOrderBar();
    this.saveState();
    return true;
  }

  /**
   * INVENTORY button, bottom-left under the action tray. Always visible,
   * unlike CRATES, because its slot count is information the player needs
   * even when it is empty.
   */
  private buildInventoryButton(): void {
    const x = this.boardOriginX;
    const y = this.boardOriginY + ROWS * this.cellSize + this.boardToTrayGap;
    this.invBg = this.add.graphics();
    // Icon-only, like the SHOP button: the word was the least interesting
    // thing on the screen and the case says it faster.
    this.invLabel = this.add.text(0, 0, '', { fontSize: '1px' }).setVisible(false);
    this.invIcon = this.add.graphics().setPosition(x + 21, y + 15.5);
    this.invZone = this.add.zone(x + 21, y + 15.5, 42, 31).setInteractive({ useHandCursor: true });
    this.invZone.on('pointerdown', () => this.showInventory());
    this.refreshInventoryButton();
  }

  private vaultPosition(): { x: number; y: number } {
    return {
      x: this.boardOriginX + 21,
      y: this.boardOriginY + ROWS * this.cellSize + this.boardToTrayGap + 50.5
    };
  }

  /**
   * A passive reward queue, not player storage. It appears only while a
   * forced spawn is waiting, previews the next LIFO item, and never accepts
   * taps or dragged board pieces.
   */
  private buildForcedSpawnVault(): void {
    const { x, y } = this.vaultPosition();
    this.vaultBg = this.add.graphics();
    this.vaultIcon = this.add.graphics().setPosition(x, y);
    this.vaultCountDot = this.add.graphics();
    this.vaultCount = this.add.text(x + 17, y - 12, '', {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric,
      fontSize: '9px',
      fontStyle: 'bold',
      color: hex(Theme.bg)
    }).setOrigin(0.5);
    this.refreshForcedSpawnVault();
  }

  private refreshForcedSpawnVault(): void {
    if (!this.vaultBg || !this.vaultIcon || !this.vaultCountDot || !this.vaultCount) return;
    const next = this.forcedSpawnVault[this.forcedSpawnVault.length - 1];
    const visible = Boolean(next);
    this.vaultBg.setVisible(visible);
    this.vaultIcon.setVisible(visible);
    this.vaultCountDot.setVisible(visible);
    this.vaultCount.setVisible(visible);
    if (!next) return;

    const { x, y } = this.vaultPosition();
    this.vaultBg.clear();
    this.vaultBg.fillStyle(Theme.bgElevated, 1);
    this.vaultBg.fillRoundedRect(x - 21, y - 15.5, 42, 31, Theme.radiusChip);
    this.vaultBg.lineStyle(Theme.borderWidth, Theme.accentAmber, 0.9);
    this.vaultBg.strokeRoundedRect(x - 21, y - 15.5, 42, 31, Theme.radiusChip);

    this.vaultIcon.clear().setPosition(x, y);
    this.drawForcedSpawnIcon(this.vaultIcon, next, 28);
    const countX = x + 17;
    const countY = y - 12;
    this.vaultCountDot.clear();
    this.vaultCountDot.fillStyle(Theme.accentAmber, 1);
    this.vaultCountDot.fillCircle(countX, countY, 7);
    this.vaultCountDot.lineStyle(1, Theme.textOnDark, 0.75);
    this.vaultCountDot.strokeCircle(countX, countY, 7);
    this.vaultCount.setPosition(countX, countY - 0.75)
      .setText(this.forcedSpawnVault.length > 9 ? '9+' : String(this.forcedSpawnVault.length));
  }

  private drawForcedSpawnIcon(g: Phaser.GameObjects.Graphics, spawn: ForcedSpawn, size: number): void {
    if (spawn.kind === 'crate') drawCrate(g, size, spawn.tier);
    else if (spawn.kind === 'splitter') drawSplitterIcon(g, size);
    else if (spawn.kind === 'resource-producer') {
      const typeId = RESOURCE_PRODUCERS[spawn.producerId].typeId;
      const kind: CurrencyKind = typeId === 'currency-credit' ? 'credit' : typeId === 'currency-gem' ? 'gem' : 'energy';
      drawCurrencyGlyph(g, kind, size, kind === 'credit' ? Theme.currencyCredit : kind === 'gem' ? Theme.currencyGem : Theme.currencyEnergy);
    }
    else if (spawn.kind === 'spawner') {
      drawSourceBuilding(g, spawn.typeId, spawn.tier, size * 0.4, sourcePalette(spawn.typeId), true);
    } else if (spawn.kind === 'spawner-piece') drawSpawnerPieceIcon(g, spawn.typeId, spawn.tier, size);
    else {
      const def = getTierDef(spawn.typeId, spawn.tier);
      if (def) drawTierIcon(g, spawn.typeId, spawn.tier, size, materialLighting(def.color, def.tier));
    }
  }

  /**
   * Keeps a board object out of sight while the room panel is open.
   *
   * The panel hides the board by sweeping the display list ONCE, when it
   * opens. Anything created afterwards - a crate delivered by a stage reward,
   * for instance - was never swept, so it landed on top of the room and stayed
   * there. Registering it with the same list hides it now and reveals it with
   * everything else when the panel closes.
   */
  private hideBehindRoomPanel(view: Phaser.GameObjects.GameObject & { visible: boolean }): void {
    if (!this.roomPanelOpen) return;
    view.visible = false;
    this.roomHiddenForPanel.push(view);
  }

  private enqueueForcedSpawn(spawn: ForcedSpawn, from?: { x: number; y: number }): void {
    const openCell = this.firstFreeCellInReadingOrder();
    if (openCell) {
      const view = this.placeForcedSpawn(openCell, spawn);
      this.hideBehindRoomPanel(view);
      const target = this.cellToWorld(openCell);
      const origin = from ?? this.vaultPosition();
      view.setPosition(origin.x, origin.y).setScale(0.72).setAlpha(0.35);
      this.saveState();
      this.tweens.add({
        targets: view,
        x: target.x,
        y: target.y,
        scale: 1,
        alpha: 1,
        duration: 430,
        ease: 'Cubic.Out',
        onComplete: () => {
          this.refreshOrderBar();
          this.checkDeadlock();
        }
      });
      return;
    }

    this.forcedSpawnVault.push(spawn);
    this.refreshForcedSpawnVault();
    this.saveState();
    if (!from) {
      this.tryReleaseVaultItem();
      return;
    }

    const destination = this.vaultPosition();
    const flying = this.add.graphics().setDepth(3105).setPosition(from.x, from.y);
    this.drawForcedSpawnIcon(flying, spawn, 42);
    this.vaultInboundPending++;
    this.tweens.add({
      targets: flying,
      x: destination.x,
      y: destination.y,
      scale: 0.62,
      alpha: { from: 1, to: 0.75 },
      duration: 430,
      ease: 'Cubic.InOut',
      onComplete: () => {
        flying.destroy();
        this.vaultInboundPending = Math.max(0, this.vaultInboundPending - 1);
        this.refreshForcedSpawnVault();
        this.tryReleaseVaultItem();
      }
    });
  }

  private tryReleaseVaultItem(): boolean {
    if (this.vaultDeliveryPending || this.vaultInboundPending > 0) return false;
    const next = this.forcedSpawnVault[this.forcedSpawnVault.length - 1];
    const spot = this.firstFreeCellInReadingOrder();
    if (!next || !spot) return false;
    if (next.kind === 'spawner' && !this.canSafelyDeliverSpawnerReward(next.typeId, next.tier)) return false;

    this.forcedSpawnVault.pop();
    const view = this.placeForcedSpawn(spot, next);

    const target = this.cellToWorld(spot);
    const from = this.vaultPosition();
    view.setPosition(from.x, from.y).setScale(0.72).setAlpha(0.35);
    this.vaultDeliveryPending = true;
    this.refreshForcedSpawnVault();
    this.saveState();
    this.tweens.add({
      targets: view,
      x: target.x,
      y: target.y,
      scale: 1,
      alpha: 1,
      duration: 360,
      ease: 'Cubic.Out',
      onComplete: () => {
        this.vaultDeliveryPending = false;
        this.refreshOrderBar();
        this.checkDeadlock();
        this.tryReleaseVaultItem();
      }
    });
    return true;
  }

  private placeForcedSpawn(spot: GridPosition, spawn: ForcedSpawn): BoardView {
    if (spawn.kind === 'crate') return this.placeCrate(spot, spawn.tier, spawn.remaining, spawn.readyAt);
    if (spawn.kind === 'splitter') return this.placeSplitter(spot, false);
    if (spawn.kind === 'resource-producer') return this.placeResourceProducer(spot, spawn.producerId, spawn.remaining, false);
    if (spawn.kind === 'spawner') return this.placeSpawner(spot, spawn.typeId, spawn.tier, false);
    if (spawn.kind === 'spawner-piece') return this.placeSpawnerPiece(spot, spawn.typeId, spawn.tier, false);
    return this.placeTile(spot, spawn.typeId, spawn.tier, false);
  }

  private drawCollectionBook(g: Phaser.GameObjects.Graphics, size: number, color: number): void {
    const w = size;
    const h = size * 0.68;
    const half = w / 2;
    g.fillStyle(color, 0.18);
    g.fillRoundedRect(-half, -h / 2, w, h, 3);
    g.lineStyle(1.5, color, 0.95);
    g.beginPath();
    g.moveTo(-half + 2, -h / 2 + 2);
    g.lineTo(-2, -h / 2 + 5);
    g.lineTo(0, h / 2 - 2);
    g.lineTo(2, -h / 2 + 5);
    g.lineTo(half - 2, -h / 2 + 2);
    g.lineTo(half - 2, h / 2 - 2);
    g.lineTo(2, h / 2);
    g.lineTo(0, h / 2 - 2);
    g.lineTo(-2, h / 2);
    g.lineTo(-half + 2, h / 2 - 2);
    g.closePath();
    g.strokePath();
    g.lineStyle(1, color, 0.45);
    g.lineBetween(-half + 6, -2, -5, 0);
    g.lineBetween(5, 0, half - 6, -2);
  }

  private buildMainCollectionButton(): void {
    const x = this.scale.width / 2;
    const y = this.scale.height - 18;
    const w = 44;
    const h = 30;
    this.mainCollectionPanel = this.add.graphics().setDepth(12);
    this.mainCollectionPanel.fillStyle(Theme.bgElevated, 0.96);
    this.mainCollectionPanel.fillRoundedRect(x - w / 2, y - h / 2, w, h, Theme.radiusChip);
    this.mainCollectionPanel.lineStyle(1, Theme.borderOnDark, 1);
    this.mainCollectionPanel.strokeRoundedRect(x - w / 2, y - h / 2, w, h, Theme.radiusChip);
    const icon = this.add.graphics().setPosition(x, y).setDepth(13);
    this.drawCollectionBook(icon, 20, Theme.textOnDarkMuted);
    this.mainCollectionBadge = this.add.text(x + 17, y - 12, '', {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric,
      fontSize: '8px',
      fontStyle: 'bold',
      color: hex(Theme.textOnDark),
      backgroundColor: hex(Theme.currencyGem),
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5).setDepth(14);
    const zone = this.add.zone(x, y, w, h).setDepth(15).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => this.openCollection());
    this.refreshMainCollectionButton();
  }

  private refreshMainCollectionButton(): void {
    if (!this.mainCollectionBadge) return;
    const count = unclaimedDiscoveryCount(this.collection);
    this.mainCollectionBadge.setText(count > 9 ? '9+' : String(count)).setVisible(count > 0);
  }

  private closeCollection(): void {
    this.collectionOverlay?.destroy(true);
    this.collectionOverlay = null;
    this.modalOpen = false;
  }

  private openCollection(initialScroll = 0): void {
    if (this.modalOpen || this.inputLocked) return;
    this.modalOpen = true;

    const overlay = this.add.container(0, 0).setDepth(3001);
    this.collectionOverlay = overlay;
    const shade = this.add.rectangle(
      this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height,
      0x000000, 0.68
    ).setInteractive();

    const panelW = Math.min(430, this.scale.width - 24);
    const panelH = Math.min(620, this.scale.height - 28);
    const left = this.scale.width / 2 - panelW / 2;
    const top = this.scale.height / 2 - panelH / 2;
    const bg = this.add.graphics();
    bg.fillStyle(Theme.bgElevated, 1);
    bg.fillRoundedRect(left, top, panelW, panelH, Theme.radiusPanel);
    bg.lineStyle(Theme.borderWidthStrong, Theme.borderOnDark, 1);
    bg.strokeRoundedRect(left, top, panelW, panelH, Theme.radiusPanel);

    const title = this.add.text(this.scale.width / 2, top + 24, 'COLLECTION', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading,
      fontSize: '19px',
      fontStyle: 'bold',
      color: hex(Theme.textOnDark)
    }).setOrigin(0.5);
    const subtitle = this.add.text(this.scale.width / 2, top + 45, 'DISCOVER ITEMS  ·  CLAIM ONE GEM EACH', {
      resolution: textResolution,
      fontFamily: Theme.fontMono,
      fontSize: '8px',
      color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0.5);
    const close = this.add.text(left + panelW - 18, top + 18, '×', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading,
      fontSize: '24px',
      color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.closeCollection());
    overlay.add([shade, bg, title, subtitle, close]);

    const viewportTop = top + 65;
    const viewportBottom = top + panelH - 14;
    const viewportH = viewportBottom - viewportTop;
    const scrollZone = this.add.zone(this.scale.width / 2, viewportTop + viewportH / 2, panelW - 20, viewportH)
      .setInteractive({ useHandCursor: true });
    const content = this.add.container(0, 0);
    const maskShape = this.add.graphics().setVisible(false);
    maskShape.fillStyle(0xffffff).fillRect(left + 10, viewportTop, panelW - 20, viewportH);
    content.setMask(maskShape.createGeometryMask());
    overlay.add([scrollZone, content, maskShape]);

    const innerW = panelW - 36;
    const slotGap = 3;
    const slotSize = Math.min(54, (innerW - slotGap * 2) / 3);
    const familyW = slotSize * 3 + slotGap * 2;
    const familyLeft = left + (panelW - familyW) / 2;
    // Derived from the viewport, not a fixed offset from the panel. Family
    // labels are drawn 25px ABOVE their grid, so a hardcoded `top + 85` put the
    // first one at top+60 while the scroll mask began at top+65 - clipping
    // "WOOD" and its count in half. Anchoring to the mask keeps them clear
    // however the header above changes.
    let nextGridTop = viewportTop + 34;
    let collectionDragMoved = 0;

    CHAINS.filter((chain) => !isCurrencyChain(chain.typeId)).forEach((chain) => {
      const gridTop = nextGridTop;
      const familyColor = chain.tiers[Math.min(4, chain.tiers.length - 1)].color;
      const label = this.add.text(familyLeft, gridTop - 25, chain.typeId === 'mineral' ? 'STONE' : chain.typeId.toUpperCase(), {
        resolution: textResolution,
        fontFamily: Theme.fontHeading,
        fontSize: '10px',
        fontStyle: 'bold',
        color: hex(familyColor)
      });
      const count = this.add.text(familyLeft + familyW, gridTop - 25,
        `${claimedInFamily(this.collection, chain.typeId)}/${chain.tiers.length}`, {
          resolution: textResolution,
          fontFamily: Theme.fontNumeric,
          fontSize: '9px',
          color: hex(Theme.textOnDarkMuted)
        }).setOrigin(1, 0);
      content.add([label, count]);

      chain.tiers.forEach((def, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const cellTop = gridTop + row * (slotSize + slotGap);
        const cx = familyLeft + slotSize / 2 + column * (slotSize + slotGap);
        const cy = cellTop + slotSize / 2;
        const discovered = isDiscovered(this.collection, chain.typeId, def.tier);
        const claimed = isClaimed(this.collection, chain.typeId, def.tier);
        const plate = this.add.graphics();
        plate.fillStyle(Theme.bg, discovered ? 0.92 : 0.48);
        plate.fillRoundedRect(cx - slotSize / 2, cellTop, slotSize, slotSize, Theme.radiusChip);
        plate.lineStyle(1, discovered && !claimed ? Theme.currencyGem : Theme.borderOnDark, discovered && !claimed ? 0.9 : 0.55);
        plate.strokeRoundedRect(cx - slotSize / 2, cellTop, slotSize, slotSize, Theme.radiusChip);
        content.add(plate);

        if (!discovered) {
          const question = this.add.text(cx, cy, '?', {
            resolution: textResolution,
            fontFamily: Theme.fontNumeric,
            fontSize: `${Math.max(13, slotSize * 0.42)}px`,
            fontStyle: 'bold',
            color: hex(Theme.textOnDarkMuted)
          }).setOrigin(0.5).setAlpha(0.5);
          content.add(question);
          return;
        }

        const iconSize = slotSize * 0.9;
        const icon = this.add.graphics();
        const render = drawTierIcon(icon, chain.typeId, def.tier, iconSize, materialLighting(def.color, def.tier));
        const present = iconPresentation(chain.typeId, def.tier, iconSize);
        icon.setAlpha(render.materialAlpha * (claimed ? 1 : 0.35));
        icon.setScale(present.scale).setPosition(cx + present.offsetX, cy + present.offsetY);
        content.add(icon);

        if (!claimed) {
          const scrim = this.add.graphics();
          scrim.fillStyle(Theme.bg, 0.35);
          scrim.fillRoundedRect(cx - slotSize / 2 + 1, cellTop + 1, slotSize - 2, slotSize - 2, Theme.radiusChip);
          const gem = currencyIcon(this, 'gem', Math.min(44, slotSize * 1.13)).setPosition(cx, cy);
          const gemBaseScaleX = gem.scaleX;
          const gemBaseScaleY = gem.scaleY;
          const hit = this.add.zone(cx, cy, slotSize, slotSize).setInteractive({ useHandCursor: true });
          hit.on('pointerup', () => this.time.delayedCall(0, () => {
            if (collectionDragMoved > 6) return;
            if (!claimDiscovery(this.collection, chain.typeId, def.tier)) return;
            hit.disableInteractive();
            addGems(this.economy, 1);
            this.updateCurrencyText();
            this.updateLevelBadge();
            this.saveState();

            // The slot resolves IN PLACE. This used to close the whole
            // collection and reopen it at the saved scroll when the gem
            // landed, which flashed the entire panel for one claim - most of
            // why claiming felt bad. The item art is already drawn under the
            // scrim, so revealing it is just a fade.
            this.tweens.add({ targets: scrim, alpha: 0, duration: 260, ease: 'Quad.Out' });
            this.tweens.add({
              targets: icon, alpha: render.materialAlpha, duration: 300, ease: 'Quad.Out'
            });
            plate.clear();
            plate.fillStyle(Theme.bg, 0.92);
            plate.fillRoundedRect(cx - slotSize / 2, cellTop, slotSize, slotSize, Theme.radiusChip);
            plate.lineStyle(1, Theme.borderOnDark, 0.55);
            plate.strokeRoundedRect(cx - slotSize / 2, cellTop, slotSize, slotSize, Theme.radiusChip);

            // The gem leaves the list and finishes its flight in SCENE space.
            // Inside `content` it was clipped by the list's mask and drawn
            // under the panel header, so it disappeared behind the top of the
            // collection exactly as it arrived. Reparenting keeps it whole and
            // lets it pass over everything on its way to the counter.
            const flightX = cx;
            const flightY = cy + content.y;
            content.remove(gem);
            this.add.existing(gem);
            gem.setPosition(flightX, flightY).setDepth(4200);

            const targetX = this.gemText.x;
            const targetY = this.gemText.y;
            // Arc rather than a straight line, and a control point pulled up
            // and toward the counter - a collected thing thrown to a counter
            // reads as a lob, and a linear slide reads as a sprite being
            // dragged.
            const ctrlX = (flightX + targetX) / 2 + (targetX - flightX) * 0.1;
            const ctrlY = Math.min(flightY, targetY) - Math.abs(targetX - flightX) * 0.22 - 40;
            // The claim beat is now a HOLD, not a swell. A short pause before
            // the gem leaves still gives the tap its own moment, without the
            // gem ever growing - which is what read as bloated at any size the
            // swell was tuned to.
            this.time.delayedCall(90, () => {
              burstParticles(this, flightX, flightY, Theme.currencyGem, 1);
              this.tweens.addCounter({
                from: 0,
                to: 1,
                duration: 430,
                ease: 'Cubic.In',
                onUpdate: (tween) => {
                  const t = tween.getValue() ?? 0;
                  const inv = 1 - t;
                  gem.setPosition(
                    inv * inv * flightX + 2 * inv * t * ctrlX + t * t * targetX,
                    inv * inv * flightY + 2 * inv * t * ctrlY + t * t * targetY
                  );
                  // Preserve the SVG's display-size scale. Setting this to a
                  // literal 1 reset the image to its huge native dimensions.
                  const flightScale = Phaser.Math.Linear(1.06, 0.42, t);
                  gem.setScale(gemBaseScaleX * flightScale, gemBaseScaleY * flightScale);
                  // Holds full opacity almost the whole way, then goes in
                  // the last stretch. Fading from the start made it vanish
                  // in mid-air instead of arriving anywhere.
                  gem.setAlpha(t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28);
                },
                onComplete: () => {
                  gem.destroy();
                  // The counter reacts, so the gem lands somewhere rather
                  // than simply disappearing off the top of the panel.
                  this.tweens.add({
                    targets: this.gemText,
                    scale: { from: 1.35, to: 1 },
                    duration: 260,
                    ease: 'Back.Out'
                  });
                }
              });
            });
          }));
          content.add([scrim, gem, hit]);
        }
      });
      const rows = Math.ceil(chain.tiers.length / 3);
      nextGridTop += rows * (slotSize + slotGap) + 38;
    });

    const contentBottom = nextGridTop - 38;
    const maxScroll = Math.max(0, contentBottom - viewportBottom);
    let scroll = 0;
    let dragging = false;
    let dragStartY = 0;
    let dragStartScroll = 0;
    const setScroll = (value: number): void => {
      scroll = Phaser.Math.Clamp(value, 0, maxScroll);
      content.y = -scroll;
    };
    setScroll(initialScroll);
    const onDown = (pointer: Phaser.Input.Pointer): void => {
      if (pointer.x < left + 10 || pointer.x > left + panelW - 10 || pointer.y < viewportTop || pointer.y > viewportBottom) return;
      dragging = true;
      dragStartY = pointer.y;
      dragStartScroll = scroll;
      collectionDragMoved = 0;
    };
    const onMove = (pointer: Phaser.Input.Pointer): void => {
      if (!dragging) return;
      collectionDragMoved = Math.max(collectionDragMoved, Math.abs(pointer.y - dragStartY));
      setScroll(dragStartScroll + dragStartY - pointer.y);
    };
    const onUp = (): void => { dragging = false; };
    const onWheel = (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void => {
      if (pointer.x < left || pointer.x > left + panelW || pointer.y < viewportTop || pointer.y > viewportBottom) return;
      setScroll(scroll + dy * 0.55);
    };
    this.input.on('pointerdown', onDown);
    this.input.on('pointermove', onMove);
    this.input.on('pointerup', onUp);
    this.input.on('wheel', onWheel);
    overlay.once('destroy', () => {
      this.input.off('pointerdown', onDown);
      this.input.off('pointermove', onMove);
      this.input.off('pointerup', onUp);
      this.input.off('wheel', onWheel);
    });
  }

  /** Tier colour for a crate. Metallic, deliberately outside every family ramp. */
  private crateAccent(tier: CrateTier): number {
    if (tier === 'vault') return Theme.currencyGem;
    if (tier === 'gold') return Theme.currencyCredit;
    if (tier === 'silver') return 0xc9d2d8;
    return 0xc08a52;
  }



  private refreshInventoryButton(hovered = false): void {
    if (!this.invBg) return;
    const x = this.boardOriginX;
    const y = this.boardOriginY + ROWS * this.cellSize + this.boardToTrayGap;
    const full = isFull(this.inventory);
    const accent = full ? Theme.accentAmber : Theme.textOnDarkMuted;

    // Drag-over enlargement expands evenly around the original centre while
    // staying inside the narrow control rail beside the information panel.
    const w = hovered ? 46 : 42;
    const h = hovered ? 35 : 31;
    const bx = x - (w - 42) / 2;
    const by = y - (h - 31) / 2;
    const hoverGrey = 0xe2e5e7;

    this.invBg.clear();
    this.invBg.fillStyle(Theme.bgElevated, 1);
    this.invBg.fillRoundedRect(bx, by, w, h, Theme.radiusChip);
    this.invBg.lineStyle(
      hovered ? Theme.borderWidthStrong : Theme.borderWidth,
      hovered ? hoverGrey : full ? accent : Theme.borderOnDark,
      1
    );
    this.invBg.strokeRoundedRect(bx, by, w, h, Theme.radiusChip);
    this.invIcon.clear();
    this.invIcon.setPosition(bx + w / 2, by + h / 2);
    drawBriefcase(this.invIcon, hovered ? 29 : 27, hovered ? hoverGrey : full ? accent : 0x9aa3ab);
    this.invZone?.setPosition(bx + w / 2, by + h / 2).setSize(w, h);
  }

  /**
   * Drives the drop-target feedback. The tray carries it because it is the
   * one surface a fingertip is never on top of mid-drag; the button also
   * grows modestly from its centre and turns very light grey while targeted.
   */
  private setInventoryHover(hovered: boolean): void {
    if (hovered === this.overInventory) return;
    this.overInventory = hovered;
    this.refreshInventoryButton(hovered);
    if (hovered) {
      this.refreshActionTray(
        isFull(this.inventory)
          ? `INVENTORY FULL  ·  ${this.inventory.slots}/${this.inventory.slots}
RELEASE TO PUT IT BACK`
          : `RELEASE TO STORE
${freeSlots(this.inventory)} INVENTORY SLOTS FREE`
      );
    } else {
      this.refreshActionTray();
    }
  }

  /** A small jolt when something drops in, so the store visibly lands. */
  private playInventoryNudge(): void {
    if (!this.invIcon) return;
    this.tweens.killTweensOf(this.invIcon);
    this.invIcon.setAngle(0);
    this.tweens.add({
      targets: this.invIcon,
      angle: { from: -7, to: 7 },
      duration: 55,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.InOut',
      onComplete: () => this.invIcon.setAngle(0)
    });
  }


  /** Earned crates are forced spawns: board immediately, or the infinite vault until space opens. */
  private awardCrate(tier: CrateTier, source = '', from?: { x: number; y: number }): boolean {
    const payload = cratePayload(rollCrate(
      tier, playerLevel(this.orderState), Math.random, this.ownedDispenserTypeIds()
    ));
    const waiting = !this.firstFreeCellInReadingOrder();
    this.enqueueForcedSpawn({ kind: 'crate', tier, remaining: payload, source }, from);
    this.refreshActionTray(
      waiting
        ? `${source ? source + '  ·  ' : ''}${CRATE_LABELS[tier]} ADDED TO THE VAULT`
        : `${source ? source + '  ·  ' : ''}${CRATE_LABELS[tier]} DELIVERED\nTAP IT TO TAKE OUT ONE THING AT A TIME`
    );
    return true;
  }

  /**
   * First empty cell scanning top-down, left-to-right.
   *
   * Deliberately NOT the random/nearest placement a source drop uses:
   * a delivered crate should always turn up in the same predictable corner
   * so the player knows where to look, rather than hunting the board for it.
   */
  private firstFreeCellInReadingOrder(): GridPosition | null {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (this.grid.isEmpty({ col, row })) return { col, row };
      }
    }
    return null;
  }

  /**
   * Takes a crate out of storage and puts it on the BOARD. It is not opened
   * here - a crate can only be opened where it sits, one tap at a time, so
   * the reveal happens on the board rather than in a modal that hands over
   * everything at once.
   */
  private deployStoredCrate(index: number, tier: CrateTier, kept?: CratePayloadEntry[], readyAt?: number): void {
    const empties = this.grid.emptyCells();
    if (empties.length === 0) {
      this.refreshActionTray('BOARD FULL  ·  MAKE SPACE FIRST\nTHE CRATE IS SAFE IN YOUR INVENTORY');
      return;
    }
    retrieveItem(this.inventory, index);
    // Rolled ONCE, here, and stored in the cell. Rolling at open time would
    // re-roll the contents on every reload part-way through emptying it.
    const payload = kept ?? cratePayload(rollCrate(
      tier, playerLevel(this.orderState), Math.random, this.ownedDispenserTypeIds()
    ));
    const pos = this.firstFreeCellInReadingOrder() ?? empties[0];
    // An absolute timestamp, so the wait kept running while it sat in the
    // inventory rather than pausing or restarting.
    this.placeCrate(pos, tier, payload, readyAt).playArrive();
    this.refreshInventoryButton();
    this.saveState();
    this.refreshActionTray(
      `${CRATE_LABELS[tier]} PLACED\nTAP IT TO TAKE OUT ONE THING AT A TIME`
    );
  }

  private placeCrate(pos: GridPosition, tier: string, remaining: CratePayloadEntry[], readyAt?: number): CrateView {
    const world = this.cellToWorld(pos);
    const view = new CrateView(this, world.x, world.y, this.cellSize, tier, pos);
    this.grid.set(pos, { kind: 'crate', tier, remaining, readyAt });
    this.views.set(this.keyOf(pos), view);
    if (readyAt != null) view.setWait(formatCrateWait(crateRemainingMs(readyAt, Date.now())));
    return view;
  }

  /**
   * Bought crates whose wait has not expired.
   *
   * This is what `SUPPLY_CRATE_LIMIT` caps, and capping the WAITING ones is
   * deliberate: it limits how many timers can run at once, which is the thing
   * that bounds how many pieces Credits can buy per day. Capping crates
   * held on the board instead would punish a player for stockpiling rewards
   * they earned, and would not bound the rate at all.
   */
  private waitingSupplyCrateCount(now = Date.now()): number {
    let count = 0;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cell = this.grid.get({ col, row });
        if (cell?.kind === 'crate' && !crateReady(cell.readyAt, now)) count++;
      }
    }
    for (const entry of this.inventory.items) {
      if (entry.kind === 'crate' && !crateReady(entry.readyAt, now)) count++;
    }
    return count;
  }

  /**
   * Redraws every sealed crate's countdown and opens the ones whose wait has
   * just expired. Driven from the same per-second tick the dispensers use.
   */
  private refreshCrateWaits(): void {
    const now = Date.now();
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const pos = { col, row };
        const cell = this.grid.get(pos);
        if (cell?.kind !== 'crate') continue;
        const view = this.views.get(this.keyOf(pos));
        if (!(view instanceof CrateView)) continue;
        if (crateReady(cell.readyAt, now)) {
          if (cell.readyAt != null) {
            // Clear the stored timestamp too, so a crate that has opened once
            // never re-seals if the device clock later moves backwards.
            cell.readyAt = undefined;
            this.grid.set(pos, cell);
            view.setWait(null);
            view.playArrive();
            this.saveState();
          }
          continue;
        }
        view.setWait(formatCrateWait(crateRemainingMs(cell.readyAt, now)));
      }
    }
  }

  private buySupplyCrate(offer: SupplyCrateOffer, from?: { x: number; y: number }): boolean {
    const price = supplyCratePrice(offer, playerLevel(this.orderState));
    if (this.economy.coins < price) {
      this.refreshActionTray(`NOT ENOUGH CREDITS  ·  ${CRATE_LABELS[offer.tier]}`);
      return false;
    }
    if (!supplyCrateReady(this.supplyCooldownUntil, Date.now())) {
      this.refreshActionTray(
        `SUPPLY DEPOT RESTOCKING\nNEXT CRATE IN ${formatCrateWait(supplyCooldownRemaining(this.supplyCooldownUntil, Date.now()))}`
      );
      return false;
    }
    const pos = this.firstFreeCellInReadingOrder();
    if (!pos) {
      this.refreshActionTray('BOARD FULL  ·  MAKE SPACE\nA SUPPLY CRATE NEEDS A CELL TO SIT IN');
      return false;
    }
    if (!spendCoinsGeneric(this.economy, price)) return false;
    const payload = cratePayload(rollCrate(
      offer.tier, playerLevel(this.orderState), Math.random, this.ownedDispenserTypeIds()
    ));

    // Flies in from wherever it was bought, the same arrival earned crates get.
    // Without this the whole purchase happened behind the shop panel and the
    // player saw nothing for their credits.
    // No readyAt: a bought crate is openable the moment it lands. The wait
    // lives on the SHOP now, not on the player's board.
    this.supplyCooldownUntil = Date.now() + offer.cooldownMs;
    const view = this.placeCrate(pos, offer.tier, payload);
    const target = this.cellToWorld(pos);
    const origin = from ?? this.vaultPosition();
    view.setPosition(origin.x, origin.y).setScale(0.5).setAlpha(0.2);
    this.tweens.add({
      targets: view,
      x: target.x, y: target.y, scale: 1, alpha: 1,
      duration: 460, ease: 'Cubic.Out',
      onComplete: () => {
        view.playArrive();
        burstParticles(this, target.x, target.y, this.crateAccent(offer.tier), 2);
      }
    });

    this.updateCurrencyText();
    this.saveState();
    this.refreshActionTray(
      `${CRATE_LABELS[offer.tier]} BOUGHT\nNEXT CRATE IN ${formatCrateWait(offer.cooldownMs)}`
    );
    return true;
  }

  /**
   * One tap, one thing out.
   *
   * Currency is paid straight into the HUD with the same floating receipt a
   * merge uses for XP - spawning a coin tile would be nonsense - while items
   * spawn onto the board through the normal placement path, so they also
   * trigger the locked-match hint. The crate is consumed once empty.
   */
  private tapCrate(view: CrateView): void {
    const cell = this.grid.get(view.gridPos);
    if (cell?.kind !== 'crate') return;
    if (!crateReady(cell.readyAt, Date.now())) {
      this.refreshActionTray(
        `${CRATE_LABELS[cell.tier as CrateTier] ?? 'CRATE'} IS STILL SEALED\nOPENS IN ${formatCrateWait(crateRemainingMs(cell.readyAt, Date.now()))}`
      );
      return;
    }
    const entry = cell.remaining[0];
    if (!entry) {
      void this.consumeCrate(view);
      return;
    }

    const world = this.cellToWorld(view.gridPos);
    if (entry.kind === 'item' || entry.kind === 'spawner-piece' || entry.kind === 'resource-producer') {
      // The item needs somewhere to go; the crate's own cell is not free yet.
      const empties = this.grid.emptyCells();
      if (empties.length === 0) {
        if (entry.kind === 'resource-producer') {
          cell.remaining.shift();
          this.enqueueForcedSpawn({ kind: 'resource-producer', producerId: entry.producerId, remaining: entry.remaining }, world);
          view.playDispensePulse();
          if (cell.remaining.length === 0) void this.consumeCrate(view);
          else this.grid.set(view.gridPos, cell);
          this.saveState();
          this.refreshActionTray('BOARD FULL  ·  PRODUCER SENT TO VAULT');
          return;
        }
        this.refreshActionTray('BOARD FULL  ·  MAKE SPACE\nTHE CRATE KEEPS WHAT IS STILL INSIDE');
        return;
      }
      cell.remaining.shift();
      // Nearest ring only, so the crate's contents pile up AROUND it rather
      // than appearing somewhere unrelated on the board.
      const nearest = this.nearestEmptyCells(view.gridPos, empties);
      const pos = nearest[Math.floor(Math.random() * nearest.length)];
      const spawned = entry.kind === 'item'
        ? this.placeTile(pos, entry.typeId, entry.tier, false)
        : entry.kind === 'spawner-piece'
          ? this.placeSpawnerPiece(pos, entry.typeId, entry.tier, false)
          : this.placeResourceProducer(pos, entry.producerId, entry.remaining, false);
      // Flies out of the crate rather than fading in at its destination.
      // placeTile's own hint is skipped (animateIn false) so it can fire
      // after the flight instead of underneath it.
      if (spawned instanceof TileView || spawned instanceof SpawnerPieceView) {
        void spawned.playSpawnFrom(world.x, world.y);
      } else {
        spawned.setPosition(world.x, world.y).playSpawnPulse();
        const target = this.cellToWorld(pos);
        this.tweens.add({ targets: spawned, x: target.x, y: target.y, duration: 320, ease: 'Cubic.Out' });
      }
      if (spawned instanceof TileView && !isCurrencyChain(spawned.typeId)) this.time.delayedCall(320, () => this.hintLockedMatch(spawned));
    } else {
      cell.remaining.shift();
      if (entry.kind === 'coins') {
        addCoins(this.economy, entry.amount);
        floatingScore(this, world.x, world.y - this.cellSize * 0.3, entry.amount, 'CR');
      } else if (entry.kind === 'gems') {
        addGems(this.economy, entry.amount);
        floatingScore(this, world.x, world.y - this.cellSize * 0.3, entry.amount, 'GM');
      } else {
        addEnergy(this.energy, entry.amount);
        floatingScore(this, world.x, world.y - this.cellSize * 0.3, entry.amount, 'E');
      }
      this.updateCurrencyText();
      this.updateEnergyText();
    }

    view.playDispensePulse();
    if (cell.remaining.length === 0) {
      void this.consumeCrate(view);
    } else {
      this.grid.set(view.gridPos, cell);
      // Selecting on tap is what puts SELL and STORE in the tray - a crate
      // has no other way to be picked up, since tapping it dispenses.
      this.selectedItemKey = this.keyOf(view.gridPos);
      this.rushTargetKey = null;
    }
    this.updateLevelBadge();
    this.saveState();
    this.refreshOrderBar();
    // Ends on the crate's own tray panel rather than a transient message:
    // what came out is already visible (a flying tile, or a floating
    // receipt), whereas how much is LEFT and the sell/store actions are not.
    this.refreshActionTray();
  }

  private async consumeCrate(view: CrateView): Promise<void> {
    const key = this.keyOf(view.gridPos);
    this.grid.set(view.gridPos, null);
    this.views.delete(key);
    await view.playEmptyAndDestroy();
    this.tryReleaseVaultItem();
    this.tryDeliverMeterGold();
    this.saveState();
    this.checkDeadlock();
  }

  private tapResourceProducer(view: ResourceProducerView): void {
    const cell = this.grid.get(view.gridPos);
    if (cell?.kind !== 'resource-producer') return;
    const empties = this.grid.emptyCells();
    if (empties.length === 0) {
      this.refreshActionTray('BOARD FULL  ·  MAKE SPACE\nNO DROP WAS USED');
      return;
    }
    const nearest = this.nearestEmptyCells(view.gridPos, empties);
    const pos = nearest[Math.floor(Math.random() * nearest.length)];
    const config = RESOURCE_PRODUCERS[cell.producerId];
    const tier = rollResourceTier(cell.producerId);
    const spawned = this.placeTile(pos, config.typeId, tier, false);
    const world = this.cellToWorld(view.gridPos);
    void spawned.playSpawnFrom(world.x, world.y);
    cell.remaining--;
    view.playDispensePulse();
    if (cell.remaining <= 0) {
      const key = this.keyOf(view.gridPos);
      this.grid.set(view.gridPos, null);
      this.views.delete(key);
      if (this.selectedItemKey === key) this.selectedItemKey = null;
      void view.playEmptyAndDestroy();
      this.tryReleaseVaultItem();
    } else {
      this.grid.set(view.gridPos, cell);
      this.selectedItemKey = this.keyOf(view.gridPos);
    }
    this.saveState();
    this.refreshOrderBar();
    this.refreshActionTray();
  }

  private collectCurrencyItem(view: TileView): void {
    const payout = currencyPayout(view.typeId, view.tier);
    if (payout <= 0) return;
    const key = this.keyOf(view.gridPos);
    const world = this.cellToWorld(view.gridPos);
    this.grid.set(view.gridPos, null);
    this.views.delete(key);
    if (this.selectedItemKey === key) this.selectedItemKey = null;
    view.destroy();
    if (view.typeId === 'currency-credit') addCoins(this.economy, payout);
    else if (view.typeId === 'currency-gem') addGems(this.economy, payout);
    else addEnergy(this.energy, payout);
    const unit = view.typeId === 'currency-credit' ? 'CR' : view.typeId === 'currency-gem' ? 'GM' : 'E';
    floatingScore(this, world.x, world.y, payout, unit);
    this.updateCurrencyText();
    this.updateEnergyText();
    this.tryReleaseVaultItem();
    this.saveState();
    this.refreshActionTray(`${getTierDef(view.typeId, view.tier)?.label?.toUpperCase() ?? 'RESOURCE'} COLLECTED`);
  }

  private collectFinalWater(view: TileView): void {
    if (view.typeId !== 'water' || getTierDef('water', view.tier + 1) != null) return;
    const key = this.keyOf(view.gridPos);
    const world = this.cellToWorld(view.gridPos);
    this.grid.set(view.gridPos, null);
    this.views.delete(key);
    if (this.selectedItemKey === key) this.selectedItemKey = null;
    addCoins(this.economy, FINAL_WATER_PAYOUT);
    this.updateCurrencyText();
    this.saveState();
    this.refreshOrderBar();
    this.refreshActionTray('HYDRO CORE COLLECTED  ·  +40,000 CREDITS');

    burstParticles(this, world.x, world.y, Theme.currencyCredit, 12);
    this.time.delayedCall(90, () => burstParticles(this, world.x, world.y - 8, 0xb4edf7, 12));
    floatingScore(this, world.x, world.y - 8, FINAL_WATER_PAYOUT, 'CR');
    view.setDepth(500);
    this.tweens.add({
      targets: view,
      y: world.y - 18,
      scaleX: 1.35,
      scaleY: 1.35,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.Out',
      onComplete: () => {
        view.destroy();
        this.tryReleaseVaultItem();
      }
    });
  }


  /** Puts a stored item back on the board, if there is a free cell. */
  private retrieveStoredItem(index: number): void {
    const empties = this.grid.emptyCells();
    if (empties.length === 0) {
      this.refreshActionTray('BOARD FULL  ·  MAKE SPACE FIRST\nTHE ITEM IS SAFE IN YOUR INVENTORY');
      return;
    }
    const item = retrieveItem(this.inventory, index);
    if (!item || (item.kind !== 'item' && item.kind !== 'spawner-piece' && item.kind !== 'resource-producer')) return;
    const pos = empties[Math.floor(Math.random() * empties.length)];
    if (item.kind === 'item') this.placeTile(pos, item.typeId, item.tier, true);
    else if (item.kind === 'spawner-piece') this.placeSpawnerPiece(pos, item.typeId, item.tier, true);
    else this.placeResourceProducer(pos, item.producerId, item.remaining, true);
    this.refreshInventoryButton();
    this.updateLevelBadge();
    this.saveState();
    this.refreshOrderBar();
    const label = item.kind === 'item'
      ? familyTierLabel(item.typeId, item.tier)
      : item.kind === 'spawner-piece'
        ? spawnerPieceLabel(item.typeId, item.tier)
        : RESOURCE_PRODUCERS[item.producerId].label.toUpperCase();
    this.refreshActionTray(`${label} RETRIEVED`);
  }

  /**
   * The inventory panel: one tile per slot, filled slots drawn with their
   * real icon so storage reads like a shelf rather than a list, plus the
   * next slot's gem price.
   */
  private showInventory(initialScroll = 0): void {
    if (this.modalOpen || this.inputLocked) return;
    this.modalOpen = true;

    const COLS_N = INVENTORY_GRID;
    const CELL = 72;
    const rows = Math.ceil(INVENTORY_MAX_SLOTS / COLS_N);
    const W = COLS_N * CELL + 40;
    const H = Math.min(this.scale.height - 40, 96 + INVENTORY_GRID * CELL);

    const overlay = this.add.rectangle(
      this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x000000, 0.6
    ).setDepth(3000).setInteractive();
    const card = this.add.container(this.scale.width / 2, this.scale.height / 2).setDepth(3001);
    const bg = this.add.graphics();
    bg.fillStyle(Theme.bgElevated, 1);
    bg.fillRoundedRect(-W / 2, -H / 2, W, H, Theme.radiusPanel);
    bg.lineStyle(Theme.borderWidthStrong, Theme.borderOnDark, 1);
    bg.strokeRoundedRect(-W / 2, -H / 2, W, H, Theme.radiusPanel);
    const titleIcon = this.add.graphics().setPosition(-50, -H / 2 + 18);
    drawBriefcase(titleIcon, 26, Theme.textOnDarkMuted);
    card.add([bg, titleIcon, this.add.text(-36, -H / 2 + 18, 'INVENTORY', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '16px', fontStyle: 'bold', color: hex(Theme.textOnDark)
    }).setOrigin(0, 0.5)]);

    const gridTop = -H / 2 + 40;
    const viewportBottom = H / 2 - 38;
    const viewportH = viewportBottom - gridTop;
    const content = this.add.container(0, 0);
    const maskShape = this.add.graphics().setVisible(false);
    maskShape.fillStyle(0xffffff).fillRect(
      card.x - W / 2 + 10,
      card.y + gridTop,
      W - 20,
      viewportH
    );
    content.setMask(maskShape.createGeometryMask());
    card.add(content);
    let scroll = 0;
    const maxScroll = Math.max(0, rows * CELL - viewportH);
    const setScroll = (value: number): void => {
      scroll = Phaser.Math.Clamp(value, 0, maxScroll);
      content.y = -scroll;
    };
    setScroll(initialScroll);
    let inventoryItemPressed = false;
    let scrolling = false;
    let scrollStartY = 0;
    let scrollStart = 0;
    const onScrollDown = (pointer: Phaser.Input.Pointer): void => {
      if (inventoryItemPressed) return;
      if (pointer.x < card.x - W / 2 + 10 || pointer.x > card.x + W / 2 - 10
        || pointer.y < card.y + gridTop || pointer.y > card.y + viewportBottom) return;
      scrolling = true;
      scrollStartY = pointer.y;
      scrollStart = scroll;
    };
    const onScrollMove = (pointer: Phaser.Input.Pointer): void => {
      if (!scrolling || inventoryItemPressed) return;
      setScroll(scrollStart + scrollStartY - pointer.y);
    };
    const onScrollUp = (): void => { scrolling = false; };
    const onScrollWheel = (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void => {
      if (pointer.x < card.x - W / 2 || pointer.x > card.x + W / 2
        || pointer.y < card.y + gridTop || pointer.y > card.y + viewportBottom) return;
      setScroll(scroll + dy * 0.55);
    };
    this.input.on('pointerdown', onScrollDown);
    this.input.on('pointermove', onScrollMove);
    this.input.on('pointerup', onScrollUp);
    this.input.on('wheel', onScrollWheel);
    const slotAtPointer = (x: number, y: number): number | null => {
      const localX = x - card.x + W / 2 - 20;
      const localY = y - card.y - content.y - gridTop;
      const col = Math.floor(localX / CELL);
      const row = Math.floor(localY / CELL);
      if (col < 0 || col >= COLS_N || row < 0 || row >= rows) return null;
      const slot = row * COLS_N + col;
      return slot < this.inventory.slots ? slot : null;
    };

    const dismiss = () => {
      this.input.off('pointerdown', onScrollDown);
      this.input.off('pointermove', onScrollMove);
      this.input.off('pointerup', onScrollUp);
      this.input.off('wheel', onScrollWheel);
      maskShape.destroy();
      overlay.destroy();
      card.destroy();
      this.modalOpen = false;
      this.refreshActionTray();
    };
    const reopen = () => {
      const preservedScroll = scroll;
      dismiss();
      this.time.delayedCall(0, () => this.showInventory(preservedScroll));
    };

    const nextCost = slotCost(this.inventory.slots);
    // Every cell of the 3x3 is drawn from the start. Owned slots are live,
    // the NEXT one carries its gem price, and the rest are shown locked
    // without a price - one number to act on rather than a wall of them.
    for (let slot = 0; slot < INVENTORY_MAX_SLOTS; slot++) {
      const cx = -W / 2 + 20 + (slot % COLS_N) * CELL + CELL / 2;
      const cy = gridTop + Math.floor(slot / COLS_N) * CELL + CELL / 2;
      const owned = slot < this.inventory.slots;
      const isNext = slot === this.inventory.slots && nextCost !== null;
      const item = owned ? this.inventory.items[slot] : undefined;

      const cell = this.add.graphics();
      const inset = 5;
      const box: [number, number, number, number] = [
        cx - CELL / 2 + inset, cy - CELL / 2 + inset, CELL - inset * 2, CELL - inset * 2
      ];
      cell.fillStyle(owned ? (item ? Theme.bg : Theme.panelAlt) : Theme.bg, owned && item ? 0.85 : 0.3);
      cell.fillRoundedRect(...box, Theme.radiusChip);
      cell.lineStyle(
        1,
        isNext ? Theme.currencyGem : Theme.borderOnDark,
        owned ? 1 : isNext ? 0.9 : 0.35
      );
      cell.strokeRoundedRect(...box, Theme.radiusChip);
      content.add(cell);

      if (item) {
        const icon = this.add.graphics();
        let visual: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image | Phaser.GameObjects.Container = icon;
        const size = CELL - 26;
        if (item.kind === 'crate') {
          drawCrate(icon, size, item.tier);
          icon.setPosition(cx, cy);
        } else if (item.kind === 'resource-producer') {
          const image = this.add.image(cx, cy, RESOURCE_PRODUCERS[item.producerId].textureKey).setDisplaySize(size, size);
          visual = image;
          content.add(image);
        } else if (item.kind === 'spawner-piece') {
          drawSpawnerPieceIcon(icon, item.typeId, item.tier, size);
          icon.setPosition(cx, cy - 2);
        } else if (item.typeId.startsWith('currency-') && !(item.typeId === 'currency-credit' && item.tier >= 3)) {
          const textureKey = item.typeId === 'currency-credit'
            ? 'currency-coin'
            : item.typeId === 'currency-gem'
              ? 'currency-gem'
              : 'currency-energy';
          const count = item.tier === 1 ? 1 : item.tier === 2 ? 2 : Math.min(6, item.tier + 1);
          const positions: [number, number][] = [
            [0, 4], [-10, 7], [10, 0], [-6, -9], [8, -11], [1, 12]
          ];
          const currencyIcon = this.add.container(cx, cy);
          const iconSize = CELL * (item.tier <= 2 ? 0.52 : 0.36);
          for (let i = count - 1; i >= 0; i--) {
            const [x, y] = positions[i];
            currencyIcon.add(this.add.image(x, y, textureKey).setDisplaySize(iconSize, iconSize));
          }
          visual = currencyIcon;
          content.add(currencyIcon);
        } else {
          const def = getTierDef(item.typeId, item.tier);
          const { materialAlpha } = drawTierIcon(
            icon, item.typeId, item.tier, size, materialLighting(def?.color ?? Theme.panelAlt, item.tier)
          );
          icon.setAlpha(materialAlpha);
          const present = iconPresentation(item.typeId, item.tier, size);
          icon.setScale(present.scale).setPosition(cx + present.offsetX, cy - 4 + present.offsetY);
        }
        const hit = this.add.zone(cx, cy, CELL - 10, CELL - 10).setInteractive({ useHandCursor: true });
        this.input.setDraggable(hit);
        let wasDragged = false;
        let pressX = 0;
        let pressY = 0;
        hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          inventoryItemPressed = true;
          pressX = pointer.x;
          pressY = pointer.y;
        });
        hit.on('drag', (pointer: Phaser.Input.Pointer) => {
          if (!wasDragged && Phaser.Math.Distance.Between(pressX, pressY, pointer.x, pointer.y) <= 6) return;
          if (!wasDragged) {
            wasDragged = true;
            content.bringToTop(visual);
            content.bringToTop(hit);
          }
          visual.setPosition(pointer.x - card.x, pointer.y - card.y - content.y);
        });
        hit.on('dragend', (pointer: Phaser.Input.Pointer) => {
          inventoryItemPressed = false;
          if (!wasDragged) return;
          const target = slotAtPointer(pointer.x, pointer.y);
          if (target === null || target === slot) {
            visual.setPosition(cx, cy);
            return;
          }
          const items = this.inventory.items;
          if (target < items.length) {
            [items[slot], items[target]] = [items[target], items[slot]];
          } else {
            const [movedItem] = items.splice(slot, 1);
            items.splice(Math.min(target, items.length), 0, movedItem);
          }
          this.saveState();
          reopen();
        });
        hit.on('pointerup', () => {
          inventoryItemPressed = false;
          if (wasDragged) return;
          this.time.delayedCall(0, () => {
            if (item.kind === 'crate') this.deployStoredCrate(slot, item.tier as CrateTier, item.remaining, item.readyAt);
            else this.retrieveStoredItem(slot);
            reopen();
          });
        });
        content.add([icon, hit]);
      } else if (isNext) {
        // Priced in full colour whether or not the player can afford it. A
        // greyed-out price reads as "not for sale"; this one is for sale, and
        // the answer to not having the gems is the gem store, not a dead
        // button.
        // A labelled buy PILL rather than a bare number: the word says what
        // the price does, and putting the cost on a filled chip is what makes
        // it read as a button instead of a caption.
        const unlockLabel = this.add.text(cx, cy - 20, 'UNLOCK', {
          resolution: textResolution,
          fontFamily: Theme.fontHeading, fontSize: '11px', fontStyle: 'bold',
          color: hex(Theme.textOnDark)
        }).setOrigin(0.5);

        const pillGroup = currencyPill(this, `${nextCost}`, 'gem').setPosition(cx, cy + 6);

        // The WHOLE cell is the target. The hit area used to be the price
        // text itself, which is a ~20px sliver next to the glyph - the cell
        // looks like a button and has to behave like one.
        const buyHit = this.add.zone(cx, cy, CELL - 10, CELL - 10)
          .setInteractive({ useHandCursor: true });
        buyHit.on('pointerdown', () => this.time.delayedCall(0, () => {
          const result = buySlot(this.inventory, (amount) => spendGems(this.economy, amount));
          if (!result.ok) {
            // Short of gems: go where the gems are, rather than reporting a
            // shortfall and leaving the player to find the store themselves.
            dismiss();
            this.openShop('gem');
            return;
          }
          this.updateCurrencyText();
          this.refreshInventoryButton();
          this.saveState();
          reopen();
        }));
        content.add([unlockLabel, pillGroup, buyHit]);
      } else if (!owned) {
        content.add(this.add.text(cx, cy, '·', {
          resolution: textResolution,
          fontFamily: Theme.fontNumeric, fontSize: '14px', color: hex(Theme.borderOnDark)
        }).setOrigin(0.5));
      }
    }

    const close = this.add.text(0, H / 2 - 18, 'CLOSE', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '12px', fontStyle: 'bold', color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    card.add(close);
    overlay.on('pointerdown', () => this.time.delayedCall(0, dismiss));
    close.on('pointerdown', () => this.time.delayedCall(0, dismiss));
  }

  private buildActionTray(): void {
    const railW = 48;
    const x = this.boardOriginX + railW;
    const y = this.boardOriginY + ROWS * this.cellSize + this.boardToTrayGap;
    const w = COLS * this.cellSize - railW;
    const h = 66;

    this.actionBg = this.add.graphics();
    this.actionBg.fillStyle(Theme.bgElevated, 1);
    this.actionBg.fillRoundedRect(x, y, w, h, Theme.radiusPanel);
    this.actionBg.lineStyle(Theme.borderWidth, Theme.borderOnDark, 1);
    this.actionBg.strokeRoundedRect(x, y, w, h, Theme.radiusPanel);

    this.actionText = this.add.text(x + 14, y + h / 2, '', {
      resolution: textResolution,
      fontFamily: Theme.fontMono,
      fontSize: '11px',
      color: hex(Theme.textOnDarkMuted),
      lineSpacing: 2
    }).setOrigin(0, 0.5);

    this.sellButtonRightX = x + w - 12;
    this.sellButtonCenterY = y + h / 2;
    // Created BEFORE the label so it paints behind it.
    this.sellButtonBg = this.add.graphics();
    // Verb and amount are SEPARATE objects. As one two-line text they could
    // only be aligned to each other, and the currency glyph hangs off the
    // second line - so the first line was centred on a narrower box than the
    // second and the two never lined up.
    const labelStyle = {
      resolution: textResolution,
      fontFamily: Theme.fontMono,
      fontSize: '12px',
      fontStyle: 'bold',
      color: hex(Theme.currencyCredit)
    };
    this.sellButton = this.add.text(x + w - 12, y + h / 2, '', labelStyle).setOrigin(0.5, 0.5);
    this.sellButtonAmount = this.add.text(x + w - 12, y + h / 2, '', labelStyle).setOrigin(1, 0.5);
    this.sellButtonMark = this.add.image(0, 0, 'currency-coin').setVisible(false);
    // One shared right-hand action button. Which action it performs depends
    // on what the tray is currently showing (an item selected to sell, or a
    // dry source offered for rushing). The whole CHIP is the target, not just
    // the words in it.
    this.sellButtonZone = this.add.zone(0, 0, 10, 10)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.sellButtonZone.on('pointerdown', () => {
      if (this.selectedItemKey) this.sellSelectedItem();
      else if (this.rushTargetKey) this.rushSource();
    });

  }

  private refreshActionTray(message?: string): void {
    this.refreshBoardExpansionLocks();
    this.clearOrderRewardTexts();
    this.actionText
      ?.setColor(hex(Theme.textOnDarkMuted))
      .setWordWrapWidth(Math.max(80, this.sellButtonRightX - this.actionText.x), true);
    const selected = this.selectedItemKey ? this.views.get(this.selectedItemKey) : null;
    if (selected instanceof CrateView) {
      this.rushTargetKey = null;
      const cell = this.grid.get(selected.gridPos);
      const left = cell?.kind === 'crate' ? cell.remaining.length : 0;
      const value = this.crateSellValue(selected);
      this.actionText.setText(
        `${CRATE_LABELS[selected.crateTier as CrateTier]}  ·  ${left} LEFT INSIDE\nTAP IT AGAIN FOR THE NEXT ONE`
      );
      this.setSellButton('SELL', `+${value}`, 'credit', Theme.currencyCredit);
      return;
    }
    if (selected instanceof TileView) {
      this.rushTargetKey = null;
      const def = getTierDef(selected.typeId, selected.tier);
      const isMaxLevel = getTierDef(selected.typeId, selected.tier + 1) == null;
      const value = this.sellValueFor(selected.typeId, selected.tier);
      if (isCurrencyChain(selected.typeId)) {
        const payout = currencyPayout(selected.typeId, selected.tier);
        this.actionText.setText(
          `${def?.label?.toUpperCase() ?? 'RESOURCE'}  ·  COLLECT +${payout}\n` +
          (isMaxLevel ? 'THIS ITEM IS MAX LEVEL  ·  DOUBLE-TAP TO COLLECT' : 'DOUBLE-TAP TO COLLECT  ·  MERGE FOR MORE')
        );
        this.sellButton.setVisible(false);
        this.sellButtonMark.setVisible(false);
        this.sellButtonBg.setVisible(false);
        this.sellButtonAmount.setVisible(false);
        this.sellButtonZone.setVisible(false);
        return;
      } else if (selected.typeId === 'water' && isMaxLevel) {
        this.actionText.setText(
          `${def?.label?.toUpperCase() ?? 'HYDRO CORE'}  ·  COLLECT +${FINAL_WATER_PAYOUT.toLocaleString()} CREDITS\n` +
          'THIS ITEM IS MAX LEVEL  ·  DOUBLE-TAP TO COLLECT'
        );
        this.sellButton.setVisible(false);
        this.sellButtonMark.setVisible(false);
        this.sellButtonBg.setVisible(false);
        this.sellButtonAmount.setVisible(false);
        this.sellButtonZone.setVisible(false);
        return;
      } else {
        this.actionText.setText(
          `${def?.label?.toUpperCase() ?? 'ITEM'}\n${familyTierLabel(selected.typeId, selected.tier)}` +
          (isMaxLevel ? '  ·  THIS ITEM IS MAX LEVEL' : '')
        );
      }
      this.setSellButton('SELL', `+${value}`, 'credit', Theme.currencyCredit);
      return;
    }
    if (selected instanceof ResourceProducerView) {
      this.rushTargetKey = null;
      const cell = this.grid.get(selected.gridPos);
      const remaining = cell?.kind === 'resource-producer' ? cell.remaining : 0;
      const value = this.resourceProducerSellValue(selected);
      this.actionText.setText(
        `${RESOURCE_PRODUCERS[selected.producerId].label.toUpperCase()}  ·  ${remaining} LEFT\nTAP IT TO RELEASE ONE RESOURCE ITEM`
      );
      this.setSellButton('SELL', `+${value}`, 'credit', Theme.currencyCredit);
      return;
    }
    if (selected instanceof SpawnerPieceView) {
      this.rushTargetKey = null;
      const value = this.sellValueFor(selected.typeId, selected.tier);
      this.actionText.setText(
        `${spawnerPieceLabel(selected.typeId, selected.tier)}\nMERGE PIECES INTO ${sourceTierLabel(selected.typeId, 1)}`
      );
      this.setSellButton('SELL', `+${value}`, 'credit', Theme.currencyCredit);
      return;
    }
    if (selected instanceof SplitterView) {
      this.rushTargetKey = null;
      this.actionText.setText('SPLITTER\nDRAG ONTO A TIER 02+ ITEM TO DIVIDE IT');
      this.sellButton.setVisible(false);
      this.sellButtonMark.setVisible(false);
      this.sellButtonBg.setVisible(false);
      this.sellButtonAmount.setVisible(false);
      this.sellButtonZone.setVisible(false);
      return;
    }
    this.selectedItemKey = null;

    const sourceView = this.rushTargetKey ? this.views.get(this.rushTargetKey) : null;
    if (sourceView instanceof SpawnerView) {
      const now = Date.now();
      syncDispenser(sourceView.spawner, now);
      const capacity = capacityForTier(sourceView.spawner.typeId, sourceView.spawner.tier);
      const remaining = msRemaining(sourceView.spawner, now);
      const available = sourceView.spawner.charges;
      const family = FAMILY_NAMES[sourceView.spawner.typeId] ?? sourceView.spawner.typeId.toUpperCase();
      const baseTier = String(sourceView.spawner.tier).padStart(2, '0');
      const familyTierCap = CHAINS.find((chain) => chain.typeId === sourceView.spawner.typeId)?.tiers.length ?? 9;
      const highestTier = String(Math.min(familyTierCap, sourceView.spawner.tier + 2)).padStart(2, '0');
      this.actionText.setText(
        `${sourceTierLabel(sourceView.spawner.typeId, sourceView.spawner.tier)}  ·  ${available}/${capacity} AVAILABLE\n` +
        `OUTPUT ${family} ${baseTier}–${highestTier}  ·  ${remaining > 0 ? `NEXT ${formatCountdown(remaining)}` : 'RESERVOIR FULL'}`
      );
      if (available <= 0 && remaining > 0) {
        const cost = rushCostGems(sourceView.spawner, now);
        const affordable = this.economy.gems >= cost;
        this.setSellButton('REFILL', String(cost), 'gem', affordable ? Theme.currencyGem : Theme.textOnDarkMuted);
      } else {
        this.sellButton.setVisible(false);
    this.sellButtonMark.setVisible(false);
    this.sellButtonBg.setVisible(false);
    this.sellButtonAmount.setVisible(false);
    this.sellButtonZone.setVisible(false);
        this.sellButtonMark.setVisible(false);
      }
      return;
    }
    this.rushTargetKey = null;

    this.sellButton?.setVisible(false);
    this.sellButtonMark?.setVisible(false);
    this.sellButtonBg?.setVisible(false);
    this.sellButtonAmount?.setVisible(false);
    this.sellButtonZone?.setVisible(false);
    const full = this.grid.emptyCells().length === 0;
    const pending = this.forcedSpawnVault.length > 0 ? `  ·  ${this.forcedSpawnVault.length} IN VAULT` : '';
    this.actionText
      ?.setText(message ?? (full
      ? `BOARD FULL${pending}\nTAP AN ITEM TO SELL`
      : `TAP A SOURCE TO PRODUCE${pending}\nDRAG MATCHES TO MERGE`));
  }

  update(): void {
    const now = Date.now();
    for (const view of this.views.values()) {
      if (view instanceof SpawnerView) view.refreshTimerPie(now);
    }
    this.shopCountdownUpdater?.();
    this.energyMenuUpdater?.();
    if (isMeterCooling(this.rewards, now)) {
      this.drawCrateMeterProgress(now);
      const second = Math.ceil(meterCooldownRemaining(this.rewards, now) / 1000);
      if (second !== this.crateMeterSecond) this.refreshCrateMeter(now);
    } else if (this.crateMeterWasCooling) {
      finishMeterCooldown(this.rewards, now);
      this.refreshCrateMeter(now);
      this.refreshOrderBar();
      this.saveState();
    }
  }

  private clearOrderRewardTexts(): void {
    for (const text of this.orderRewardTexts) text.destroy();
    this.orderRewardTexts = [];
  }

  /** Expanded order receipt with full names and matching resource colors. */
  private showOrderDetails(order: OrderDef, current: number, target: number): void {
    this.clearOrderRewardTexts();
    if (this.selectedItemKey) {
      const selected = this.views.get(this.selectedItemKey);
      if (selected instanceof TileView || selected instanceof SpawnerPieceView) selected.setSelected(false);
    }
    this.selectedItemKey = null;
    this.rushTargetKey = null;
    this.sellButton.setVisible(false);
    this.sellButtonMark.setVisible(false);
    this.sellButtonBg.setVisible(false);
    this.sellButtonAmount.setVisible(false);
    this.sellButtonZone.setVisible(false);

    const trayX = this.boardOriginX + 48;
    const trayY = this.boardOriginY + ROWS * this.cellSize + this.boardToTrayGap;
    const left = trayX + 14;
    const right = trayX + COLS * this.cellSize - 14;
    this.actionText
      .setPosition(left, trayY + 8)
      .setOrigin(0, 0)
      .setFontSize(10)
      .setLineSpacing(1)
      .setColor(hex(Theme.textOnDark))
      .setText(`${order.title.toUpperCase()}\nPROGRESS  ${current}/${target}`);

    // Spendable currencies show their MARK; XP and a source reward stay in
    // words, because neither has one. The tray's title and progress line
    // above is a DESCRIPTION and keeps words throughout - it is only these
    // value chips that change, and they change because the receipt that
    // floats off this very card when the order is delivered already uses the
    // mark.
    type Reward = { label: string; color: number } | { amount: number; kind: CurrencyKind } | { art: 'shipping' };
    const rewards: Reward[] = [
      { amount: order.rewardCoins, kind: 'credit' }
    ];
    if (order.rewardEnergy) rewards.push({ amount: order.rewardEnergy, kind: 'energy' });
    if (order.rewardGems) rewards.push({ amount: order.rewardGems, kind: 'gem' });
    if (order.rewardSpawner) {
      rewards.push({
        label: `+${order.rewardSpawner.typeId.toUpperCase()} SOURCE`,
        color: getTierDef(order.rewardSpawner.typeId, 1)?.color ?? Theme.accentGreen
      });
    }
    if (order.rewardShippingContainer) {
      rewards.push({ art: 'shipping' });
    }

    let cursorX = left;
    let lineY = trayY + 43;
    for (const reward of rewards) {
      if (cursorX !== left) {
        // The separator is its own object now: it used to be prepended to
        // each label's string, which a drawn glyph has no way to carry.
        const dot = this.add.text(cursorX, lineY, '  ·  ', {
          resolution: textResolution,
          fontFamily: Theme.fontNumeric,
          fontSize: '9px',
          color: hex(Theme.textOnDarkMuted)
        });
        cursorX += dot.width;
        this.orderRewardTexts.push(dot);
      }

      const chip = 'art' in reward
        ? (() => {
            const icon = this.add.graphics().setX(15);
            drawCrate(icon, 30, 'shipping');
            return this.add.container(0, 0, [icon]).setSize(30, 30);
          })()
        : 'kind' in reward
          ? currencyLabel(this, `+${reward.amount}`, reward.kind, { fontSize: 9, glyphSize: 10, gap: 3 })
          : this.add.text(0, 0, reward.label, {
            resolution: textResolution,
            fontFamily: Theme.fontNumeric,
            fontSize: '9px',
            fontStyle: 'bold',
            color: hex(reward.color)
          }).setOrigin(0, 0.5);

      if (cursorX !== left && cursorX + chip.width > right) {
        lineY += 12;
        cursorX = left;
      }
      // Containers position from their centre line, text from its own origin,
      // so both are anchored on the same baseline explicitly.
      chip.setPosition(cursorX, lineY + 5);
      cursorX += chip.width;
      this.orderRewardTexts.push(chip);
    }
  }

  /**
   * Sets the shared tray action button to a verb over an amount, with the
   * currency's MARK rather than its letter code.
   *
   * The button is right-aligned, so the text has to shift left by exactly the
   * space the mark will occupy - a glyph cannot live inside the text object
   * the way ` CR` did.
   */
  private setSellButton(verb: string, amount: string, kind: CurrencyKind, color: number): void {
    const GLYPH = 16;
    const GAP = 4;
    const PAD_X = 10;
    const PAD_Y = 5;
    const LINE = 7;

    // REFILL is a longer word than SELL. A slightly smaller refill label
    // keeps the source action chip close to the sell chip's width, leaving
    // the descriptive copy more room in the tray.
    this.sellButton.setFontSize(verb === 'REFILL' ? 10 : 12);
    this.sellButton.setText(verb).setColor(hex(color)).setVisible(true);
    this.sellButtonAmount.setText(amount).setColor(hex(color)).setVisible(true);

    // The chip is as wide as its widest LINE, and each line is then centred
    // in it - the amount line measured with its glyph included.
    const amountLine = this.sellButtonAmount.width + GAP + GLYPH;
    const contentW = Math.max(this.sellButton.width, amountLine);
    const w = contentW + PAD_X * 2;
    const h = this.sellButton.height + LINE * 2 + PAD_Y;
    const x = this.sellButtonRightX - w;
    const cy = this.sellButtonCenterY;
    const midX = x + w / 2;

    // Keep descriptive copy inside the space to the left of the action chip.
    // This width is recalculated because REFILL and SELL are not identical.
    this.actionText.setWordWrapWidth(Math.max(80, x - this.actionText.x - 8), true);

    this.sellButtonBg.clear();
    this.sellButtonBg.fillStyle(Theme.bgElevated, 1);
    this.sellButtonBg.fillRoundedRect(x, cy - h / 2, w, h, Theme.radiusChip);
    this.sellButtonBg.lineStyle(Theme.borderWidth, color, 0.6);
    this.sellButtonBg.strokeRoundedRect(x, cy - h / 2, w, h, Theme.radiusChip);
    this.sellButtonBg.setVisible(true);

    this.sellButton.setPosition(midX, cy - LINE);
    // Right-origin, so this is the amount's right edge - placed so the amount
    // plus its glyph are centred as a pair.
    this.sellButtonAmount.setPosition(midX + amountLine / 2 - GAP - GLYPH, cy + LINE);
    applyCurrencyIcon(this.sellButtonMark, kind, GLYPH, color);
    this.sellButtonMark
      .setPosition(midX + amountLine / 2 - GLYPH / 2, cy + LINE)
      .setVisible(true);

    this.sellButtonZone.setPosition(midX, cy).setSize(w, h).setVisible(true);
    (this.sellButtonZone.input?.hitArea as Phaser.Geom.Rectangle | undefined)?.setTo(0, 0, w, h);
  }

  /** Spends gems to refill the complete dry source reservoir. */
  private rushSource(): void {
    if (this.modalOpen || this.inputLocked || !this.rushTargetKey) return;
    const view = this.views.get(this.rushTargetKey);
    if (!(view instanceof SpawnerView)) return;
    const d = view.spawner;
    if (msRemaining(d) <= 0) return;

    const cost = rushCostGems(d);
    if (!spendGems(this.economy, cost)) {
      this.refreshActionTray(`NOT ENOUGH GEMS\nRUSH COSTS ${cost} GM`);
      return;
    }
    refillDispenser(d);
    view.refresh();
    view.playSpawnPulse();
    this.updateCurrencyText();
    this.saveState();
    this.refreshActionTray();
  }

  private selectItem(key: string): void {
    if (this.selectedItemKey) {
      const previous = this.views.get(this.selectedItemKey);
      if (previous instanceof TileView || previous instanceof SpawnerPieceView) previous.setSelected(false);
    }
    const next = this.views.get(key);
    if (next instanceof CrateView) {
      this.selectedItemKey = key;
      this.rushTargetKey = null;
      this.refreshActionTray();
      return;
    }
    if (!(next instanceof TileView) && !(next instanceof SpawnerPieceView)) {
      this.selectedItemKey = null;
      this.refreshActionTray();
      return;
    }
    this.selectedItemKey = key;
    next.setSelected(true);
    this.refreshActionTray();
  }

  /** Small recovery value for freeing board space; orders remain the main coin source. */
  private sellValueFor(typeId: string, tier: number): number {
    // First 8 values are real captured Merge Mansion data (see README).
    // Tiers 9-12 are EXTRAPOLATED, roughly continuing the curve's ~2x-per-tier
    // pattern - none of them are sourced. 9 was added when this project gained
    // a ninth tier, and 10-12 when Water gained a twelve-tier chain. All four
    // are provisional until real data is found.
    const MERGE_MANSION_SELL_CURVE = [1, 2, 4, 6, 12, 25, 51, 102, 204, 408, 816, 1632];
    const normal = MERGE_MANSION_SELL_CURVE[Math.min(tier, MERGE_MANSION_SELL_CURVE.length) - 1] ?? 1;
    return typeId === 'water' ? Math.max(1, Math.floor(normal / 2)) : normal;
  }

  /**
   * What a part-emptied crate is worth: the sum of what is still inside,
   * valued the way each thing is valued elsewhere. A flat per-tier price
   * would pay the same for a full crate as for one with a single plank left.
   */
  private crateSellValue(view: CrateView): number {
    const cell = this.grid.get(view.gridPos);
    if (cell?.kind !== 'crate') return 0;
    let total = 0;
    for (const entry of cell.remaining) {
      if (entry.kind === 'item') total += this.sellValueFor(entry.typeId, entry.tier);
      else if (entry.kind === 'spawner-piece') total += this.sellValueFor(entry.typeId, entry.tier);
      // Every currency converts through the canonical rates in Economy.ts, and
      // a producer is valued from its own drop table. These used to be three
      // hand-written numbers that disagreed with the shop and with each other.
      else if (entry.kind === 'resource-producer') {
        total += entry.remaining * expectedProducerCoinValue(entry.producerId, COINS_PER_GEM, COINS_PER_ENERGY);
      } else if (entry.kind === 'coins') total += entry.amount;
      else if (entry.kind === 'gems') total += entry.amount * COINS_PER_GEM;
      else total += entry.amount * COINS_PER_ENERGY;
    }
    return Math.max(1, Math.round(total * 0.6));
  }

  private resourceProducerSellValue(view: ResourceProducerView): number {
    const cell = this.grid.get(view.gridPos);
    if (cell?.kind !== 'resource-producer') return 0;
    const unit = cell.producerId === 'gem-basket' ? 25 : cell.producerId === 'energy-basket' ? 4 : 2;
    return Math.max(1, Math.round(cell.remaining * unit * 0.5));
  }

  private sellSelectedCrate(view: CrateView): void {
    const value = this.crateSellValue(view);
    this.grid.set(view.gridPos, null);
    this.views.delete(this.selectedItemKey!);
    this.selectedItemKey = null;
    view.destroy();
    this.tryReleaseVaultItem();
    this.tryDeliverMeterGold();
    addCoins(this.economy, value);
    this.updateCurrencyText();
    this.saveState();
    this.refreshOrderBar();
    this.refreshActionTray(`CRATE SOLD  +${value} CR\nSPACE RECOVERED`);
  }

  private sellSelectedItem(): void {
    if (this.modalOpen || this.inputLocked || !this.selectedItemKey) return;
    const view = this.views.get(this.selectedItemKey);
    if (view instanceof CrateView) {
      this.sellSelectedCrate(view);
      return;
    }
    if (view instanceof TileView && isCurrencyChain(view.typeId)) return;
    if (!(view instanceof TileView) && !(view instanceof SpawnerPieceView) && !(view instanceof ResourceProducerView)) return;
    const value = view instanceof ResourceProducerView
      ? this.resourceProducerSellValue(view)
      : this.sellValueFor(view.typeId, view.tier);
    this.grid.set(view.gridPos, null);
    this.views.delete(this.selectedItemKey);
    view.destroy();
    this.selectedItemKey = null;
    addCoins(this.economy, value);
    this.updateCurrencyText();
    this.tryReleaseVaultItem();
    this.tryDeliverMeterGold();
    this.saveState();
    this.refreshOrderBar();
    this.refreshActionTray(`SOLD  +${value} CR\nSPACE RECOVERED`);
  }

  private queueSpawnerReward(typeId: string, tier: number, from?: { x: number; y: number }): void {
    this.enqueueForcedSpawn({ kind: 'spawner', typeId, tier }, from);
  }

  /**
   * A locked tier-1 cell can only ever be cleared by a tier-1 spawner of
   * its own family (merging only goes up, never down). Handing out a
   * SECOND spawner of a family that still has locked tier-1 cells lets the
   * player merge both away into a tier-2+ spawner, permanently stranding
   * those cells - so a tier-1 reward only delivers once any earlier
   * same-family spawner has already cleared its family's locked tier-1s.
   * The first-ever spawner of a family is always safe (nothing to merge it
   * with yet).
   */
  private canSafelyDeliverSpawnerReward(typeId: string, tier: number): boolean {
    if (tier !== 1) return true;
    const hasExistingSpawner = [...this.views.values()].some((v) => v instanceof SpawnerView && v.spawner.typeId === typeId);
    if (!hasExistingSpawner) return true;
    return !this.grid.hasLockedItem(typeId, 1);
  }

  private updateCurrencyText(): void {
    // The chip's own icon glyph now carries the coin/gem meaning, so the
    // number doesn't need a CR/GM prefix repeating it.
    this.coinText.setText(formatHudValue(this.economy.coins));
    this.gemText.setText(formatHudValue(this.economy.gems));
    this.updateEnergyText();
    if (this.levelBadgeText) this.updateLevelBadge();
  }

  private updateEnergyText(): void {
    if (!this.energyText) return;
    syncEnergy(this.energy);
    this.energyText.setText(formatHudValue(this.energy.current));
    this.energyText.setColor(hex(
      this.energy.current > 0 ? materialLighting(Theme.currencyEnergy, 4).light : Theme.danger
    ));
    // Every value change can change a chip's width, which moves its
    // neighbours - so the row re-packs rather than overlapping.
    this.layoutHudChips();
  }

  private availableShopTypeIds(): string[] {
    const unlocked = new Set<string>([TYPE_ID]);
    for (const row of this.grid.serialize()) {
      for (const cell of row) {
        // Crates belong to no family, so they unlock nothing.
        if (cell && cell.kind !== 'locked-item' && cell.kind !== 'crate' && cell.kind !== 'splitter' && cell.kind !== 'resource-producer' && cell.typeId !== 'water' && !isCurrencyChain(cell.typeId)) unlocked.add(cell.typeId);
      }
    }
    for (const pending of this.forcedSpawnVault) {
      if (pending.kind === 'spawner' && pending.typeId !== 'water') unlocked.add(pending.typeId);
    }
    return [...unlocked];
  }

  /** Families eligible for orders are unlocked only by owning a real dispenser. */
  private ownedDispenserTypeIds(): string[] {
    const owned = new Set<string>();
    for (const row of this.grid.serialize()) {
      for (const cell of row) {
        if (cell?.kind === 'spawner') owned.add(cell.typeId);
      }
    }
    for (const pending of this.forcedSpawnVault) {
      if (pending.kind === 'spawner') owned.add(pending.typeId);
    }
    return owned.size > 0 ? [...owned] : [TYPE_ID];
  }

  private specialShopTypeIds(): string[] {
    return availableSpawnerPieceFamilies(this.ownedDispenserTypeIds());
  }

  // ---- Shop ----

  private openShop(mode: ShopMode = this.shopMode): void {
    if (this.shopOverlay || this.modalOpen || this.inputLocked) return;
    this.shopMode = mode;
    this.modalOpen = true;
    const typeIds = this.availableShopTypeIds();
    // normalizeShopState also drops rows holding a family the player hasn't
    // unlocked yet, which reconcileOffers used to do separately.
    this.shopState = normalizeShopState(
      this.shopState, typeIds, Date.now(), this.collection.discovered, this.specialShopTypeIds()
    );
    refreshIfDue(this.shopState, Date.now(), typeIds, this.collection.discovered, this.specialShopTypeIds());
    this.saveState();

    const overlay = this.add.container(0, 0).setDepth(3000);
    this.shopOverlay = overlay;

    const dim = this.add.rectangle(
      this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height,
      0x000000, 0.6
    ).setInteractive();
    dim.on('pointerdown', () => this.time.delayedCall(0, () => this.closeShop()));

    const focused = mode !== 'full';
    const panelW = Math.min(this.scale.width - 40, 420);
    // The panel now takes as much height as the viewport allows and its
    // content SCROLLS, so spacing no longer has to be squeezed to fit a
    // fixed box. Sections can breathe evenly and a fourth section could be
    // added without re-tuning every gap above it.
    const panelH = Math.min(this.scale.height - 24, focused ? 420 : 620);
    const panelX = this.scale.width / 2;
    const panelY = this.scale.height / 2;

    const panelBg = this.add.graphics();
    panelBg.fillStyle(Theme.bgElevated, 1);
    panelBg.fillRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, Theme.radiusPanel);
    panelBg.lineStyle(Theme.borderWidthStrong, Theme.borderOnDark, 1);
    panelBg.strokeRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, Theme.radiusPanel);
    // Swallows taps that land on the panel itself. Without it a press on any
    // bare part of the shop - the gap beside a card, the header, the space
    // under the last row - fell through to the backdrop behind and closed the
    // whole thing. Only the X and a tap OUTSIDE the panel close it now.
    const panelCatcher = this.add.zone(panelX, panelY, panelW, panelH)
      .setInteractive({ useHandCursor: false });

    const panelTitle = mode === 'coin' ? 'CREDITS' : mode === 'gem' ? 'GEMS' : 'SHOP';
    const title = this.add.text(panelX, panelY - panelH / 2 + 20, panelTitle, {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '20px', fontStyle: 'bold', color: hex(Theme.textOnDark)
    }).setOrigin(0.5);

    const closeBtn = this.add.text(panelX + panelW / 2 - 24, panelY - panelH / 2 + 24, '✕', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '18px', color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.time.delayedCall(0, () => this.closeShop()));

    overlay.add([dim, panelBg, panelCatcher, title, closeBtn]);

    // Sits in the gap the title already leaves above the first section, so
    // showing it never reflows the rows below.
    if (this.shopNotice) {
      const notice = this.add.text(panelX, panelY - panelH / 2 + 36, this.shopNotice.text, {
        resolution: textResolution,
        fontFamily: Theme.fontMono, fontSize: '10px', fontStyle: 'bold',
        color: hex(this.shopNotice.error ? Theme.danger : Theme.accentAmber)
      }).setOrigin(0.5);
      overlay.add(notice);
    }

    // Everything laid out by the cursor below goes into `content`, which is
    // masked to the panel's middle band and scrolls. The title, close
    // button, notice, and footer stay on `overlay` so they never scroll away.
    const content = this.add.container(0, 0);
    overlay.add(content);

    // Shared scroll state. Declared up here because the buttons built below
    // need to read `moved` to tell a tap from a drag, and they are created
    // before the scroll wiring at the bottom of this method.
    const scrollHandlers = {
      dragging: false,
      startY: 0,
      startScroll: 0,
      moved: 0,
      apply: (_value: number): void => {}
    };
    /** True when the pointer barely moved, i.e. this was a tap and not a scroll drag. */
    const wasTap = (): boolean => scrollHandlers.moved <= 6;

    const viewTop = panelY - panelH / 2 + 44;
    const viewBottom = panelY + panelH / 2 - (focused ? 30 : 26);

    // Laid out with a running vertical cursor rather than the absolute
    // offsets this used before - two offer rows plus two pack rows is
    // enough content that hand-tuned constants drift out of sync the
    // moment any block changes height.
    const cursorStart = viewTop + 18;
    let cursor = cursorStart;
    const left = panelX - panelW / 2 + 20;
    const innerW = panelW - 40;
    // The reroll price carries a currency MARK, which a text object cannot
    // hold mid-string - so each row is a text plus a glyph whose x has to be
    // recomputed every tick, because the countdown in front of it changes
    // width as it counts down and the whole row is centred.
    const shopCountdownRows: Array<{
      key: ShopRowKey;
      label: string;
      text: Phaser.GameObjects.Text;
      mark: Phaser.GameObjects.Image;
      kind: CurrencyKind;
    }> = [];
    const REROLL_GLYPH = 16;
    const layoutRerollRow = (row: { text: Phaser.GameObjects.Text; mark: Phaser.GameObjects.Image }): void => {
      const total = row.text.width + 4 + REROLL_GLYPH;
      row.text.setX(panelX - total / 2);
      row.mark.setPosition(panelX + total / 2 - REROLL_GLYPH / 2, row.text.y + 7);
    };

    /**
     * Centered banner plaque behind each section title. Chamfered ends and a
     * 1px accent edge rather than a curved ribbon - the visual direction is
     * squared/brutalist, so the banner reads as a cut metal plate. The faint
     * rules running out to the panel edges make every section header the same
     * width regardless of its label length, which is what makes the four
     * sections line up as a set.
     */
    const sectionHeader = (label: string, color: number): void => {
      const text = this.add.text(panelX, cursor, label, {
        resolution: textResolution,
        fontFamily: Theme.fontHeading, fontSize: '11px', fontStyle: 'bold', color: hex(color)
      }).setOrigin(0.5);

      const bw = Math.min(innerW - 44, text.width + 44);
      const banner = this.drawSectionBanner(panelX, cursor, bw, color);

      // Faint rules out to the panel edges. These are what make every
      // section header occupy the same full width regardless of how long
      // its label is, which is what makes the set read as aligned.
      const edge = bw / 2 + 24;
      banner.lineStyle(1, color, 0.22);
      banner.lineBetween(left, cursor, panelX - edge, cursor);
      banner.lineBetween(panelX + edge, cursor, left + innerW, cursor);

      content.add(banner);
      content.add(text);
      cursor += 30;
    };

    const offerRow = (key: ShopRowKey): void => {
      const slotW = innerW / SHOP_SLOTS;
      for (let i = 0; i < SHOP_SLOTS; i++) {
        this.buildOfferSlot(content, left + slotW * i + slotW / 2, cursor, slotW - 10, key, i, wasTap);
      }
      cursor += SHOP_SLOT_HEIGHT + 12;
    };

    const rerollRow = (
      key: ShopRowKey,
      label: string,
      kind: CurrencyKind,
      color: number,
      onReroll: () => boolean
    ): void => {
      const text = this.add.text(
        panelX, cursor,
        '',
        { resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '11px', color: hex(color), align: 'center' }
      ).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      text.setText(`REFRESH IN ${formatCountdown(msUntilShopRefresh(this.shopState, key))}  ·  ${label}`);
      const mark = this.add.image(0, 0, 'currency-coin');
      applyCurrencyIcon(mark, kind, REROLL_GLYPH, color);
      const row = { key, label, text, mark, kind };
      layoutRerollRow(row);
      shopCountdownRows.push(row);
      content.add(text);
      content.add(mark);
      text.on('pointerup', () => {
        if (!wasTap()) return;
        if (!onReroll()) return;
        rerollShopRow(
          this.shopState, key,
          key === 'special' ? this.specialShopTypeIds() : this.availableShopTypeIds(),
          Date.now(), this.collection.discovered
        );
        this.updateCurrencyText();
        this.saveState();
        this.reopenShop(null);
      });
      cursor += 30;
    };

    if (mode !== 'gem') {
      sectionHeader('BUY WITH CREDITS', Theme.currencyCredit);
      offerRow('coin');
      const coinCost = coinRerollCost(this.shopState);
      rerollRow('coin', `REROLL · ${coinCost}`, 'credit', Theme.currencyCredit, () =>
        spendCoinsGeneric(this.economy, coinCost)
      );
    }

    /**
     * The recurring Credit sink.
     *
     * Sits under BUY WITH CREDITS rather than in its own tab because it is
     * the same question - what do I do with Credits - and the answer should
     * be one scroll, not two places to look.
     */
    const supplyRow = (): void => {
      const slotW = (innerW - 16) / SUPPLY_CRATES.length;
      const slotH = 92;
      const cooling = supplyCooldownRemaining(this.supplyCooldownUntil, Date.now());
      const atLimit = cooling > 0;

      SUPPLY_CRATES.forEach((offer, index) => {
        const cx = left + slotW / 2 + index * (slotW + 8);
        const cy = cursor + slotH / 2;
        const price = supplyCratePrice(offer, playerLevel(this.orderState));
        const affordable = this.economy.coins >= price;
        const buyable = affordable && !atLimit;

        const bg = this.add.graphics();
        bg.fillStyle(Theme.panelAlt, 1);
        bg.fillRoundedRect(cx - slotW / 2, cursor, slotW, slotH, Theme.radiusChip);
        bg.lineStyle(1, buyable ? Theme.currencyCredit : Theme.borderOnDark, buyable ? 0.7 : 1);
        bg.strokeRoundedRect(cx - slotW / 2, cursor, slotW, slotH, Theme.radiusChip);

        const art = this.add.graphics();
        // Same 0.67 factor: 34 rendered a ~23px crate in a 112x92 slot with
        // room to spare, and 62 overfilled it. 50 renders ~34px wide - clearly
        // the subject of the slot, without pressing on the wait line below.
        drawCrate(art, 50, offer.tier);
        art.setPosition(cx, cy - 22);
        if (!buyable) art.setAlpha(0.45);

        // States what buying costs you in TIME - the restock wait before the
        // next crate, not a wait on the crate itself, which now opens
        // immediately.
        const wait = this.add.text(cx, cy + 4, `RESTOCK ${formatCrateWait(offer.cooldownMs)}`, {
          resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '9px',
          color: hex(Theme.textOnDarkMuted)
        }).setOrigin(0.5);

        const priceColor = buyable ? CURRENCY_COLOR.credit : Theme.textOnDarkMuted;
        const priceChip = currencyPill(this, price.toLocaleString(), 'credit', {
          ...currencyChipOptions('credit'),
          fontSize: 12, iconSize: 16, height: 22, textColor: priceColor, stroke: priceColor
        }).setPosition(cx, cy + 24);
        const mark = priceChip.list[2] as Partial<Phaser.GameObjects.Components.Alpha> | undefined;
        if (!buyable) mark?.setAlpha?.(0.45);

        content.add([bg, art, wait, priceChip]);

        if (buyable) {
          const zone = this.add.zone(cx, cy, slotW, slotH).setInteractive({ useHandCursor: true });
          zone.on('pointerup', () => this.time.delayedCall(0, () => {
            if (!wasTap()) return;
            // Bought from this slot, so the crate flies from here. Close on
            // success so the flight is visible; stay open on failure so the
            // reason stays readable.
            if (this.buySupplyCrate(offer, { x: cx, y: cy })) this.closeShop();
            else this.reopenShop(null);
          }));
          content.add(zone);
        }
      });

      cursor += slotH + 8;

      // Says WHY the row is dead when it is, rather than leaving three greyed
      // buttons with no explanation.
      const note = atLimit
        ? `RESTOCKING  ·  NEXT CRATE IN ${formatCrateWait(cooling)}`
        : 'CRATES OPEN IMMEDIATELY  ·  ONE PURCHASE PER RESTOCK';
      const noteText = this.add.text(panelX, cursor, note, {
        resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '9px',
        color: hex(atLimit ? Theme.accentAmber : Theme.textOnDarkMuted)
      }).setOrigin(0.5);
      content.add(noteText);
      cursor += 22;
    };

    // Hidden below SUPPLY_CRATE_MIN_LEVEL: the store answers "what do I do
    // with surplus Credits", and a player without a surplus is not helped by
    // a shelf they cannot use.
    if (mode !== 'gem' && playerLevel(this.orderState) >= SUPPLY_CRATE_MIN_LEVEL) {
      cursor += 14;
      sectionHeader('SUPPLY CRATES', Theme.currencyCredit);
      supplyRow();
    }

    if (mode === 'full') cursor += 14;
    if (mode !== 'coin') {
      sectionHeader('BUY WITH GEMS', Theme.currencyGem);
      offerRow('gem');
      rerollRow('gem', `REROLL · ${REROLL_COST_GEMS}`, 'gem', Theme.currencyGem, () =>
        spendGems(this.economy, REROLL_COST_GEMS)
      );
    }

    if (mode === 'full') {
      cursor += 14;
      sectionHeader('SPECIAL ITEMS', Theme.currencyGem);
      offerRow('special');
      const specialCost = specialRerollCost(this.shopState);
      rerollRow('special', `REROLL · ${specialCost}`, 'gem', Theme.currencyGem, () =>
        spendGems(this.economy, specialCost)
      );
    }

    // Both pack rows share one builder - they differ only in what they
    // cost and what crediting them calls.
    // The NUMBER carries the colour and the weight; the resource word stays
    // neutral. The quantity is what differs between packs, so it's what the
    // eye should land on - when the word was the coloured/bold half, every
    // button in a row read as the same shouted "CREDITS" and the amounts
    // receded.
    // `prefix` fronts the line with a verb. Only the ACQUIRED line gets one:
    // a pack button shows what you receive over what it costs, and without a
    // word in front the two were just numbers stacked on each other.
    type PackLine = { value: string; valueColor?: number; kind?: CurrencyKind; prefix?: string };
    const packRow = <T extends { id: string }>(
      title: string,
      titleColor: number,
      packs: T[],
      linesFor: (pack: T) => [PackLine, PackLine],
      onBuy: (pack: T) => boolean
    ): void => {
      cursor += 16;
      sectionHeader(title, titleColor);
      cursor += 2;
      const packW = innerW / packs.length;
      packs.forEach((pack, i) => {
        const px = left + packW * i + packW / 2;
        const btnW = packW - 10;
        this.buildTexturedButtonFill(px - btnW / 2, cursor, btnW, 40, content);
        // Dark inset plate over the metallic fill. The resource colours are
        // tuned for the dark panels they sit on everywhere else in the UI;
        // these buttons were the one light surface left in a now-dark shop,
        // so violet and the real-money blue lost their contrast on them.
        // Giving the label its own dark ground fixes that without altering
        // a single colour, and keeps the texture visible as a bezel.
        const plate = this.add.graphics();
        plate.fillStyle(Theme.bg, 0.72);
        plate.fillRoundedRect(px - btnW / 2 + 4, cursor + 4, btnW - 8, 32, Theme.radiusChip);
        plate.lineStyle(1, Theme.borderOnDark, 0.9);
        plate.strokeRoundedRect(px - btnW / 2 + 4, cursor + 4, btnW - 8, 32, Theme.radiusChip);
        content.add(plate);
        const lines = linesFor(pack);
        lines.forEach((line, lineIndex) => {
          const lineY = cursor + 12 + lineIndex * 15;
          const value = this.add.text(0, lineY, line.prefix ? `${line.prefix} ${line.value}` : line.value, {
            resolution: textResolution,
            fontFamily: Theme.fontNumeric,
            fontSize: '10px',
            fontStyle: 'bold',
            color: hex(line.valueColor ?? Theme.textOnDark)
          }).setOrigin(0, 0.5);
          let totalWidth = value.width;
          let mark: Phaser.GameObjects.Image | null = null;
          const GLYPH = 17;
          const GAP = 4;
          if (line.kind) {
            mark = this.add.image(0, 0, 'currency-coin');
            applyCurrencyIcon(mark, line.kind, GLYPH);
            totalWidth += GAP + GLYPH;
          }
          value.setX(px - totalWidth / 2);
          content.add(value);
          if (mark) {
            mark.setPosition(value.x + value.width + GAP + GLYPH / 2, lineY);
            content.add(mark);
          }
        });
        const hit = this.add.rectangle(px, cursor + 20, btnW, 40, 0x000000, 0)
          .setInteractive({ useHandCursor: true });
        content.add(hit);
        hit.on('pointerup', () => {
          if (!wasTap()) return;
          // A coin pack can fail (not enough gems); a gem pack can't. Say so
          // either way rather than leaving a dead-looking button.
          if (!onBuy(pack)) {
            this.reopenShop({ text: 'NOT ENOUGH GEMS FOR THAT PACK', error: true });
            return;
          }
          this.updateCurrencyText();
          this.saveState();
          this.reopenShop(null);
        });
      });
      // 58 for 40px of button plus 18 of trailing space. The buttons need
      // MORE trailing room than a text row does, not the same: a reroll line
      // is ~14px of text inside its 30px slot, so it already sits with air
      // under it, while these buttons fill their slot edge to edge. At 46
      // the next section's banner crowded them.
      cursor += 58;
    };

    if (mode !== 'gem') {
      packRow('GET CREDITS', Theme.currencyCredit, COIN_PACKS, (pack) => [
        { value: String(pack.coins), valueColor: Theme.currencyCredit, kind: 'credit', prefix: 'GET' },
        { value: String(pack.gems), valueColor: Theme.currencyGem, kind: 'gem' }
      ], (pack) =>
        purchaseCoinPack(this.economy, pack.id)
      );
    }
    if (mode !== 'coin') {
      packRow('GET GEMS', Theme.currencyGem, GEM_PACKS, (pack) => [
        { value: String(pack.gems), valueColor: Theme.currencyGem, kind: 'gem', prefix: 'GET' },
        { value: pack.priceLabel, valueColor: Theme.realMoney }
      ], (pack) =>
        purchaseGemPack(this.economy, pack.id)
      );
    }

    // ---- Scrolling ----
    //
    // Content is masked to the panel's middle band and dragged vertically.
    // The mask is a world-space shape, so it stays put while `content.y`
    // moves; it is NOT on the display list, hence the explicit destroy in
    // the cleanup below.
    const viewH = viewBottom - viewTop;
    const contentH = cursor - cursorStart;
    const maxScroll = Math.max(0, contentH - viewH + 10);

    const maskShape = this.make.graphics({});
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(panelX - panelW / 2, viewTop, panelW, viewH);
    content.setMask(maskShape.createGeometryMask());

    let scroll = 0;

    // Scroll affordance: a thin track + thumb, only drawn when there is
    // actually something to scroll to.
    let drawThumb: () => void = () => {};
    if (maxScroll > 0) {
      const trackX = panelX + panelW / 2 - 9;
      const trackTop = viewTop + 4;
      const trackH = viewH - 8;
      const thumbH = Math.max(24, trackH * (viewH / contentH));
      const track = this.add.graphics();
      track.fillStyle(Theme.bg, 0.5);
      track.fillRoundedRect(trackX, trackTop, 4, trackH, 2);
      overlay.add(track);
      const thumb = this.add.graphics();
      overlay.add(thumb);
      drawThumb = () => {
        const t = scroll / maxScroll;
        thumb.clear();
        thumb.fillStyle(Theme.borderOnDark, 1);
        thumb.fillRoundedRect(trackX, trackTop + t * (trackH - thumbH), 4, thumbH, 2);
      };
      drawThumb();
    }

    scrollHandlers.apply = (value: number): void => {
      scroll = Phaser.Math.Clamp(value, 0, maxScroll);
      content.y = -scroll;
      drawThumb();
    };

    // Tap-vs-drag: buttons inside the scroll area fire on pointerUP and only
    // when the pointer barely moved, so dragging the list past a button
    // doesn't buy anything. `dragMoved` is reset on pointerdown only, so it
    // is still readable by a button's pointerup regardless of handler order.
    const onDown = (pointer: Phaser.Input.Pointer): void => {
      if (pointer.y < viewTop || pointer.y > viewBottom) return;
      if (Math.abs(pointer.x - panelX) > panelW / 2) return;
      scrollHandlers.dragging = true;
      scrollHandlers.startY = pointer.y;
      scrollHandlers.startScroll = scroll;
      scrollHandlers.moved = 0;
    };
    const onMove = (pointer: Phaser.Input.Pointer): void => {
      if (!scrollHandlers.dragging) return;
      const dy = pointer.y - scrollHandlers.startY;
      scrollHandlers.moved = Math.max(scrollHandlers.moved, Math.abs(dy));
      scrollHandlers.apply(scrollHandlers.startScroll - dy);
    };
    const onUp = (): void => { scrollHandlers.dragging = false; };
    const onWheel = (
      _p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number
    ): void => scrollHandlers.apply(scroll + dy * 0.5);

    this.input.on('pointerdown', onDown);
    this.input.on('pointermove', onMove);
    this.input.on('pointerup', onUp);
    this.input.on('wheel', onWheel);

    this.shopScrollCleanup = () => {
      this.input.off('pointerdown', onDown);
      this.input.off('pointermove', onMove);
      this.input.off('pointerup', onUp);
      this.input.off('wheel', onWheel);
      maskShape.destroy();
    };

    this.shopCountdownUpdater = () => {
      let refreshDue = false;
      for (const row of shopCountdownRows) {
        const remaining = msUntilShopRefresh(this.shopState, row.key);
        row.text.setText(`REFRESH IN ${formatCountdown(remaining)}  ·  ${row.label}`);
        layoutRerollRow(row);
        if (remaining <= 0) refreshDue = true;
      }
      if (refreshDue) {
        refreshIfDue(
          this.shopState, Date.now(), this.availableShopTypeIds(), this.collection.discovered, this.specialShopTypeIds()
        );
        this.saveState();
        this.reopenShop(null);
      }
    };

    if (focused) {
      const fullStoreLink = this.add.text(panelX, panelY + panelH / 2 - 16, 'VIEW FULL STORE  →', {
        resolution: textResolution,
        fontFamily: Theme.fontHeading,
        fontSize: '11px',
        fontStyle: 'bold',
        color: hex(Theme.textOnDark)
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      fullStoreLink.on('pointerdown', () => this.time.delayedCall(0, () => {
        this.closeShop();
        this.shopNotice = null;
        this.openShop('full');
      }));
      overlay.add(fullStoreLink);
    } else {
      const iapNote = this.add.text(
        panelX, panelY + panelH / 2 - 14,
        'Test build — gem packs credit instantly, no real payment yet',
        { resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '10px', color: hex(Theme.textOnDarkMuted) }
      ).setOrigin(0.5);
      overlay.add(iapNote);
    }
  }

  private buildOfferSlot(container: Phaser.GameObjects.Container, x: number, y: number, w: number, key: ShopRowKey, index: number, wasTap: () => boolean): void {
    const offer = this.shopState[key].offers[index];
    const h = SHOP_SLOT_HEIGHT;

    const slotBg = this.add.graphics();
    slotBg.fillStyle(Theme.panelAlt, 1);
    slotBg.fillRoundedRect(x - w / 2, y, w, h, Theme.radiusChip);
    slotBg.lineStyle(Theme.borderWidth, Theme.borderOnLight, 0.5);
    slotBg.strokeRoundedRect(x - w / 2, y, w, h, Theme.radiusChip);
    container.add(slotBg);

    if (!offer || offer.sold) {
      const soldText = this.add.text(x, y + h / 2, 'SOLD\n(back soon)', {
        resolution: textResolution,
        fontFamily: Theme.fontHeading, fontSize: '12px', color: hex(Theme.textOnDarkMuted), align: 'center'
      }).setOrigin(0.5);
      container.add(soldText);
      return;
    }

    const def = offer.kind === 'item' || offer.kind == null ? getTierDef(offer.typeId, offer.tier) : undefined;
    const baseColor = def?.color ?? Theme.panelAlt;

    const icon = this.add.graphics();
    icon.setPosition(x, y + 34);
    // No contact shadow here, deliberately: this icon sits on a shop card,
    // not on the board, so it has no ground to cast onto. TileView is the
    // only caller that draws one (see drawTierIcon's shadow-ownership note).
    //
    // The size/ground-line transform IS applied, though - it is the same
    // object, and a Stone 1 that is a speck in the shop but board-sized on
    // the board would make the shop misrepresent what is being bought.
    const ICON_SIZE = 48;
    if (offer.kind === 'splitter') {
      drawSplitterIcon(icon, ICON_SIZE * 0.9);
      icon.setPosition(x, y + 56);
    } else if (offer.kind === 'spawner-piece') {
      drawSpawnerPieceIcon(icon, offer.typeId, offer.tier, ICON_SIZE * 0.92);
      icon.setPosition(x, y + 56);
    } else {
      const { materialAlpha } = drawTierIcon(icon, offer.typeId, offer.tier, ICON_SIZE, materialLighting(baseColor, offer.tier));
      icon.setAlpha(materialAlpha);
      const present = iconPresentation(offer.typeId, offer.tier, ICON_SIZE);
      icon.setScale(present.scale);
      icon.setPosition(x + present.offsetX, y + 56 + present.offsetY);
    }
    container.add(icon);

    // Name ABOVE the item, uppercase like every other label in the game.
    // Mixed-case Title Case was the only place in the build using it, and next
    // to the all-caps banners and prices around it that read as a different
    // product. Sitting below the icon it was also wedged against the price;
    // above it, the slot reads top to bottom as name, thing, cost.
    //
    // Centre-anchored so a two-word name grows both ways rather than downward
    // into the icon.
    const offerName = offer.kind === 'splitter'
      ? 'SPLITTER'
      : offer.kind === 'spawner-piece'
        ? spawnerPieceLabel(offer.typeId, offer.tier)
        : (def?.label ?? '?').toUpperCase();
    const nameText = this.add.text(x, y + 18, offerName.toUpperCase(), {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '11px', fontStyle: 'bold',
      color: hex(Theme.textOnDark),
      align: 'center', wordWrap: { width: w - 14 }, lineSpacing: -1
    }).setOrigin(0.5, 0.5);
    container.add(nameText);

    const priceKind: CurrencyKind = offer.priceCoins != null ? 'credit' : 'gem';
    // Same buy pill the inventory's slot unlock uses - a filled chip reads as
    // a button where a bare number read as a caption, and it is far easier to
    // pick out against the card art behind it.
    const priceText = currencyPill(
      this,
      String(offer.priceCoins ?? offer.priceGems),
      priceKind,
      // Height 20 matches the HUD currency bars exactly, and the icon is
      // deliberately taller than the bar - overflowing it is the HUD's own
      // look, not an accident.
      { fontSize: 13, iconSize: 26, height: 20, padX: 8, ...currencyChipOptions(priceKind) }
    ).setPosition(x, y + h - 16);
    container.add(priceText);

    // The whole card is the purchase target. The tap check still prevents a
    // scrolling gesture that starts on a card from buying it accidentally.
    const buyZone = this.add.zone(x, y + h / 2, w, h)
      .setInteractive({ useHandCursor: true });
    container.add(buyZone);
    buyZone.on('pointerup', () => {
      if (!wasTap()) return;
      this.buyOffer(key, index);
    });
  }

  private buyOffer(key: ShopRowKey, index: number): void {
    const offer = this.shopState[key].offers[index];
    if (!offer || offer.sold) return;

    const empties = this.grid.emptyCells();
    let paid = false;
    if (offer.priceCoins != null) {
      paid = spendCoinsGeneric(this.economy, offer.priceCoins);
    } else if (offer.priceGems != null) {
      paid = spendGems(this.economy, offer.priceGems);
    }
    if (!paid) {
      const needed = offer.priceCoins != null ? `${offer.priceCoins} CREDITS` : `${offer.priceGems} GEMS`;
      this.reopenShop({ text: `NOT ENOUGH  ·  NEEDS ${needed}`, error: true });
      return;
    }

    if (offer.kind === 'splitter') {
      this.enqueueForcedSpawn({ kind: 'splitter' });
    } else if (offer.kind === 'spawner-piece') {
      this.enqueueForcedSpawn({ kind: 'spawner-piece', typeId: offer.typeId, tier: offer.tier });
    } else if (empties.length === 0) {
      this.enqueueForcedSpawn({ kind: 'item', typeId: offer.typeId, tier: offer.tier });
    } else {
      const pos = empties[Math.floor(Math.random() * empties.length)];
      this.placeTile(pos, offer.typeId, offer.tier, true);
    }
    markOfferSold(this.shopState, key, index);
    this.updateCurrencyText();
    this.saveState();
    this.refreshOrderBar();
    this.checkDeadlock();
    // Shop stays open so the player can keep browsing/buying. The bought
    // slot rebuilds as SOLD and the header currency ticks down, so the
    // purchase still reads as having happened even though the item itself
    // lands on the board behind the panel.
    const label = offer.kind === 'splitter'
      ? 'SPLITTER'
      : offer.kind === 'spawner-piece'
        ? spawnerPieceLabel(offer.typeId, offer.tier).toUpperCase()
        : getTierDef(offer.typeId, offer.tier)?.label?.toUpperCase() ?? 'ITEM';
    this.reopenShop({
      text: `${label}  ·  ${empties.length === 0 ? 'ADDED TO VAULT' : 'ADDED TO BOARD'}`,
      error: false
    });
  }

  /** Rebuilds the shop panel in place, optionally carrying a one-line notice. */
  private reopenShop(notice: { text: string; error: boolean } | null): void {
    this.closeShop();
    this.shopNotice = notice;
    this.openShop(this.shopMode);
  }

  /**
   * A hanging ribbon banner, drawn as vectors rather than a flat plaque:
   * two drooping swallowtail ends behind a raised centre panel, with a fold
   * wedge where each tail passes behind it. The tails and folds are filled
   * from the darker `bg` so they read as the ribbon's shaded reverse side,
   * which is what gives the shape depth without any bitmap.
   *
   * Deliberately kept angular - chamfered corners, straight tails, hard
   * notches - to sit with the project's squared/brutalist direction rather
   * than the curled parchment banner this motif usually implies.
   */
  private drawSectionBanner(cx: number, cy: number, w: number, color: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    const half = w / 2;
    const hh = 11;      // half-height of the centre panel
    const tail = 20;    // how far each tail reaches past the panel
    const notch = 9;    // depth of the swallowtail cut
    const drop = 5;     // how far the tails hang below the panel
    const chamfer = 6;

    const poly = (pts: [number, number][], fill: number, stroke: number, strokeAlpha: number): void => {
      g.fillStyle(fill, 1);
      g.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.closePath();
      g.fillPath();
      g.lineStyle(1, stroke, strokeAlpha);
      g.strokePoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
    };

    for (const dir of [-1, 1] as const) {
      const inner = cx + dir * half;
      const outer = cx + dir * (half + tail);
      // Tail, hanging slightly below the panel it hangs from.
      poly([
        [inner, cy - hh + 2],
        [outer, cy - hh + 2 + drop],
        [outer - dir * notch, cy + drop],
        [outer, cy + hh - 2 + drop],
        [inner, cy + hh - 2]
      ], Theme.bg, color, 0.55);
      // Fold wedge - the sliver of tail that disappears behind the panel.
      poly([
        [inner, cy - hh + 2],
        [inner - dir * 7, cy + 1],
        [inner, cy + hh - 2]
      ], Theme.bg, color, 0.35);
    }

    // Raised centre panel, chamfered rather than rounded.
    poly([
      [cx - half + chamfer, cy - hh],
      [cx + half - chamfer, cy - hh],
      [cx + half, cy - hh + chamfer],
      [cx + half, cy + hh - chamfer],
      [cx + half - chamfer, cy + hh],
      [cx - half + chamfer, cy + hh],
      [cx - half, cy + hh - chamfer],
      [cx - half, cy - hh + chamfer]
    ], Theme.bgElevated, color, 0.9);

    // Top inner highlight - one lit edge, matching the fixed upper-left
    // light every other drawn object in the game uses.
    g.lineStyle(1, color, 0.3);
    g.lineBetween(cx - half + chamfer + 2, cy - hh + 3, cx + half - chamfer - 2, cy - hh + 3);

    return g;
  }

  private closeShop(): void {
    this.shopCountdownUpdater = null;
    this.shopScrollCleanup?.();
    this.shopScrollCleanup = null;
    this.shopOverlay?.destroy();
    this.shopOverlay = null;
    this.modalOpen = false;
  }

  private placeTile(pos: GridPosition, typeId: string, tier: number, animateIn: boolean): TileView {
    const world = this.cellToWorld(pos);
    const view = new TileView(this, world.x, world.y, this.cellSize, typeId, tier, pos);
    this.grid.set(pos, { kind: 'item', typeId, tier });
    this.views.set(this.keyOf(pos), view);
    if (!isCurrencyChain(typeId) && discoverItem(this.collection, typeId, tier)) this.updateLevelBadge();
    if (animateIn) {
      view.playMergeIn();
      // Delayed past the settle-in tween so the hint reads as a second,
      // separate event rather than smearing into the arrival animation.
      this.time.delayedCall(200, () => this.hintLockedMatch(view));
    }
    return view;
  }

  /**
   * Lights up a newly placed item and any LOCKED tile it could clear.
   *
   * Without this the opportunity is very easy to miss: locked tiles are
   * deliberately dimmed and sit still, so a matching item arriving elsewhere
   * on a busy board announces nothing. Fires for produced drops, merge
   * results, crate items and shop buys alike, because they all land through
   * placeTile - and never on load, which passes animateIn = false.
   */
  private hintLockedMatch(placed: TileView): void {
    if (!placed.active || placed.locked) return;
    const matches: TileView[] = [];
    for (const view of this.views.values()) {
      if (view instanceof TileView && view.locked && view.typeId === placed.typeId && view.tier === placed.tier) {
        matches.push(view);
      }
    }
    if (matches.length === 0) return;
    placed.playUnlockHint();
    for (const match of matches) match.playUnlockHint();
  }

  private placeLockedTile(pos: GridPosition, typeId: string, tier: number): TileView {
    const world = this.cellToWorld(pos);
    const view = new TileView(this, world.x, world.y, this.cellSize, typeId, tier, pos, true);
    this.grid.set(pos, { kind: 'locked-item', typeId, tier });
    this.views.set(this.keyOf(pos), view);
    return view;
  }

  private seedLockedBoard(preserveEmpty: number): void {
    let remainingSlots = Math.max(0, this.grid.emptyCells().length - preserveEmpty);
    // Locked merge items retain the original 6x7 board layout. The final two
    // rows are expansion tiles and must never receive ordinary locked items.
    for (const seed of createLockedBoardSeed(COLS, EXPANSION_ROW_ONE)) {
      if (remainingSlots <= 0) break;
      if (!this.grid.isEmpty(seed.pos)) continue;
      this.placeLockedTile(seed.pos, seed.typeId, seed.tier);
      remainingSlots--;
    }
  }

  private migrateLockedItemsToWiderBoard(savedCells: (GridCellData | null)[][]): void {
    const remainingLocks = savedCells.flat().filter(
      (cell): cell is Extract<GridCellData, { kind: 'locked-item' }> => cell?.kind === 'locked-item'
    );
    const targets = createLockedBoardSeed(COLS, EXPANSION_ROW_ONE);
    for (const lock of remainingLocks) {
      const exactIndex = targets.findIndex((target) =>
        target.typeId === lock.typeId && target.tier === lock.tier && this.grid.isEmpty(target.pos)
      );
      const fallbackIndex = targets.findIndex((target) => this.grid.isEmpty(target.pos));
      const index = exactIndex >= 0 ? exactIndex : fallbackIndex;
      if (index < 0) break;
      const [target] = targets.splice(index, 1);
      this.placeLockedTile(target.pos, lock.typeId, lock.tier);
    }
  }

  private placeSpawner(
    pos: GridPosition,
    typeId: string,
    tier: number,
    animateIn: boolean,
    saved?: SpawnerCellData
  ): SpawnerView {
    const world = this.cellToWorld(pos);
    const dispenser = saved ?? makeDispenser(typeId, tier);
    const data: SpawnerCellData = { kind: 'spawner', ...dispenser };
    const view = new SpawnerView(this, world.x, world.y, this.cellSize, data, pos);
    this.grid.set(pos, data);
    this.views.set(this.keyOf(pos), view);
    if (animateIn) view.playSpawnPulse();
    return view;
  }

  private placeResourceProducer(pos: GridPosition, producerId: ResourceProducerId, remaining: number, animateIn: boolean): ResourceProducerView {
    const world = this.cellToWorld(pos);
    const view = new ResourceProducerView(this, world.x, world.y, this.cellSize, producerId, pos);
    this.grid.set(pos, { kind: 'resource-producer', producerId, remaining });
    this.views.set(this.keyOf(pos), view);
    if (animateIn) view.playSpawnPulse();
    return view;
  }

  private placeSpawnerPiece(pos: GridPosition, typeId: string, tier: number, animateIn: boolean): SpawnerPieceView {
    const world = this.cellToWorld(pos);
    const view = new SpawnerPieceView(this, world.x, world.y, this.cellSize, typeId, tier, pos);
    this.grid.set(pos, { kind: 'spawner-piece', typeId, tier });
    this.views.set(this.keyOf(pos), view);
    if (animateIn) void view.playMergeIn();
    return view;
  }

  private placeSplitter(pos: GridPosition, animateIn: boolean): SplitterView {
    const world = this.cellToWorld(pos);
    const view = new SplitterView(this, world.x, world.y, this.cellSize, pos);
    this.grid.set(pos, { kind: 'splitter' });
    this.views.set(this.keyOf(pos), view);
    if (animateIn) view.playSpawnPulse();
    return view;
  }

  private loadOrSeed(): void {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          boardVersion?: number;
          grid: (GridCellData | null)[][];
          economy?: EconomyState;
          energy?: EnergyState;
          orderState?: OrderState;
          levelState?: { currentLevelIndex?: number; totalXp?: number };
          shopState?: ShopState;
          dispenserState?: DispenserState;
          dispenserCollectCount?: number;
          rewards?: Partial<RewardsState>;
          collection?: Partial<CollectionState>;
          inventory?: Partial<InventoryState>;
          pendingSpawners?: { typeId: string; tier: number }[];
          forcedSpawnVault?: ForcedSpawn[];
          boardExpansion?: { unlockedCells?: string[] };
          projectStage?: number;
          builtPieces?: string[];
          supplyCooldownUntil?: number;
        };
        this.grid.loadFrom(parsed.grid);
        const savedCells = this.grid.serialize();
        this.grid.clear();
        this.boardExpansionUnlocked = new Set(
          Array.isArray(parsed.boardExpansion?.unlockedCells)
            ? parsed.boardExpansion.unlockedCells.filter((key): key is string => typeof key === 'string')
            : []
        );
        this.applyBoardExpansionLocks(savedCells);
        this.dispenserCollectCount = parsed.dispenserCollectCount ?? 0;
        this.projectStage = Phaser.Math.Clamp(Math.floor(parsed.projectStage ?? 0), 0, PROJECT_STAGES.length);
        // Saves written before the room was itemized have no piece list: back
        // then reaching stage N meant owning everything up to N, so that is
        // what they migrate to. Without this a returning player's furnished
        // room would empty itself out and ask to be bought again.
        const validKeys = new Set(ROOM_PIECES.map((piece) => piece.key));
        this.builtPieces = Array.isArray(parsed.builtPieces)
          ? new Set(parsed.builtPieces.filter((key): key is string => validKeys.has(key)))
          : new Set(
              ROOM_PIECES
                .filter((piece) => piece.stage <= this.projectStage)
                .map((piece) => piece.key)
            );
        this.supplyCooldownUntil = typeof parsed.supplyCooldownUntil === 'number'
          ? parsed.supplyCooldownUntil : 0;
        this.rewards = normalizeRewardsState(parsed.rewards);
        const legacyCollection = parsed.collection == null;
        this.collection = normalizeCollectionState(parsed.collection);
        this.inventory = normalizeInventory(parsed.inventory);
        const savedVault = Array.isArray(parsed.forcedSpawnVault)
          ? parsed.forcedSpawnVault.filter((entry): entry is ForcedSpawn => {
              if (!entry || typeof entry !== 'object' || typeof entry.kind !== 'string') return false;
              if (entry.kind === 'crate') return typeof entry.tier === 'string' && Array.isArray(entry.remaining);
              if (entry.kind === 'splitter') return true;
              if (entry.kind === 'resource-producer') return typeof entry.producerId === 'string' && Number.isFinite(entry.remaining);
              return typeof entry.typeId === 'string' && Number.isFinite(entry.tier);
            })
          : [];
        const legacyPending = Array.isArray(parsed.pendingSpawners)
          ? parsed.pendingSpawners
              .filter((entry) => entry && typeof entry.typeId === 'string' && Number.isFinite(entry.tier))
              .map((entry): ForcedSpawn => ({ kind: 'spawner', typeId: entry.typeId, tier: entry.tier }))
          : [];
        this.forcedSpawnVault = [...legacyPending, ...savedVault];
        if (parsed.economy) {
          this.economy = { ...createDefaultEconomy(), ...parsed.economy };
        }
        // Pre-energy saves get a full bar rather than an empty one - the
        // mechanic arriving must not read as a punishment for existing players.
        this.energy = normalizeEnergy(parsed.energy);
        const savedDispenserFamilies = new Set<string>();
        for (const row of savedCells) {
          for (const cell of row) {
            if (cell?.kind === 'spawner') savedDispenserFamilies.add(cell.typeId);
          }
        }
        for (const pending of this.forcedSpawnVault) {
          if (pending.kind === 'spawner') savedDispenserFamilies.add(pending.typeId);
        }
        if (savedDispenserFamilies.size === 0) savedDispenserFamilies.add(TYPE_ID);
        this.orderState = normalizeOrderState(
          parsed.orderState ?? parsed.levelState ?? {},
          this.dispenserCollectCount,
          [...savedDispenserFamilies]
        );
        let saveMigration = false;
        const needsLockedBoardMigration = (parsed.boardVersion ?? 0) < 8;
        const needsBoardWidthMigration = (parsed.boardVersion ?? 0) < 9;
        let spawnerCount = 0;
        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            const cell = savedCells[row]?.[col];
            if (!cell) continue;
            const pos = { col, row };
            if (cell.kind === 'spawner') {
              this.placeSpawner(pos, cell.typeId, cell.tier, false, cell);
              spawnerCount++;
            } else if (cell.kind === 'locked-item') {
              // Version 8 restores the locked items to the original 6x7
              // frontier after the two expansion rows were added. Discard
              // only old locked cells here; player-owned pieces and sources
              // survive and the locks are reseeded below.
              if (!needsLockedBoardMigration && !needsBoardWidthMigration) this.placeLockedTile(pos, cell.typeId, cell.tier);
            } else if (cell.kind === 'crate') {
              this.placeCrate(pos, cell.tier, cell.remaining, cell.readyAt);
            } else if (cell.kind === 'spawner-piece') {
              this.placeSpawnerPiece(pos, cell.typeId, cell.tier, false);
            } else if (cell.kind === 'splitter') {
              this.placeSplitter(pos, false);
            } else if (cell.kind === 'resource-producer') {
              this.placeResourceProducer(pos, cell.producerId, cell.remaining, false);
            } else {
              this.placeTile(pos, cell.typeId, cell.tier, false);
            }
          }
        }

        // One-time migration from the old off-board source dock. Existing
        // sources become real board pieces instead of disappearing.
        if (spawnerCount === 0 && parsed.dispenserState) {
          const legacyState = normalizeDispenserState(parsed.dispenserState);
          for (const legacy of legacyState.slots) {
            const empty = this.grid.emptyCells()[0];
            if (!legacy || !empty) continue;
            if (!legacy.typeId) legacy.typeId = TYPE_ID;
            this.placeSpawner(empty, legacy.typeId, legacy.tier, false, { kind: 'spawner', ...legacy });
            spawnerCount++;
          }
        }
        if (spawnerCount === 0) {
          const empty = this.grid.emptyCells()[0] ?? { col: 2, row: 5 };
          const fullStarter = makeDispenser(TYPE_ID, 1, Date.now(), capacityForTier(TYPE_ID, 1));
          this.placeSpawner(empty, TYPE_ID, 1, false, { kind: 'spawner', ...fullStarter });
          spawnerCount++;
        }

        // Saves from before the collection feature have no permanent history.
        // Reconstruct the lower ladder only from player-owned items that still
        // exist on the board or in inventory; locked cells never count.
        if (legacyCollection) {
          const highest = new Map<string, number>();
          for (const key of this.collection.discovered) {
            const [typeId, rawTier] = key.split(':');
            highest.set(typeId, Math.max(highest.get(typeId) ?? 0, Number(rawTier)));
          }
          for (const item of this.inventory.items) {
            if (item?.kind !== 'item') continue;
            highest.set(item.typeId, Math.max(highest.get(item.typeId) ?? 0, item.tier));
          }
          for (const [typeId, tier] of highest) {
            if (!isCurrencyChain(typeId)) discoverThrough(this.collection, typeId, tier);
          }
          saveMigration = true;
        }

        if (needsLockedBoardMigration) {
          this.seedLockedBoard(2);
          saveMigration = true;
        } else if (needsBoardWidthMigration) {
          this.migrateLockedItemsToWiderBoard(savedCells);
          saveMigration = true;
        }

        if (parsed.shopState) {
          const typeIds = this.availableShopTypeIds();
          // normalizeShopState handles the pre-two-row save shape (a single
          // mixed `offers` array) by regenerating both rows - offers are
          // ephemeral, so nothing the player owns is lost in that reset.
          this.shopState = refreshIfDue(
            normalizeShopState(parsed.shopState, typeIds, Date.now(), this.collection.discovered, this.specialShopTypeIds()),
            Date.now(), typeIds, this.collection.discovered, this.specialShopTypeIds()
          );
        }
        // Captured only once the load has fully succeeded, so `.prev` always
        // holds a save that is known to be readable.
        stashSave(PREVIOUS_SAVE_KEY, raw);
        if (saveMigration) this.saveState();
        this.updateLevelBadge();
        return;
      } catch (error) {
        // The save is KEPT, not discarded. This catch covers the whole load,
        // not just the JSON.parse: any shape an older build wrote that a newer
        // one mishandles ends up here, and seeding a fresh board means the
        // next autosave is seconds away from overwriting real progress. The
        // copy survives that, so a player who reports "my game reset" can be
        // put back rather than consoled.
        stashSave(UNREADABLE_SAVE_KEY, raw);
        console.error(
          `[save] could not be loaded and was copied to "${UNREADABLE_SAVE_KEY}"`,
          error
        );
      }
    }
    // A fresh game begins with one physical source and a ready-made first
    // merge. Further sources arrive as goal rewards.
    //
    // The grid is CLEARED first because it is a scene field and survives
    // `scene.restart()`, while the views that draw it do not. Re-seeding onto
    // a grid that still held the previous run's cells placed nothing -
    // `seedLockedBoard` skips any cell that is not empty - so the locked items
    // existed as data with no views: invisible, and un-mergeable. The load
    // path above already clears for the same reason; only the seed path did
    // not, which is why one merge (and the save it writes) hid the bug.
    this.grid.clear();
    this.boardExpansionUnlocked.clear();
    this.applyBoardExpansionLocks();
    const fullStarter = makeDispenser(TYPE_ID, 1, Date.now(), capacityForTier(TYPE_ID, 1));
    this.placeSpawner({ col: 1, row: 1 }, TYPE_ID, 1, false, { kind: 'spawner', ...fullStarter });
    this.placeTile({ col: 0, row: 0 }, TYPE_ID, 1, false);
    this.placeTile({ col: 0, row: 1 }, TYPE_ID, 1, false);
    this.placeTile({ col: 1, row: 0 }, TYPE_ID, 1, false);
    this.placeTile({ col: 2, row: 1 }, TYPE_ID, 1, false);
    this.seedLockedBoard(0);
    this.updateLevelBadge();
    // Persist the starting board immediately, so a rebuild - a rotation, a
    // resize, entering fullscreen - restores it through the load path instead
    // of seeding a second time.
    this.saveState();
  }

  private saveState(): void {
    const payload = {
      boardVersion: 9,
      grid: this.grid.serialize(),
      economy: this.economy,
      energy: this.energy,
      orderState: this.orderState,
      shopState: this.shopState,
      dispenserCollectCount: this.dispenserCollectCount,
      rewards: this.rewards,
      collection: this.collection,
      inventory: this.inventory,
      forcedSpawnVault: this.forcedSpawnVault,
      boardExpansion: { unlockedCells: [...this.boardExpansionUnlocked] }
      ,projectStage: this.projectStage
      ,builtPieces: [...this.builtPieces]
      // Absolute, so the restock keeps running while the game is closed.
      ,supplyCooldownUntil: this.supplyCooldownUntil
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  }

  /** Wipes the save and starts over. Confirmed via confirmReset() before this runs. */
  private resetGame(): void {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(AUTO_MERGE_KEY);
    window.location.reload();
  }

  /**
   * Gem-for-energy refill, opened by tapping the energy chip. Lives here
   * rather than as a third pack row in the shop: the shop panel is already
   * near its height ceiling, and the energy bar is where a player looks when
   * they run out anyway.
   */
  private offerEnergyRefill(): void {
    if (this.modalOpen || this.inputLocked) return;
    syncEnergy(this.energy);

    this.modalOpen = true;
    const missing = Math.max(0, ENERGY_CAP - this.energy.current);
    const refillCost = energyRefillCost(this.energy);
    const affordable = this.economy.gems >= refillCost;

    const overlay = this.add.rectangle(
      this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height,
      0x000000, 0.6
    ).setDepth(3000).setInteractive();

    // Dark card, matching every other panel in the game. It was previously
    // the light `Theme.panel`, which is the one surface in the palette that
    // the resource colours DON'T work on - the energy cyan and gem violet are
    // both tuned for dark grounds, so the panel's own subject matter was the
    // least legible thing on it.
    const CARD_W = 320;
    // Room for a gauge and a proper hierarchy. This panel used to be three
    // lines of identical mono text, where the number that matters - the
    // current energy - carried the same weight as a help string, and a panel
    // ABOUT energy showed no energy.
    const CARD_H = 288;
    const card = this.add.container(this.scale.width / 2, this.scale.height / 2).setDepth(3001);
    const cardBg = this.add.graphics();
    cardBg.fillStyle(Theme.bgElevated, 1);
    cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, Theme.radiusPanel);
    cardBg.lineStyle(Theme.borderWidthStrong, Theme.currencyEnergy, 0.85);
    cardBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, Theme.radiusPanel);
    // Lit top edge, same fixed upper-left key every panel and drawn object
    // in the game shares.
    cardBg.fillStyle(Theme.currencyEnergy, 0.07);
    cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H * 0.4, Theme.radiusPanel);

    const title = this.add.text(0, -CARD_H / 2 + 18, 'ENERGY', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '17px', fontStyle: 'bold', color: hex(Theme.currencyEnergy)
    }).setOrigin(0.5);
    // The hero reading: current value large, cap small beside it, mark
    // alongside, so the panel names its own subject at a glance.
    const heroValue = this.add.text(0, -84, '', {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric, fontSize: '38px', fontStyle: 'bold', color: hex(Theme.textOnDark)
    }).setOrigin(0, 0.5);
    const heroCap = this.add.text(0, -76, `/ ${ENERGY_CAP}`, {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric, fontSize: '16px', color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0, 0.5);
    const heroMark = currencyIcon(this, 'energy', 30);

    // The gauge, in the same language as the HUD bars: a recessed track with
    // a filled portion. The thing the old panel was missing entirely.
    const GAUGE_W = CARD_W - 48;
    const GAUGE_H = 12;
    const GAUGE_Y = -40;
    const gauge = this.add.graphics();

    /** One label/value row: label left, value right, across the gauge width. */
    const statRow = (y: number, label: string): Phaser.GameObjects.Text[] => {
      const key = this.add.text(-GAUGE_W / 2, y, label, {
        resolution: textResolution,
        fontFamily: Theme.fontMono, fontSize: '10px', color: hex(Theme.textOnDarkMuted)
      }).setOrigin(0, 0.5);
      const value = this.add.text(GAUGE_W / 2, y, '', {
        resolution: textResolution,
        fontFamily: Theme.fontNumeric, fontSize: '12px', fontStyle: 'bold', color: hex(Theme.textOnDark)
      }).setOrigin(1, 0.5);
      return [key, value];
    };
    const [nextKey, nextValue] = statRow(-8, 'NEXT ENERGY');
    const [fullKey, fullValue] = statRow(14, 'FULL IN');
    const footnote = this.add.text(0, 38, '1 ENERGY PER SOURCE ITEM', {
      resolution: textResolution,
      fontFamily: Theme.fontMono, fontSize: '9px', color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0.5).setAlpha(0.7);

    // The refill gets its own full-width bar, and the WHOLE bar is the hit
    // target. It used to be a bare `currencyLabel` whose interactive rectangle
    // was only as wide as the number itself, so most of the row looked
    // pressable and wasn't.
    const BAR_W = CARD_W - 40;
    const BAR_H = 38;
    const BAR_Y = 74;
    const buyBar = this.add.graphics();
    /**
     * At full energy the bar stays in place as a muted status strip instead
     * of hiding. Hiding it left a hole the rest of the card had to shuffle
     * into, and a panel that rearranges itself as you watch reads as broken.
     */
    const drawBuyBar = (full: boolean): number => {
      const color = full ? Theme.currencyEnergy : affordable ? Theme.currencyGem : Theme.textOnDarkMuted;
      buyBar.clear();
      buyBar.fillStyle(Theme.bg, 0.92);
      buyBar.fillRoundedRect(-BAR_W / 2, BAR_Y - BAR_H / 2, BAR_W, BAR_H, Theme.radiusChip);
      buyBar.lineStyle(Theme.borderWidth, color, full ? 0.35 : affordable ? 0.9 : 0.5);
      buyBar.strokeRoundedRect(-BAR_W / 2, BAR_Y - BAR_H / 2, BAR_W, BAR_H, Theme.radiusChip);
      return color;
    };
    const barColor = drawBuyBar(missing === 0);

    const buyVerb = this.add.text(0, BAR_Y, 'REFILL', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '14px', fontStyle: 'bold', color: hex(barColor)
    }).setOrigin(0, 0.5);
    const buyCost = currencyLabel(this, String(refillCost), 'gem', {
      fontSize: 14,
      align: 'center',
      color: barColor
    });
    // Verb and price centred as one group, so the pair sits on the bar's
    // middle however wide the price gets.
    const groupW = buyVerb.width + 12 + buyCost.width;
    buyVerb.setX(-groupW / 2);
    buyCost.setPosition(-groupW / 2 + buyVerb.width + 12 + buyCost.width / 2, BAR_Y);

    const buyZone = this.add.zone(0, BAR_Y, BAR_W, BAR_H).setInteractive({ useHandCursor: true });
    const buyBtn = this.add.container(0, 0, [buyBar, buyVerb, buyCost, buyZone]);

    // No CANCEL button: there is nothing to cancel. The panel commits nothing
    // until REFILL is pressed, and tapping outside already dismisses it - it
    // was a leftover from a confirm-dialog shape. Closing is the corner X,
    // the same affordance the shop panel uses.
    const cancelBtn = this.add.text(CARD_W / 2 - 22, -CARD_H / 2 + 20, '✕', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '16px', color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    // A refill is priced in gems, so the panel is a dead end for anyone who
    // hasn't got them - which is exactly the moment a player needs the gem
    // shop. Opens the gem row specifically rather than the whole store: they
    // came here for energy, not to browse offers.
    const storeBtnText = this.add.text(0, 0, 'GET', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '12px', fontStyle: 'bold', color: hex(Theme.currencyGem)
    }).setOrigin(0, 0.5);
    const storeBtnMark = currencyIcon(this, 'gem', 19);
    const storeBtnW = storeBtnText.width + 5 + 14;
    storeBtnText.setX(-storeBtnW / 2);
    storeBtnMark.setPosition(storeBtnW / 2 - 7, 0);
    const storeBtn = this.add.container(0, CARD_H / 2 - 26, [storeBtnText, storeBtnMark]);
    storeBtn.setSize(storeBtnW, 20).setInteractive(
      new Phaser.Geom.Rectangle(-storeBtnW / 2, -10, storeBtnW, 20),
      Phaser.Geom.Rectangle.Contains
    );

    const divider = this.add.graphics();
    divider.lineStyle(1, Theme.borderOnDark, 0.9);
    divider.lineBetween(-CARD_W / 2 + 18, CARD_H / 2 - 52, CARD_W / 2 - 18, CARD_H / 2 - 52);

    card.add([
      cardBg, title, gauge, heroValue, heroCap, heroMark,
      nextKey, nextValue, fullKey, fullValue, footnote,
      cancelBtn, buyBtn, divider, storeBtn
    ]);

    const updateEnergyInfo = (): void => {
      syncEnergy(this.energy);
      const full = this.energy.current >= ENERGY_CAP;

      heroValue.setText(String(this.energy.current));
      // The hero group is laid out as one unit and re-centred every tick,
      // because the number changes width as it counts up.
      const groupW = heroValue.width + 6 + heroCap.width + 8 + 30;
      heroValue.setX(-groupW / 2);
      heroCap.setX(-groupW / 2 + heroValue.width + 6);
      heroMark.setPosition(groupW / 2 - 15, -80);

      const fraction = Phaser.Math.Clamp(this.energy.current / ENERGY_CAP, 0, 1);
      gauge.clear();
      gauge.fillStyle(Theme.bg, 0.92);
      gauge.fillRoundedRect(-GAUGE_W / 2, GAUGE_Y - GAUGE_H / 2, GAUGE_W, GAUGE_H, GAUGE_H / 2);
      if (fraction > 0) {
        const energyLighting = materialLighting(Theme.currencyEnergy, 5);
        gauge.fillGradientStyle(
          energyLighting.highlight, energyLighting.light,
          energyLighting.dark, energyLighting.base, 1
        );
        // Never narrower than its own cap radius, so one point of energy is
        // still a visible sliver rather than nothing.
        const w = Math.max(GAUGE_H, GAUGE_W * fraction);
        gauge.fillRoundedRect(-GAUGE_W / 2, GAUGE_Y - GAUGE_H / 2, w, GAUGE_H, GAUGE_H / 2);
      }
      gauge.lineStyle(1, Theme.currencyEnergy, 0.5);
      gauge.strokeRoundedRect(-GAUGE_W / 2, GAUGE_Y - GAUGE_H / 2, GAUGE_W, GAUGE_H, GAUGE_H / 2);

      // At full, the countdowns have nothing to count, so the rows state what
      // IS true rather than showing 0:00.
      nextKey.setText(full ? 'STATUS' : 'NEXT ENERGY');
      nextValue.setText(full ? 'FULL' : formatCountdown(msUntilNextEnergy(this.energy)))
        .setColor(hex(full ? Theme.currencyEnergy : Theme.textOnDark));
      fullKey.setText(full ? 'NATURAL REFILL' : 'FULL IN');
      fullValue.setText(full
        ? `1 / ${formatCountdown(ENERGY_REFILL_MS)}`
        : formatCountdown(msUntilEnergyFull(this.energy)));

      const color = drawBuyBar(full);
      buyVerb.setText(full ? 'ENERGY FULL' : 'REFILL').setColor(hex(color));
      buyCost.setVisible(!full);
      // Re-centred each tick: the group is the verb alone at full, and the
      // verb plus the price otherwise.
      const barGroupW = buyVerb.width + (full ? 0 : 12 + buyCost.width);
      buyVerb.setX(-barGroupW / 2);
      buyCost.setPosition(-barGroupW / 2 + buyVerb.width + 12 + buyCost.width / 2, BAR_Y);
      if (full) buyZone.disableInteractive();
      else buyZone.setInteractive({ useHandCursor: true });
    };
    updateEnergyInfo();
    this.energyMenuUpdater = updateEnergyInfo;

    const dismiss = () => {
      this.energyMenuUpdater = null;
      overlay.destroy();
      card.destroy();
      this.modalOpen = false;
    };
    const deferDismiss = () => this.time.delayedCall(0, dismiss);
    overlay.on('pointerdown', deferDismiss);
    cancelBtn.on('pointerdown', deferDismiss);
    // Dismiss first: openShop refuses to run while another modal is up.
    storeBtn.on('pointerdown', () => this.time.delayedCall(0, () => {
      dismiss();
      this.openShop('gem');
    }));
    if (missing > 0) {
      buyZone.on('pointerdown', () => this.time.delayedCall(0, () => {
        if (!spendGems(this.economy, refillCost)) {
          dismiss();
          this.refreshActionTray(`NOT ENOUGH GEMS\nENERGY REFILL COSTS ${refillCost} GEMS`);
          return;
        }
        recordEnergyRefillPurchase(this.energy);
        addEnergy(this.energy, Math.max(0, ENERGY_CAP - this.energy.current));
        dismiss();
        this.updateCurrencyText();
        this.saveState();
        this.refreshActionTray(`ENERGY REFILLED  ·  ${this.energy.current}/${ENERGY_CAP}`);
      }));
    }
  }

  private openPlayerInfo(): void {
    if (this.modalOpen || this.inputLocked) return;
    this.modalOpen = true;
    const xp = playerXpProgress(this.orderState);
    const profileNow = Date.now();
    const dailyReady = dailyAvailable(this.rewards, profileNow);
    const dailyPreviewState = { ...this.rewards };
    const dailyPreview = dailyReady
      ? claimDaily(dailyPreviewState, profileNow, xp.level)
      : dailyRewardFor(this.rewards.dailyStreak + 1, xp.level);
    const projectUnlocked = xp.level >= 3;
    const profileProjectReady = this.projectStageReady();
    const collectionReady = unclaimedDiscoveryCount(this.collection);
    let nextMilestoneLevel = xp.level + 1;
    let nextMilestoneTier = milestoneCrateFor(nextMilestoneLevel);
    // Milestones are not awarded every level. Walk to the next actual reward
    // instead of showing the generic word CRATE when the immediate next level
    // happens to be one of the levels without a milestone.
    while (!nextMilestoneTier) {
      nextMilestoneLevel++;
      nextMilestoneTier = milestoneCrateFor(nextMilestoneLevel);
    }

    const overlay = this.add.rectangle(
      this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height,
      0x000000, 0.6
    ).setDepth(3000).setInteractive();

    const card = this.add.container(this.scale.width / 2, this.scale.height / 2).setDepth(3001);
    const panelW = Math.min(360, this.scale.width - 40);
    const panelH = Math.min(360, this.scale.height - 32);
    const left = -panelW / 2;
    const top = -panelH / 2;
    const cardBg = this.add.graphics();
    cardBg.fillStyle(Theme.bgElevated, 1);
    cardBg.fillRoundedRect(left, top, panelW, panelH, Theme.radiusPanel);
    cardBg.lineStyle(Theme.borderWidthStrong, Theme.borderOnDark, 1);
    cardBg.strokeRoundedRect(left, top, panelW, panelH, Theme.radiusPanel);

    const titleRule = this.add.graphics();
    titleRule.lineStyle(1, Theme.playerLevel, 0.65);
    titleRule.lineBetween(left + 22, top + 48, -left - 22, top + 48);

    const title = this.add.text(0, top + 23, 'PLAYER PROFILE', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading,
      fontSize: '19px',
      fontStyle: 'bold',
      color: hex(Theme.textOnDark)
    }).setOrigin(0.5);

    const levelDisc = this.add.graphics();
    levelDisc.fillStyle(Theme.playerLevel, 1);
    const profileBand = this.add.graphics();
    profileBand.fillStyle(Theme.playerLevel, 0.16);
    profileBand.fillRoundedRect(left + 18, top + 61, panelW - 36, 76, Theme.radiusChip);
    profileBand.lineStyle(1, Theme.playerLevel, 0.7);
    profileBand.strokeRoundedRect(left + 18, top + 61, panelW - 36, 76, Theme.radiusChip);

    levelDisc.fillStyle(Theme.playerLevel, 1);
    levelDisc.fillCircle(left + 55, top + 99, 27);
    levelDisc.lineStyle(1, Theme.textOnDark, 0.4);
    levelDisc.strokeCircle(left + 55, top + 99, 27);
    const levelText = this.add.text(left + 55, top + 99, String(xp.level), {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric,
      fontSize: '22px',
      fontStyle: 'bold',
      color: hex(Theme.textOnDark)
    }).setOrigin(0.5);
    const levelLabel = this.add.text(left + 94, top + 76, `LEVEL ${xp.level}`, {
      resolution: textResolution,
      fontFamily: Theme.fontHeading,
      fontSize: '13px',
      fontStyle: 'bold',
      color: hex(Theme.textOnDark)
    });
    // The XP bar lives on the LEVEL row, not on a row of its own.
    //
    // No numbers on it, and no `TOTAL XP` or `N XP TO LEVEL` lines either.
    // `xpForLevel` is `50 * level * (level - 1)`, so a player reading those
    // figures watches the cost of a level climb from 200 to 4,400 - the bar
    // shows the same progress without spelling out a curve that only reads as
    // discouraging. Inlining it also frees the whole middle of the panel.
    const barX = left + 94;
    const barY = top + 99;
    const barW = panelW - 130;
    const barH = 11;
    const progress = Phaser.Math.Clamp(xp.current / xp.required, 0, 1);
    const xpBar = this.add.graphics();
    xpBar.fillStyle(Theme.bg, 0.7);
    xpBar.fillRoundedRect(barX, barY, barW, barH, Theme.radiusChip);
    if (progress > 0) {
      const xpLighting = materialLighting(Theme.currencyXp, 5);
      xpBar.fillGradientStyle(
        xpLighting.light, xpLighting.highlight,
        xpLighting.dark, xpLighting.base, 1
      );
      xpBar.fillRoundedRect(barX, barY, Math.max(4, barW * progress), barH, Theme.radiusChip);
    }
    xpBar.lineStyle(Theme.borderWidth, Theme.borderOnDark, 1);
    xpBar.strokeRoundedRect(barX, barY, barW, barH, Theme.radiusChip);

    // The upcoming level reward is the object at the finish line, rather
    // than a second text row explaining the same thing. When it is ready,
    // the crate itself becomes the claim control.
    const rewardCrateX = barX + barW;
    const rewardCrateY = barY + barH / 2;
    const rewardCrate = this.add.graphics().setPosition(rewardCrateX, rewardCrateY);
    const drawLevelReward = (tier: CrateTier): void => {
      rewardCrate.clear().setAlpha(0.78);
      drawCrate(rewardCrate, 36, tier);
    };
    drawLevelReward(nextMilestoneTier as CrateTier);

    const divider = this.add.graphics();
    divider.lineStyle(1, Theme.borderOnDark, 0.9);
    divider.lineBetween(left + 24, top + 151, -left - 24, top + 151);
    const guidance = this.add.text(0, top + 169,
      'MERGE ITEMS AND COMPLETE ORDERS TO LEVEL UP', {
        resolution: textResolution,
        fontFamily: Theme.fontMono,
        fontSize: '10px',
        color: hex(Theme.textOnDarkMuted),
        align: 'center',
        lineSpacing: 5
      }).setOrigin(0.5);

    const dailyY = top + 235;
    const dailyStripX = left + 18;
    const dailyStripY = dailyY - 30;
    const dailyStripW = panelW - 36;
    const dailyStripH = 74;
    const dailyTabW = 62;
    const dailyLastW = dailyStripW - dailyTabW * 4;
    const dailyStrip = this.add.graphics();
    const dailyIcons = Array.from({ length: 5 }, () => this.add.graphics());
    const dailyDayLabels = Array.from({ length: 5 }, (_, index) => this.add.text(0, 0,
      index === 4 ? 'DAY 5+' : `DAY ${index + 1}`, {
        resolution: textResolution,
        fontFamily: Theme.fontHeading,
        fontSize: '8px',
        fontStyle: 'bold',
        color: hex(Theme.textOnDarkMuted)
      }).setOrigin(0.5));
    const dailyRewardLabels = Array.from({ length: 5 }, () => this.add.text(0, 0, '', {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric,
      fontSize: '7px',
      fontStyle: 'bold',
      color: hex(Theme.textOnDark)
    }).setOrigin(0.5));
    const dailyStateLabels = Array.from({ length: 5 }, () => this.add.text(0, 0, '', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading,
      fontSize: '7px',
      fontStyle: 'bold',
      color: hex(Theme.accentGreen)
    }).setOrigin(0.5));
    const dailyClaimZone = this.add.zone(0, 0, dailyTabW, dailyStripH);
    let dailyClaimOriginX = dailyStripX + dailyTabW / 2;
    const dailyTabBounds = (index: number): { x: number; width: number } => ({
      x: dailyStripX + dailyTabW * index,
      width: index === 4 ? dailyLastW : dailyTabW
    });
    const drawDailyStrip = (): void => {
      const now = Date.now();
      const canDaily = dailyAvailable(this.rewards, now);
      const currentLevel = playerLevel(this.orderState);
      const previewState = { ...this.rewards };
      const preview = canDaily
        ? claimDaily(previewState, now, currentLevel) ?? dailyRewardFor(1, currentLevel)
        : dailyRewardFor(this.rewards.dailyStreak + 1, currentLevel);
      const activeIndex = Math.min(preview.streak, 5) - 1;
      const claimedThrough = canDaily
        ? Math.min(Math.max(0, preview.streak - 1), 5)
        : Math.min(this.rewards.dailyStreak, 5);

      dailyStrip.clear();
      for (let index = 0; index < 5; index++) {
        const reward = dailyRewardFor(index + 1, currentLevel);
        const bounds = dailyTabBounds(index);
        const x = bounds.x;
        const width = bounds.width;
        const right = x + width;
        const mid = dailyStripY + dailyStripH / 2;
        const points = index === 0
          ? [
              new Phaser.Geom.Point(x, dailyStripY),
              new Phaser.Geom.Point(right - 7, dailyStripY),
              new Phaser.Geom.Point(right, mid),
              new Phaser.Geom.Point(right - 7, dailyStripY + dailyStripH),
              new Phaser.Geom.Point(x, dailyStripY + dailyStripH)
            ]
          : index === 4
            ? [
                new Phaser.Geom.Point(x + 7, dailyStripY),
                new Phaser.Geom.Point(right, dailyStripY),
                new Phaser.Geom.Point(right, dailyStripY + dailyStripH),
                new Phaser.Geom.Point(x + 7, dailyStripY + dailyStripH),
                new Phaser.Geom.Point(x, mid)
              ]
            : [
                new Phaser.Geom.Point(x + 7, dailyStripY),
                new Phaser.Geom.Point(right - 7, dailyStripY),
                new Phaser.Geom.Point(right, mid),
                new Phaser.Geom.Point(right - 7, dailyStripY + dailyStripH),
                new Phaser.Geom.Point(x + 7, dailyStripY + dailyStripH),
                new Phaser.Geom.Point(x, mid)
              ];
        const isActive = index === activeIndex;
        const isClaimed = index < claimedThrough || (!canDaily && index === 4 && claimedThrough >= 5);
        const accent = reward.kind === 'credits' ? Theme.currencyCredit : this.crateAccent(reward.tier);
        dailyStrip.fillStyle(isActive ? accent : Theme.panelAlt, isActive ? 0.22 : 0.78);
        dailyStrip.fillPoints(points, true);
        dailyStrip.lineStyle(isActive ? 2 : 1, isActive ? accent : Theme.borderOnDark, isActive ? 1 : 0.9);
        dailyStrip.strokePoints(points, true);

        const centerX = x + width / 2 + (index > 0 ? 2 : 0);
        dailyDayLabels[index].setPosition(centerX, dailyStripY + 10)
          .setColor(hex(isActive ? accent : Theme.textOnDarkMuted));
        dailyIcons[index].clear().setPosition(centerX, dailyStripY + 37).setAlpha(isClaimed ? 0.5 : 1);
        // 26 and 25 looked like matching numbers but were not matching SIZES:
        // `drawCurrencyGlyph` fills its full `size` (a 26px coin), while
        // `drawCrate` draws to about 0.67 of it, so the chests came out at
        // ~17px beside a 26px coin. 40 puts the crate's rendered width on the
        // coin's, which is what "the same size" actually means here.
        if (reward.kind === 'credits') drawCurrencyGlyph(dailyIcons[index], 'credit', 26, Theme.currencyCredit);
        else drawCrate(dailyIcons[index], 40, reward.tier);
        dailyRewardLabels[index]
          .setPosition(centerX, dailyStripY + 63)
          .setText(reward.kind === 'credits' ? String(reward.credits) : reward.tier.toUpperCase())
          .setColor(hex(isActive ? Theme.textOnDark : Theme.textOnDarkMuted));
        dailyStateLabels[index]
          .setPosition(centerX + width * 0.28, dailyStripY + 24)
          .setText(isClaimed ? '✓' : isActive ? (canDaily ? 'CLAIM' : 'NEXT') : '')
          .setColor(hex(isClaimed ? Theme.accentGreen : accent));
      }

      const activeBounds = dailyTabBounds(activeIndex);
      dailyClaimOriginX = activeBounds.x + activeBounds.width / 2;
      dailyClaimZone.setPosition(dailyClaimOriginX, dailyStripY + dailyStripH / 2)
        .setSize(activeBounds.width, dailyStripH);
      if (canDaily) dailyClaimZone.setInteractive({ useHandCursor: true });
      else dailyClaimZone.disableInteractive();
    };
    drawDailyStrip();

    const collectionX = left + 42;
    const collectionY = top + 329;
    const collectionPanel = this.add.graphics();
    collectionPanel.fillStyle(Theme.panelAlt, 0.72);
    collectionPanel.fillRoundedRect(collectionX - 24, collectionY - 18, 48, 36, Theme.radiusChip);
    collectionPanel.lineStyle(1, profileProjectReady ? Theme.accentAmber : Theme.borderOnDark,
      profileProjectReady ? 0.9 : 1);
    collectionPanel.strokeRoundedRect(collectionX - 24, collectionY - 18, 48, 36, Theme.radiusChip);
    // The owner's house mark, drawn LARGER than its 48x36 tile and allowed to
    // overhang it. Contained inside the chip the building was too small to
    // read as a building - same call as the currency glyphs, which are sized
    // for legibility first and overflow their scrims rather than shrink.
    const collectionIcon = this.add.image(collectionX, collectionY, 'home-icon')
      .setDisplaySize(46, 46)
      .setAlpha(projectUnlocked ? 1 : 0.38);
    // The badge means "something is waiting for you". A locked button has
    // nothing waiting - it says so with the padlock and the line beside it, so
    // the dot no longer doubles as a level requirement.
    const collectionBadge = this.add.text(collectionX + 18, collectionY - 13,
      profileProjectReady ? '!' : '', {
        resolution: textResolution,
        fontFamily: Theme.fontNumeric,
        fontSize: '8px',
        fontStyle: 'bold',
        color: hex(Theme.textOnDark),
        backgroundColor: hex(Theme.accentAmber),
        padding: { x: 3, y: 1 }
      }).setOrigin(0.5);
    collectionBadge.setVisible(profileProjectReady);

    // Padlock over the greyed mark, and the requirement spelled out beside it.
    // Two lines: one would run under the collection button sitting at x = 0.
    const collectionLock = this.add.graphics().setPosition(collectionX, collectionY);
    const collectionLockNote = this.add.text(collectionX + 30, collectionY, 'UNLOCKS AT\nLEVEL 3', {
      resolution: textResolution,
      fontFamily: Theme.fontMono,
      fontSize: '8px',
      fontStyle: 'bold',
      color: hex(Theme.textOnDarkMuted),
      lineSpacing: 2
    }).setOrigin(0, 0.5);
    if (projectUnlocked) {
      collectionLockNote.setVisible(false);
    } else {
      // Body, then the shackle as a stroked half-circle above it.
      collectionLock.fillStyle(Theme.textOnDark, 0.9);
      collectionLock.fillRoundedRect(-7, -1, 14, 11, 2);
      collectionLock.lineStyle(2.5, Theme.textOnDark, 0.9);
      collectionLock.beginPath();
      collectionLock.arc(0, -1, 4.5, Math.PI, 0);
      collectionLock.strokePath();
      collectionLock.fillStyle(Theme.bg, 0.9);
      collectionLock.fillCircle(0, 4, 1.6);
    }
    const collectionZone = this.add.zone(collectionX, collectionY, 48, 36)
      .setInteractive({ useHandCursor: true });

    const bookX = 0;
    const bookY = collectionY;
    const bookPanel = this.add.graphics();
    bookPanel.fillStyle(Theme.panelAlt, 0.72);
    bookPanel.fillRoundedRect(bookX - 24, bookY - 18, 48, 36, Theme.radiusChip);
    bookPanel.lineStyle(1, collectionReady > 0 ? Theme.currencyGem : Theme.borderOnDark,
      collectionReady > 0 ? 0.8 : 1);
    bookPanel.strokeRoundedRect(bookX - 24, bookY - 18, 48, 36, Theme.radiusChip);
    const bookIcon = this.add.graphics().setPosition(bookX, bookY);
    this.drawCollectionBook(bookIcon, 22, collectionReady > 0 ? Theme.currencyGem : Theme.textOnDarkMuted);
    const bookBadge = this.add.text(bookX + 18, bookY - 13,
      collectionReady > 0 ? String(collectionReady > 9 ? '9+' : collectionReady) : '', {
        resolution: textResolution,
        fontFamily: Theme.fontNumeric,
        fontSize: '8px',
        fontStyle: 'bold',
        color: hex(Theme.textOnDark),
        backgroundColor: hex(Theme.currencyGem),
        padding: { x: 3, y: 1 }
      }).setOrigin(0.5).setVisible(collectionReady > 0);
    const bookZone = this.add.zone(bookX, bookY, 48, 36).setInteractive({ useHandCursor: true });

    const closeBtn = this.add.text(-left - 22, top + 22, '✕', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading,
      fontSize: '18px',
      color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    card.add([
      cardBg, titleRule, title, profileBand, levelDisc, levelText, levelLabel, xpBar,
      rewardCrate, divider, guidance,
      dailyStrip, ...dailyIcons, ...dailyDayLabels, ...dailyRewardLabels, ...dailyStateLabels, dailyClaimZone,
      collectionPanel, collectionIcon, collectionLock, collectionLockNote, collectionBadge, collectionZone,
      bookPanel, bookIcon, bookBadge, bookZone, closeBtn
    ]);

    const dismiss = (): void => {
      overlay.destroy();
      card.destroy();
      this.modalOpen = false;
    };
    /** Rewrites both reward rows from current state, so the panel can stay open. */
    const refreshRewardRows = (): void => {
      let upcomingLevel = playerLevel(this.orderState) + 1;
      let upcomingTier = milestoneCrateFor(upcomingLevel);
      while (!upcomingTier) {
        upcomingLevel++;
        upcomingTier = milestoneCrateFor(upcomingLevel);
      }
      drawLevelReward(upcomingTier as CrateTier);

      drawDailyStrip();
    };

    let rewardClaimPending = false;
    overlay.on('pointerdown', () => this.time.delayedCall(0, dismiss));
    closeBtn.on('pointerdown', () => this.time.delayedCall(0, dismiss));
    collectionZone.on('pointerdown', () => this.time.delayedCall(0, () => {
      dismiss();
      this.openProject();
    }));
    bookZone.on('pointerdown', () => this.time.delayedCall(0, () => {
      dismiss();
      this.openCollection();
    }));
    dailyClaimZone.on('pointerdown', () => this.time.delayedCall(0, () => {
        if (rewardClaimPending) return;
        rewardClaimPending = true;
        const now = Date.now();
        if (!dailyAvailable(this.rewards, now)) {
          rewardClaimPending = false;
          return;
        }

        const claimed = claimDaily(this.rewards, now, playerLevel(this.orderState));
        if (!claimed) {
          rewardClaimPending = false;
          return;
        }
        if (claimed.kind === 'credits') {
          addCoins(this.economy, claimed.credits);
          this.updateCurrencyText();
          floatingScore(this, card.x + dailyClaimOriginX, card.y + dailyY + 3, claimed.credits, 'CR');
          this.saveState();
        } else {
          this.awardCrate(
            claimed.tier,
            `DAILY SUPPLY  ·  DAY ${claimed.dayLabel}`,
            { x: card.x + dailyClaimOriginX, y: card.y + dailyY + 3 }
          );
        }
        this.updateLevelBadge();
        // Panel stays open; the rows rewrite themselves instead.
        refreshRewardRows();
        rewardClaimPending = false;
      }));
  }

  private confirmReset(): void {
    if (this.modalOpen || this.inputLocked) return;
    this.modalOpen = true;
    const overlay = this.add.rectangle(
      this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height,
      0x000000, 0.6
    ).setDepth(3000).setInteractive();

    const card = this.add.container(this.scale.width / 2, this.scale.height / 2).setDepth(3001);
    const cardBg = this.add.graphics();
    cardBg.fillStyle(Theme.panel, 1);
    cardBg.fillRoundedRect(-150, -80, 300, 160, Theme.radiusPanel);
    cardBg.lineStyle(Theme.borderWidthStrong, Theme.danger, 0.85);
    cardBg.strokeRoundedRect(-150, -80, 300, 160, Theme.radiusPanel);

    const title = this.add.text(0, -44, 'Reset progress?', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '17px', fontStyle: 'bold', color: hex(Theme.textOnLight)
    }).setOrigin(0.5);
    const subtitle = this.add.text(0, -14, 'This clears the board, coins,\ngems, and goals for good.', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '12px', color: hex(Theme.textOnLightMuted), align: 'center'
    }).setOrigin(0.5);

    const cancelBtn = this.add.text(-60, 40, 'CANCEL', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '14px', color: hex(Theme.textOnLightMuted)
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const resetBtn = this.add.text(60, 40, 'RESET', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '14px', fontStyle: 'bold', color: hex(Theme.danger)
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    card.add([cardBg, title, subtitle, cancelBtn, resetBtn]);

    const dismiss = () => {
      overlay.destroy();
      card.destroy();
      this.modalOpen = false;
    };
    const deferDismiss = () => this.time.delayedCall(0, dismiss);
    overlay.on('pointerdown', deferDismiss);
    cancelBtn.on('pointerdown', deferDismiss);
    resetBtn.on('pointerdown', () => this.resetGame());
  }

  private completeOrder(index: number, order: OrderDef, position: number): void {
    // Captured BEFORE anything advances: `refreshOrderBar` below re-sorts and
    // re-lays out the bar, so afterwards this position holds a different
    // order at a different x. Previously this was derived from the QUEUE slot
    // using a fixed `(boardWidth - gaps) / 3` card width - both wrong now
    // that ready orders sort to the front and cards size to their content,
    // which put the reward popup over an unrelated card.
    const rewardAt = this.orderCardWorldCenter(position);
    const levelBefore = playerLevel(this.orderState);
    advanceOrder(this.orderState, index, this.dispenserCollectCount, this.ownedDispenserTypeIds());
    const levelAfter = playerLevel(this.orderState);
    addCoins(this.economy, order.rewardCoins);
    if (order.rewardEnergy) addEnergy(this.energy, order.rewardEnergy);
    if (order.rewardGems) addGems(this.economy, order.rewardGems);
    if (order.rewardSpawner) {
      // Unlocking a family should surface it in the shop immediately, so
      // both rows re-roll here rather than just one.
      this.queueSpawnerReward(
        order.rewardSpawner.typeId,
        order.rewardSpawner.tier,
        rewardAt ?? undefined
      );
      const typeIds = this.availableShopTypeIds();
      for (const key of SHOP_ROW_KEYS) {
        rerollShopRow(
          this.shopState, key, key === 'special' ? this.specialShopTypeIds() : typeIds,
          Date.now(), this.collection.discovered
        );
      }
    }
    if (order.rewardShippingContainer) {
      this.enqueueForcedSpawn({
        kind: 'crate', tier: 'shipping',
        remaining: shippingContainerPayload(this.ownedDispenserTypeIds()),
        source: 'ORDER REWARD'
      }, rewardAt ?? undefined);
    }
    const automaticLevelRewards = levelAfter > levelBefore ? this.autoDeliverLevelRewards() : [];
    this.updateCurrencyText();
    this.refreshOrderBar();
    this.updateLevelBadge();
    this.saveState();

    // Reward feedback is deliberately non-modal: the player can keep
    // tapping, dragging, or submitting another order immediately.
    const rewardX = rewardAt?.x ?? this.boardOriginX + (COLS * this.cellSize) / 2;
    const rewardY = rewardAt?.y ?? this.contentTop + 78;
    // +/-34 rather than +/-22: rewards now scale with the tier delivered, so
    // a four-digit credit figure and a three-digit XP figure collided at the
    // spacing that suited the old flat two-digit rewards.
    floatingScore(this, rewardX - 34, rewardY, order.rewardCoins, 'CR');
    if (order.rewardEnergy) floatingScore(this, rewardX, rewardY + 18, order.rewardEnergy, 'E');
    if (order.rewardGems) floatingScore(this, rewardX, rewardY + (order.rewardEnergy ? 36 : 18), order.rewardGems, 'GM');

    let trayMessage = `ORDER SENT  ·  ${order.title.toUpperCase()}
+${order.rewardCoins} CREDITS`;
    if (order.rewardEnergy) trayMessage += `  ·  +${order.rewardEnergy} E`;
    if (order.rewardGems) trayMessage += `  ·  +${order.rewardGems} GM`;
    if (order.rewardSpawner) trayMessage += `  ·  ${order.rewardSpawner.typeId.toUpperCase()} SOURCE`;
    if (order.rewardShippingContainer) trayMessage += '  ·  SHIPPING CONTAINER';
    if (levelAfter > levelBefore) {
      const newest = automaticLevelRewards[automaticLevelRewards.length - 1];
      trayMessage = newest
        ? `LEVEL ${levelAfter} REACHED  ·  ${CRATE_LABELS[newest.tier]} DELIVERED`
        : `LEVEL ${levelAfter} REACHED\nTAP THE LEVEL BADGE TO VIEW PROGRESS`;
    }
    this.checkDeadlock();
    this.tryReleaseVaultItem();
    this.tryDeliverMeterGold();
    this.refreshActionTray(trayMessage);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.inputLocked || this.modalOpen) return;
    const cell = this.worldToCell(pointer.x, pointer.y);
    if (!cell) return;
    const key = this.keyOf(cell);
    const view = this.views.get(key);
    if (!view) return;
    if (view instanceof TileView && view.locked) {
      const def = getTierDef(view.typeId, view.tier);
      this.refreshActionTray(
        `LOCKED ${def?.label?.toUpperCase() ?? 'ITEM'}  ·  ${familyTierLabel(view.typeId, view.tier)}\n` +
        'MERGE A MATCH ONTO IT TO UNLOCK'
      );
      return;
    }
    this.draggingView = view;
    this.dragFromCell = cell;
    this.dragStartPointer = { x: pointer.x, y: pointer.y };
    // Deliberately NOT picked up here - see `DRAG_START_PX`. The lift, the
    // scale-up and the raise to the top all wait until the finger has moved
    // far enough to mean it.
    this.dragActive = false;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    // Order-bar flick. Checked before the tile drag because the bar sits
    // outside the board and can never own a tile.
    if (this.orderDrag.active) {
      const dx = pointer.x - this.orderDrag.startX;
      this.orderDrag.moved = Math.max(this.orderDrag.moved, Math.abs(dx));
      this.setOrderScroll(this.orderDrag.startScroll - dx);
      return;
    }
    if (!this.draggingView) return;
    if (!this.dragActive) {
      const travelled = Math.hypot(
        pointer.x - this.dragStartPointer.x,
        pointer.y - this.dragStartPointer.y
      );
      if (travelled < DRAG_START_PX) return;
      this.dragActive = true;
      this.draggingView.state = 'dragging';
      this.children.bringToTop(this.draggingView);
      this.draggingView.setScale(1.08);
    }
    this.draggingView.setPosition(pointer.x, pointer.y);

    // Merge-ready highlight: a thin acid-green pulse on whatever tile is
    // currently under the drag, but only while it's a legal merge target -
    // purely visual, driven by the same typeId+tier check onPointerUp
    // already makes, so it can't diverge from the real merge rule.
    // Live feedback on the drop target, so storage is discoverable at all.
    this.setInventoryHover(this.isOverInventoryButton(pointer.x, pointer.y));

    const hoverCell = this.worldToCell(pointer.x, pointer.y);
    const hoverView = hoverCell ? this.views.get(this.keyOf(hoverCell)) : undefined;
    const isLegalTarget = !!hoverView && this.canMergeViews(this.draggingView, hoverView);

    const nextTarget = isLegalTarget ? hoverView! : null;
    if (nextTarget !== this.mergeReadyTarget) {
      if (this.mergeReadyTarget instanceof TileView || this.mergeReadyTarget instanceof SpawnerView || this.mergeReadyTarget instanceof SpawnerPieceView) {
        this.mergeReadyTarget.setMergeReady(false);
      }
      this.mergeReadyTarget = nextTarget;
      if (this.mergeReadyTarget instanceof TileView || this.mergeReadyTarget instanceof SpawnerView || this.mergeReadyTarget instanceof SpawnerPieceView) {
        this.mergeReadyTarget.setMergeReady(true);
      }
    }
  }

  private async onPointerUp(pointer: Phaser.Input.Pointer): Promise<void> {
    // An order card only submits on a TAP. Without this, flicking the bar
    // sideways to reach a later order would fire whichever card the flick
    // happened to start on - the same rule the shop's scrolling list uses.
    if (this.orderDrag.active) {
      const { slot, moved, describe } = this.orderDrag;
      this.orderDrag = { active: false, slot: -1, startX: 0, startScroll: 0, moved: 0, describe: null };
      if (moved > 6) return;
      // Tapping the ITEM on a card asks what it is; tapping the card asks to
      // deliver it. Same description the board gives for the same item, so
      // the card is a place to learn the ladder rather than only to read a
      // target off.
      if (describe) this.describeOrderItem(describe.typeId, describe.tier);
      else this.submitOrderSlot(slot);
      return;
    }

    const view = this.draggingView;
    // Captured before it is cleared: the release path below asks whether the
    // piece was ever actually picked up, which is what separates a tap from a
    // drag that wandered and came back to its own cell.
    const wasDragging = this.dragActive;
    const fromCell = this.dragFromCell;
    this.draggingView = null;
    this.dragActive = false;
    this.dragFromCell = null;
    if (this.mergeReadyTarget instanceof TileView || this.mergeReadyTarget instanceof SpawnerView || this.mergeReadyTarget instanceof SpawnerPieceView) {
      this.mergeReadyTarget.setMergeReady(false);
    }
    this.mergeReadyTarget = null;
    if (!view || !fromCell) return;

    const fromWorld = this.cellToWorld(fromCell);

    // Dropped on the briefcase: storage is a DRAG target, not a button in
    // the tray. The tray version could not work for a crate at all - the tap
    // that selected it also dispensed from it, so the button only appeared
    // after the crate had already given something up.
    this.setInventoryHover(false);
    if (this.isOverInventoryButton(pointer.x, pointer.y)) {
      if (this.storeDraggedView(view, fromCell)) return;
      view.setScale(1);
      await view.snapTo(fromWorld.x, fromWorld.y);
      view.state = 'idle';
      return;
    }

    const targetCell = this.worldToCell(pointer.x, pointer.y);

    if (!targetCell || (targetCell.col === fromCell.col && targetCell.row === fromCell.row)) {
      view.setScale(1);
      await view.snapTo(fromWorld.x, fromWorld.y);
      view.state = 'idle';
      // Landing back on the starting cell is only a TAP if the piece was
      // never picked up at all. Carrying a crate around and setting it back
      // down was dispensing from it, because "same cell" was being treated as
      // "tapped" no matter how far it had travelled.
      if (targetCell && !wasDragging) {
        if (view instanceof CrateView) this.tapCrate(view);
        else if (view instanceof ResourceProducerView) this.tapResourceProducer(view);
        else if (view instanceof SpawnerView) this.spawnFromSpawner(view);
        else if (view instanceof TileView && (
          isCurrencyChain(view.typeId) ||
          (view.typeId === 'water' && getTierDef('water', view.tier + 1) == null)
        )) {
          const key = this.keyOf(fromCell);
          const now = Date.now();
          if (this.lastCurrencyTap?.key === key && now - this.lastCurrencyTap.at <= 360) {
            this.lastCurrencyTap = null;
            if (view.typeId === 'water') this.collectFinalWater(view);
            else this.collectCurrencyItem(view);
          } else {
            this.lastCurrencyTap = { key, at: now };
            this.selectItem(key);
          }
        } else this.selectItem(this.keyOf(fromCell));
      }
      return;
    }

    const targetKey = this.keyOf(targetCell);
    const targetView = this.views.get(targetKey);

    if (!targetView) {
      if (this.grid.isBlocked(targetCell)) {
        view.setScale(1);
        await view.snapTo(fromWorld.x, fromWorld.y);
        view.state = 'idle';
        this.refreshActionTray('BOARD TILE LOCKED\nTAP THE LOCKED TILE TO VIEW ITS REQUIREMENT');
        return;
      }
      const movingData = this.grid.get(fromCell);
      if (!movingData) return;
      this.grid.set(fromCell, null);
      this.grid.set(targetCell, movingData);
      this.views.delete(this.keyOf(fromCell));
      this.views.set(targetKey, view);
      view.setGridPos(targetCell);
      if (this.selectedItemKey === this.keyOf(fromCell)) this.selectedItemKey = targetKey;
      const worldTarget = this.cellToWorld(targetCell);
      view.setScale(1);
      await view.snapTo(worldTarget.x, worldTarget.y);
      view.state = 'idle';
      this.saveState();
      this.refreshActionTray();
      return;
    }

    if (view instanceof SplitterView && targetView instanceof TileView && this.canMergeViews(view, targetView)) {
      view.setScale(1);
      await view.snapTo(fromWorld.x, fromWorld.y);
      view.state = 'idle';
      this.showSplitConfirmation(view, targetView, fromCell, targetCell);
      return;
    }

    if (view instanceof TileView && targetView instanceof TileView && this.canMergeViews(view, targetView)) {
      const nextDef = getTierDef(view.typeId, view.tier + 1);
      if (!nextDef) return;
      const unlockedItem = targetView.locked;
      this.inputLocked = true;
      const worldTarget = this.cellToWorld(targetCell);
      view.setScale(1);
      await view.snapTo(worldTarget.x, worldTarget.y);

      this.grid.set(fromCell, null);
      this.views.delete(this.keyOf(fromCell));
      if (this.selectedItemKey === this.keyOf(fromCell) || this.selectedItemKey === targetKey) this.selectedItemKey = null;

      await Promise.all([view.playMergeOutAndDestroy(), targetView.playMergeOutAndDestroy()]);
      this.views.delete(targetKey);

      burstParticles(this, worldTarget.x, worldTarget.y, nextDef.color, nextDef.tier);
      shakeForTier(this, nextDef.tier);
      const normalMergeXp = xpForMergeTier(nextDef.tier);
      const mergeXp = view.typeId === 'water' ? Math.max(1, Math.floor(normalMergeXp / 2)) : normalMergeXp;
      const levelBefore = playerLevel(this.orderState);

      this.placeTile(targetCell, view.typeId, nextDef.tier, true);
      this.orderState.totalXp += mergeXp;
      const levelAfter = playerLevel(this.orderState);
      // Merge XP can push the player over a level boundary, which may have
      // earned another order slot. advanceOrder syncs on its own path; this
      // is the other way XP is gained.
      syncOrderSlots(this.orderState, this.dispenserCollectCount, this.ownedDispenserTypeIds());
      const automaticLevelRewards = levelAfter > levelBefore ? this.autoDeliverLevelRewards() : [];
      this.updateCurrencyText();
      this.updateLevelBadge();
      this.inputLocked = false;
      this.saveState();
      this.refreshOrderBar();
      this.checkDeadlock();
      this.tryReleaseVaultItem();
      this.tryDeliverMeterGold();
      const newest = automaticLevelRewards[automaticLevelRewards.length - 1];
      this.refreshActionTray(
        newest
          ? `LEVEL ${levelAfter} REACHED  ·  ${CRATE_LABELS[newest.tier]} DELIVERED`
          : unlockedItem
            ? `ITEM UNLOCKED  ·  ${nextDef.label.toUpperCase()}\nNEW BOARD SPACE RECOVERED`
            : undefined
      );
      return;
    }

    if (view instanceof SpawnerPieceView && targetView instanceof SpawnerPieceView && this.canMergeViews(view, targetView)) {
      this.inputLocked = true;
      const worldTarget = this.cellToWorld(targetCell);
      view.setScale(1);
      await view.snapTo(worldTarget.x, worldTarget.y);

      this.grid.set(fromCell, null);
      this.views.delete(this.keyOf(fromCell));
      if (this.selectedItemKey === this.keyOf(fromCell) || this.selectedItemKey === targetKey) this.selectedItemKey = null;

      await Promise.all([view.playMergeOutAndDestroy(), targetView.playMergeOutAndDestroy()]);
      this.views.delete(targetKey);

      const color = getTierDef(view.typeId, Math.min(view.tier + 1, 9))?.color ?? Theme.accentAmber;
      burstParticles(this, worldTarget.x, worldTarget.y, color, Math.min(view.tier + 1, 5));
      const message = view.tier >= 4
        ? `${sourceTierLabel(view.typeId, 1)} BUILT\nTAP IT TO PRODUCE ${familyTierLabel(view.typeId, 1)}`
        : `${spawnerPieceLabel(view.typeId, view.tier + 1)} BUILT`;
      if (view.tier >= 4) {
        this.placeSpawner(targetCell, view.typeId, 1, true);
      } else {
        this.placeSpawnerPiece(targetCell, view.typeId, view.tier + 1, true);
      }
      this.inputLocked = false;
      this.saveState();
      this.tryReleaseVaultItem();
      this.tryDeliverMeterGold();
      this.refreshOrderBar();
      this.checkDeadlock();
      this.refreshActionTray(message);
      return;
    }

    if (view instanceof SpawnerView && targetView instanceof SpawnerView && this.canMergeViews(view, targetView)) {
      this.inputLocked = true;
      const worldTarget = this.cellToWorld(targetCell);
      view.setScale(1);
      await view.snapTo(worldTarget.x, worldTarget.y);
      const mergedSpawner = mergeDispenserPair(view.spawner, targetView.spawner);
      const nextTier = mergedSpawner.tier;
      const typeId = mergedSpawner.typeId;

      this.grid.set(fromCell, null);
      this.views.delete(this.keyOf(fromCell));
      await Promise.all([view.playMergeOutAndDestroy(), targetView.playMergeOutAndDestroy()]);
      this.views.delete(targetKey);

      const color = getTierDef(typeId, Math.min(nextTier, 9))?.color ?? Theme.accentAmber;
      burstParticles(this, worldTarget.x, worldTarget.y, color, nextTier);
      this.placeSpawner(targetCell, typeId, nextTier, true, { kind: 'spawner', ...mergedSpawner });
      this.inputLocked = false;
      this.saveState();
      this.tryReleaseVaultItem();
      this.tryDeliverMeterGold();
      this.refreshActionTray(
        `SOURCE UPGRADED  ·  ${sourceTierLabel(view.spawner.typeId, nextTier)}\n` +
        `MINIMUM OUTPUT  ·  ${familyTierLabel(view.spawner.typeId, nextTier)}`
      );
      return;
    }

    // Nothing merged. A locked target can't move (it's pinned to its cell
    // until a matching merge clears it), so that still snaps back - with a
    // reason, since a silent snap-back reads as the drag being dropped.
    if (targetView instanceof TileView && targetView.locked) {
      const def = getTierDef(targetView.typeId, targetView.tier);
      view.setScale(1);
      await view.snapTo(fromWorld.x, fromWorld.y);
      view.state = 'idle';
      this.refreshActionTray(
        `LOCKED ${def?.label?.toUpperCase() ?? 'ITEM'}  ·  ${familyTierLabel(targetView.typeId, targetView.tier)}\n` +
        'MERGE A MATCH ONTO IT TO UNLOCK'
      );
      return;
    }

    await this.swapCells(view, targetView, fromCell, targetCell);
  }

  /**
   * Trades two occupied cells when a drag lands on something it can't merge
   * with. Previously any non-matching drop just snapped back, which made
   * rearranging the board impossible - the only way to move a piece was
   * onto an empty cell, so a full board couldn't be reorganised at all.
   *
   * Locked items are excluded by the caller: they're pinned to their cell
   * until a matching merge clears them.
   */
  private async swapCells(
    view: BoardView,
    targetView: BoardView,
    fromCell: GridPosition,
    targetCell: GridPosition
  ): Promise<void> {
    const fromKey = this.keyOf(fromCell);
    const targetKey = this.keyOf(targetCell);
    const movingData = this.grid.get(fromCell);
    const targetData = this.grid.get(targetCell);
    const fromWorld = this.cellToWorld(fromCell);
    const targetWorld = this.cellToWorld(targetCell);

    if (!movingData || !targetData) {
      view.setScale(1);
      await view.snapTo(fromWorld.x, fromWorld.y);
      view.state = 'idle';
      return;
    }

    this.grid.set(fromCell, targetData);
    this.grid.set(targetCell, movingData);
    this.views.set(fromKey, targetView);
    this.views.set(targetKey, view);
    view.setGridPos(targetCell);
    targetView.setGridPos(fromCell);

    // Selection follows whichever piece the player was holding.
    if (this.selectedItemKey === fromKey) this.selectedItemKey = targetKey;
    else if (this.selectedItemKey === targetKey) this.selectedItemKey = fromKey;

    view.setScale(1);
    await Promise.all([
      view.snapTo(targetWorld.x, targetWorld.y),
      targetView.snapTo(fromWorld.x, fromWorld.y)
    ]);
    view.state = 'idle';
    targetView.state = 'idle';

    this.saveState();
    this.refreshActionTray();
  }

  private showSplitConfirmation(
    splitter: SplitterView,
    target: TileView,
    splitterCell: GridPosition,
    targetCell: GridPosition
  ): void {
    if (this.modalOpen || target.tier < 2) return;
    const def = getTierDef(target.typeId, target.tier);
    const lower = getTierDef(target.typeId, target.tier - 1);
    if (!def || !lower) return;
    this.modalOpen = true;
    const overlay = this.add.container(0, 0).setDepth(3300);
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const w = Math.min(340, this.scale.width - 36);
    const h = 280;
    const dim = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.7).setInteractive();
    const panel = this.add.graphics();
    panel.fillStyle(Theme.bgElevated, 1);
    panel.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, Theme.radiusPanel);
    panel.lineStyle(Theme.borderWidthStrong, Theme.borderOnDark, 1);
    panel.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, Theme.radiusPanel);
    const title = this.add.text(cx, cy - h / 2 + 28, 'SPLIT THIS ITEM?', {
      resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '18px', fontStyle: 'bold', color: hex(Theme.textOnDark)
    }).setOrigin(0.5);
    const subtitle = this.add.text(cx, cy - h / 2 + 51, `TURN ${def.label.toUpperCase()} INTO TWO ${lower.label.toUpperCase()}`, {
      resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '9px', color: hex(Theme.textOnDarkMuted), align: 'center'
    }).setOrigin(0.5);
    const icon = this.add.graphics().setPosition(cx, cy - 20);
    const iconSize = 82;
    const render = drawTierIcon(icon, target.typeId, target.tier, iconSize, materialLighting(def.color, def.tier));
    const present = iconPresentation(target.typeId, target.tier, iconSize);
    icon.setAlpha(render.materialAlpha).setScale(present.scale);
    icon.x += present.offsetX;
    icon.y += present.offsetY;

    const button = (x: number, label: string, color: number): { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone } => {
      const bw = 116, bh = 38;
      const bg = this.add.graphics();
      bg.fillStyle(Theme.panelAlt, 1).fillRoundedRect(x - bw / 2, cy + 82, bw, bh, Theme.radiusChip);
      bg.lineStyle(1, color, 0.9).strokeRoundedRect(x - bw / 2, cy + 82, bw, bh, Theme.radiusChip);
      const text = this.add.text(x, cy + 101, label, {
        resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '12px', fontStyle: 'bold', color: hex(color)
      }).setOrigin(0.5);
      const zone = this.add.zone(x, cy + 101, bw, bh).setInteractive({ useHandCursor: true });
      return { bg, text, zone };
    };
    const cancel = button(cx - 68, 'CANCEL', Theme.textOnDarkMuted);
    const confirm = button(cx + 68, 'SPLIT', Theme.currencyGem);
    overlay.add([dim, panel, title, subtitle, icon, cancel.bg, cancel.text, cancel.zone, confirm.bg, confirm.text, confirm.zone]);

    const close = (): void => {
      overlay.destroy(true);
      this.modalOpen = false;
      this.refreshActionTray();
    };
    dim.on('pointerdown', close);
    cancel.zone.on('pointerdown', close);
    confirm.zone.on('pointerdown', () => {
      const splitterData = this.grid.get(splitterCell);
      const targetData = this.grid.get(targetCell);
      if (splitterData?.kind !== 'splitter' || targetData?.kind !== 'item'
        || targetData.typeId !== target.typeId || targetData.tier !== target.tier) {
        close();
        return;
      }
      this.grid.set(splitterCell, null);
      this.grid.set(targetCell, null);
      this.views.delete(this.keyOf(splitterCell));
      this.views.delete(this.keyOf(targetCell));
      splitter.destroy();
      target.destroy();
      this.placeTile(targetCell, target.typeId, target.tier - 1, true);
      this.placeTile(splitterCell, target.typeId, target.tier - 1, true);
      close();
      this.saveState();
      this.refreshOrderBar();
      this.checkDeadlock();
    });
  }

  private canMergeViews(a: BoardView, b: BoardView): boolean {
    if (a === b) return false;
    if (a instanceof TileView && b instanceof TileView) {
      return !a.locked && a.typeId === b.typeId && a.tier === b.tier && getTierDef(a.typeId, a.tier + 1) != null;
    }
    if (a instanceof SpawnerPieceView && b instanceof SpawnerPieceView) {
      return a.typeId === b.typeId && a.tier === b.tier && a.tier >= 1 && a.tier <= 4;
    }
    if (a instanceof SpawnerView && b instanceof SpawnerView) {
      if (a.spawner.typeId !== b.spawner.typeId || a.spawner.tier !== b.spawner.tier || a.spawner.tier >= MAX_DISPENSER_TIER) return false;
      // Merging two tier-1 spawners removes both and replaces them with one
      // tier-2+ spawner. If that would leave zero tier-1 spawners of this
      // family while a locked tier-1 cell of it still exists, refuse - that
      // cell can only ever be cleared by a tier-1 spawner of its own
      // family (merges only go up), so this would strand it permanently.
      // See canSafelyDeliverSpawnerReward for the matching reward-side gate.
      if (a.spawner.tier === 1) {
        const otherTierOneSpawners = [...this.views.values()].filter(
          (v) => v instanceof SpawnerView && v !== a && v !== b && v.spawner.typeId === a.spawner.typeId && v.spawner.tier === 1
        ).length;
        if (otherTierOneSpawners === 0 && this.grid.hasLockedItem(a.spawner.typeId, 1)) return false;
      }
      return true;
    }
    if (a instanceof SplitterView && b instanceof TileView) {
      return !b.locked && b.tier >= 2;
    }
    return false;
  }

  private spawnFromSpawner(view: SpawnerView): void {
    this.selectedItemKey = null;
    this.rushTargetKey = this.keyOf(view.gridPos);
    if (view.spawner.typeId === 'water') {
      const now = Date.now();
      syncDispenser(view.spawner, now);
      const empties = this.grid.emptyCells();
      if (empties.length === 0) {
        this.refreshActionTray('BOARD FULL\nSELECT AN ITEM TO SELL');
        return;
      }
      const produced = collectDispenser(view.spawner, now);
      if (!produced) {
        view.refresh(now);
        this.refreshActionTray();
        return;
      }
      const nearest = this.nearestEmptyCells(view.gridPos, empties);
      const target = nearest[Math.floor(Math.random() * nearest.length)];
      this.placeTile(target, produced.typeId, produced.tier, true);
      view.refresh(now);
      view.playSpawnPulse();
      this.saveState();
      this.refreshInventoryButton();
      this.refreshActionTray();
      return;
    }
    const empties = this.grid.emptyCells();
    if (empties.length === 0) {
      this.refreshActionTray('BOARD FULL\nSELECT AN ITEM TO SELL');
      return;
    }
    // Energy is checked BEFORE collecting but spent only after the source
    // actually yields, per DISPENSER_ENERGY_RESEARCH rule 2 - a full board
    // or a dry source must never burn energy. Checking first also avoids
    // consuming one of the source's stored drops we then can't pay for.
    if (!canSpendEnergy(this.energy, ENERGY_COST_PER_COLLECT)) {
      this.updateEnergyText();
      this.refreshActionTray(
        `OUT OF ENERGY\nNEXT IN ${formatCountdown(msUntilNextEnergy(this.energy))}  ·  TAP THE ENERGY BAR TO REFILL`
      );
      return;
    }
    // The opening six drops are intentionally tier-one so the tutorial
    // teaches the merge chain instead of being skipped by a lucky bonus.
    const openingRoll = this.dispenserCollectCount < 6 ? 0.99 : Math.random();
    const produced = collectDispenser(view.spawner, Date.now(), openingRoll);
    if (!produced) {
      // Dry: hand the tray this source so it can offer the gem rush.
      view.refresh();
      this.refreshActionTray();
      return;
    }
    spendEnergy(this.energy, ENERGY_COST_PER_COLLECT);
    const nearest = this.nearestEmptyCells(view.gridPos, empties);
    const pos = nearest[Math.floor(Math.random() * nearest.length)];
    this.placeTile(pos, produced.typeId, produced.tier, true);
    view.refresh();
    view.playSpawnPulse();
    this.dispenserCollectCount++;
    // The output meter advances on the action the player already does most.
    addMeterCollect(this.rewards);
    this.tryDeliverMeterGold();
    this.refreshCrateMeter();
    this.updateEnergyText();
    this.saveState();
    this.refreshOrderBar();
    this.refreshActionTray();
  }

  /** Releases at most one item per Water source on each one-second source tick. */
  private releaseWaterSourceItems(now: number = Date.now()): void {
    let changed = false;
    const sources = [...this.views.values()].filter(
      (view): view is SpawnerView => view instanceof SpawnerView && view.spawner.typeId === 'water'
    );
    for (const source of sources) {
      syncDispenser(source.spawner, now);
      if (source.spawner.charges <= 0) continue;
      const target = this.waterOutputTarget(source);
      if (!target) continue;
      const produced = collectDispenser(source.spawner, now);
      if (!produced) continue;
      this.placeTile(target, produced.typeId, produced.tier, true);
      source.refresh(now);
      source.playSpawnPulse();
      changed = true;
    }
    if (changed) {
      this.saveState();
      this.refreshInventoryButton();
      this.refreshActionTray();
    }
  }

  /** First available neighboring cell, shared by automatic and tapped Water output. */
  private waterOutputTarget(source: SpawnerView): GridPosition | undefined {
    const offsets = [
      { col: -1, row: -1 }, { col: 0, row: -1 }, { col: 1, row: -1 },
      { col: -1, row: 0 },                         { col: 1, row: 0 },
      { col: -1, row: 1 },  { col: 0, row: 1 },  { col: 1, row: 1 }
    ];
    return offsets
      .map((offset) => ({ col: source.gridPos.col + offset.col, row: source.gridPos.row + offset.row }))
      .find((pos) => this.grid.inBounds(pos) && this.grid.isEmpty(pos));
  }


  private checkDeadlock(): void {
    // A full board is now recoverable through deliberate item selling. Never
    // seize control or destroy a piece on the player's behalf.
    if (!this.modalOpen) this.inputLocked = false;
    this.refreshActionTray?.();
  }
}
