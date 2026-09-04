import Phaser from 'phaser';
import { Grid } from '../Grid';
import type { GridCellData, SpawnerCellData } from '../Grid';
import { TileView } from '../objects/TileView';
import { SpawnerView } from '../objects/SpawnerView';
import { SpawnerPieceView, drawSpawnerPieceIcon } from '../objects/SpawnerPieceView';
import { SplitterView, drawSplitterIcon } from '../objects/SplitterView';
import type { GridPosition } from '../types';
import { CHAINS, getTierDef, isCurrencyChain, spawnerPieceTiers } from '../data/chains';
import { burstParticles, shakeForTier, floatingScore, ensureParticleTexture, shockwaveRing } from '../fx/MergeFx';
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
  ENERGY_REFILL_BASE_GEMS,
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

const FINAL_WATER_PAYOUT = 40_000;
import {
  drawBriefcase,
  drawCrate,
  CRATE_DRAWN,
  drawSourceBuilding,
  drawTierIcon,
  iconPresentation,
  sourcePalette, DECAGON_MACHINE_COLOR } from '../objects/TierIcons';
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
  dailyOfferLevel,
  DECAGON_METER_MAX,
  rollDecagonPayout,
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
import { CURRENCY_COLOR, type CurrencyKind, applyCurrencyIcon, currencyBoxFor, currencyChipOptions, currencyIcon, currencyLabel, currencyPill, drawCurrencyGlyph } from '../ui/CurrencyGlyph';
import { buildCurrencyCluster } from '../ui/CurrencyCluster';
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
import {
  AUTO_MERGE_KEY,
  BG_FALLBACK_FILE,
  BG_FALLBACK_KEY,
  BG_FILE,
  BOARD_TO_TRAY_GAP,
  BoardView,
  CHROME_BASE_CELL,
  COLS,
  CRATE_RING_LANE,
  CRATE_RING_R,
  CRATE_RING_W,
  DRAG_START_PX,
  EXPANSION_ROW_ONE,
  EXPANSION_ROW_ONE_PRICES,
  EXPANSION_ROW_TWO,
  EXPANSION_ROW_TWO_LEVEL,
  EXPANSION_ROW_TWO_PRICES,
  ExpansionLockView,
  FAMILY_NAMES,
  ForcedSpawn,
  FullscreenDoc,
  FullscreenEl,
  HudChip,
  ICON_TEXTURE_PX,
  ORDER_BAR_H,
  ORDER_BAR_TOP,
  ORDER_CARD_GAP,
  ORDER_CARD_H,
  ORDER_CARD_MAX_W,
  ORDER_CARD_MIN_W,
  ORDER_CARD_PAD,
  ORDER_GO_H,
  ORDER_GO_W,
  ORDER_HEADER_H,
  ORDER_REORDER_MS,
  OrderCardView,
  PREVIOUS_SAVE_KEY,
  PROJECT_STAGES,
  PROJECT_STAGE_NAMES,
  ProjectStage,
  ROOM_ITEM_KEYS,
  ROWS,
  RoomItemDef,
  SAVE_KEY,
  SOURCE_TEXTURE_PX,
  SPAWNER_PIECE_NAMES,
  ShopMode,
  TYPE_ID,
  UNREADABLE_SAVE_KEY,
  familyTierLabel,
  formatHudValue,
  fullscreenElement,
  fullscreenSupported,
  fullscreenTarget,
  potTextureSize,
  sourceTierLabel,
  spawnerPieceLabel,
  stashSave,
  toggleFullscreen,
} from './board/config';
import {
  onPointerUp as onPointerUpExt,
  onPointerDown as onPointerDownExt,
  onPointerMove as onPointerMoveExt,
  canMergeViews as canMergeViewsExt,
  selectItem as selectItemExt
} from './board/boardInput';

import {
  buildCurrencyChip as buildCurrencyChipExt
} from './board/hudChrome';

import {
  buildEnergyChip as buildEnergyChipExt,
  layoutHudChips as layoutHudChipsExt,
  buildLevelBadge as buildLevelBadgeExt,
  playLevelUpFlourish as playLevelUpFlourishExt,
  updateLevelBadge as updateLevelBadgeExt,
  buildShopIconButton as buildShopIconButtonExt,
  buildProjectButton as buildProjectButtonExt,
  refreshProjectButton as refreshProjectButtonExt,
  buildInventoryButton as buildInventoryButtonExt,
  buildAutoMergeButton as buildAutoMergeButtonExt,
  updateCurrencyText as updateCurrencyTextExt,
  updateEnergyText as updateEnergyTextExt
} from './board/hudChrome';

import {
  applyBoardExpansionLocks as applyBoardExpansionLocksExt,
  buildBoardExpansionLocks as buildBoardExpansionLocksExt,
  refreshBoardExpansionLocks as refreshBoardExpansionLocksExt,
  buyExpansionCell as buyExpansionCellExt,
  expansionPrice as expansionPriceExt,
  expansionRowEligible as expansionRowEligibleExt,
  firstExpansionRowComplete as firstExpansionRowCompleteExt
} from './board/boardExpansion';

import {
  buildForcedSpawnVault as buildForcedSpawnVaultExt,
  refreshForcedSpawnVault as refreshForcedSpawnVaultExt,
  drawForcedSpawnIcon as drawForcedSpawnIconExt,
  hideBehindRoomPanel as hideBehindRoomPanelExt,
  enqueueForcedSpawn as enqueueForcedSpawnExt,
  releaseOneVaultItem as releaseOneVaultItemExt,
  placeForcedSpawn as placeForcedSpawnExt,
  vaultPosition as vaultPositionExt
} from './board/boardVault';

import {
  buildCrateMeter as buildCrateMeterExt,
  refreshCrateMeter as refreshCrateMeterExt,
  drawCrateMeterProgress as drawCrateMeterProgressExt,
  claimMeterCrateReward as claimMeterCrateExt,
  tryDeliverMeterGold as tryDeliverMeterGoldExt,
  crateLaneW as crateLaneWExt,
  crateRingR as crateRingRExt,
  crateRingCentre as crateRingCentreExt,
  crateAccent as crateAccentExt
} from './board/crateMeter';

import {
  loadOrSeed as loadOrSeedExt,
  saveState as saveStateExt,
  seedLockedBoard as seedLockedBoardExt,
  migrateLockedItemsToWiderBoard as migrateLockedItemsToWiderBoardExt
} from './board/saveGame';

import {
  refreshOrderBar as refreshOrderBarExt,
  buildOrderBar as buildOrderBarExt,
  destroyOrderBar as destroyOrderBarExt,
  drawOrderScrollHint as drawOrderScrollHintExt,
  peekOrderScroll as peekOrderScrollExt,
  setOrderScroll as setOrderScrollExt,
  animateOrderScrollTo as animateOrderScrollToExt,
  orderCardWorldCenter as orderCardWorldCenterExt,
  orderBarMetrics as orderBarMetricsExt,
  showOrderDetails as showOrderDetailsExt,
  describeOrderItem as describeOrderItemExt,
  clearOrderRewardTexts as clearOrderRewardTextsExt,
  submitOrderSlot as submitOrderSlotExt,
  completeOrder as completeOrderExt,
  orderProgressSource as orderProgressSourceExt
} from './board/orderBar';

import {
  openSettings as openSettingsExt,
  buildSettingsButton as buildSettingsButtonExt,
  confirmReset as confirmResetExt,
  resetGame as resetGameExt,
  buildDevResetButton as buildDevResetButtonExt
} from './board/settingsPanel';

import {
  offerEnergyRefill as offerEnergyRefillExt
} from './board/energyPanel';

import {
  openCollection as openCollectionExt,
  closeCollection as closeCollectionExt,
  drawCollectionBook as drawCollectionBookExt,
  buildMainCollectionButton as buildMainCollectionButtonExt,
  refreshMainCollectionButton as refreshMainCollectionButtonExt
} from './board/collectionPanel';

import {
  showInventory as showInventoryExt,
  retrieveStoredItem as retrieveStoredItemExt,
  deployStoredCrate as deployStoredCrateExt,
  storeDraggedView as storeDraggedViewExt,
  refreshInventoryButton as refreshInventoryButtonExt,
  setInventoryHover as setInventoryHoverExt,
  playInventoryNudge as playInventoryNudgeExt,
  inventoryButtonBounds as inventoryButtonBoundsExt,
  isOverInventoryButton as isOverInventoryButtonExt
} from './board/inventoryPanel';

import {
  openProject as openProjectExt,
  closeProjectPanel as closeProjectPanelExt,
  restoreBoardAfterRoom as restoreBoardAfterRoomExt,
  projectStageReady as projectStageReadyExt,
  projectUnlockReady as projectUnlockReadyExt,
  projectPieceAffordable as projectPieceAffordableExt,
  projectStageFurnished as projectStageFurnishedExt,
  projectShortfall as projectShortfallExt,
  completeProjectStage as completeProjectStageExt
} from './board/projectPanel';

import {
  openDailyMenu as openDailyMenuExt
} from './board/dailyMenu';

import {
  openPlayerInfo as openPlayerInfoExt,
  dailyLevel as dailyLevelExt
} from './board/playerInfoPanel';

import {
  openShop as openShopPanel,
  closeShop as closeShopPanel,
  reopenShop as reopenShopPanel,
  buildOfferSlot as buildOfferSlotPanel,
  buyOffer as buyOfferPanel,
  drawShopCard as drawShopCardPanel,
  drawSectionBanner as drawSectionBannerPanel
} from './board/shopPanel';

export class BoardScene extends Phaser.Scene {
  grid = new Grid(COLS, ROWS);
  views = new Map<string, BoardView>(); // key = `${col},${row}`
  cellSize = 0;
  boardOriginX = 0;
  boardOriginY = 0;
  contentTop = 0;
  boardExpansionUnlocked = new Set<string>();
  expansionLockViews = new Map<string, ExpansionLockView>();
  expansionRowLabels: Phaser.GameObjects.Text[] = [];

  levelBadgeText!: Phaser.GameObjects.Text;
  /**
   * Level the badge is currently showing, so a rise can be spotted wherever
   * it comes from. 0 means "not drawn yet": the first paint after a load must
   * not celebrate the level the player already had.
   */
  /**
   * Whether the daily menu has already come up in this SESSION. The scene
   * instance survives a restart (resize, fullscreen), so this is what stops
   * the panel reopening every time the viewport changes.
   */
  private dailyMenuShown = false;
  levelBadgeShownLevel = 0;
  /**
   * The fraction the XP ring is currently DRAWN at, which trails the real
   * value while the fill animates. -1 means nothing has been drawn yet, so
   * the first paint after a scene build snaps rather than sweeping up from
   * zero.
   */
  levelXpRingDrawn = -1;
  levelXpRingTween: Phaser.Tweens.Tween | null = null;
  levelXpRing!: Phaser.GameObjects.Graphics;
  levelKeystone!: Phaser.GameObjects.Graphics;
  levelMilestoneDot!: Phaser.GameObjects.Graphics;
  levelMilestoneCount!: Phaser.GameObjects.Text;

  economy: EconomyState = createDefaultEconomy();
  coinText!: Phaser.GameObjects.Text;
  gemText!: Phaser.GameObjects.Text;
  energyText!: Phaser.GameObjects.Text;
  energy: EnergyState = createDefaultEnergy();

  orderState: OrderState = createDefaultOrderState();
  orderCards: OrderCardView[] = [];
  orderBarContainer: Phaser.GameObjects.Container | null = null;
  orderBarMaskShape: Phaser.GameObjects.Graphics | null = null;
  orderScrollHint: Phaser.GameObjects.Graphics | null = null;
  orderScroll = 0;
  orderScrollMax = 0;
  /**
   * Card position -> queue slot. Completable orders are shown first, so the
   * card the player taps is NOT necessarily the queue slot of the same
   * number; every tap goes through this map.
   */
  orderDisplayOrder: number[] = [];
  /** Ready orders at the last refresh, to detect one becoming completable. */
  orderReadyCount = 0;
  orderScrollTween: Phaser.Tweens.Tween | null = null;
  /** The draggability nudge is shown once per session, on first overflow. */
  orderPeekShown = false;
  /** In-progress horizontal flick of the order bar; `slot` is where it began. */
  orderDrag: {
    active: boolean;
    slot: number;
    startX: number;
    startScroll: number;
    moved: number;
    /** Set when the press landed on a requirement icon rather than the card. */
    describe: { typeId: string; tier: number } | null;
  } =
    { active: false, slot: -1, startX: 0, startScroll: 0, moved: 0, describe: null };
  dispenserCollectCount = 0;
  headerRight = 0;
  /** Where a board drag began, to tell a tap from a move that returned home. */
  dragStartPointer = { x: 0, y: 0 };
  overInventory = false;
  hudChips: HudChip[] = [];
  rewards: RewardsState = createDefaultRewardsState();
  crateMeterBar!: Phaser.GameObjects.Graphics;
  crateMeterProgress!: Phaser.GameObjects.Graphics;
  crateMeterIcon!: Phaser.GameObjects.Graphics;
  crateMeterContainer!: Phaser.GameObjects.Container;
  crateMeterZone!: Phaser.GameObjects.Zone;
  crateMeterRuns: Phaser.GameObjects.Text[] = [];
  crateMeterPulse?: Phaser.Tweens.Tween;
  crateMeterWasCooling = false;
  crateMeterSecond = -1;
  /** Highest stage the player has unlocked; its pieces are the buyable ones. */
  /**
   * Space between the board's bottom edge and the tray rail.
   *
   * Computed rather than constant: the tray is anchored to the bottom of the
   * screen and the board is centred above it, so on a tall phone this is
   * whatever is left over. `BOARD_TO_TRAY_GAP` is its floor, for screens with
   * nothing to spare.
   */
  boardToTrayGap = BOARD_TO_TRAY_GAP;
  /**
   * How much bigger the chrome is than its tuned size.
   *
   * Cells grow with screen WIDTH while the order cards and reserves were
   * fixed pixels, so a big phone got a big board surrounded by small UI and
   * an ever-larger dead band. This ties the chrome to the same unit the board
   * uses. Never below 1: the constants are tuned for a ~54px cell, and a
   * small phone should keep exactly the layout it has today.
   */
  chromeScale = 1;
  /** Fullscreen-only HUD scale, derived from the extra vertical room. */
  hudScale = 1;
  /**
   * Redraws the open project panel's footer, or null when it is closed.
   *
   * A stage reward is granted a tick AFTER the purchase that earns it, so the
   * footer the purchase redrew still showed the reward as pending. Handing the
   * renderer out lets the reward path refresh the panel it is standing on.
   */
  projectFooterRefresh: (() => void) | null = null;
  projectStage = 0;
  /** Keys of every room piece bought so far. Drives what the 3D room shows. */
  builtPieces = new Set<string>();
  /** The 3D room, alive only while the project panel is open. */
  roomView: RoomView3D | null = null;
  /** Board objects hidden so the full-screen room can show behind the UI. */
  roomHiddenForPanel: Phaser.GameObjects.GameObject[] = [];
  /** True while the full-screen room owns the display. */
  roomPanelOpen = false;
  /** Epoch ms before which no further supply crate may be bought. */
  /**
   * Restock deadline PER CRATE TIER, not one shared across the shelf.
   *
   * A single timer made a 550-Credit bronze lock the 2,800-Credit gold for
   * twenty-five minutes: the cheapest purchase blocked the most expensive one,
   * and the shelf's whole credit sink was capped at one crate per cooldown
   * however deep the player was. Each tier now carries its own wait, so the
   * bound stays on how fast any ONE tier can be repeated - which is what
   * bounds the piece rate - rather than on the shelf as a whole.
   *
   * `supplyCooldownUntil` is kept as the legacy field so an existing save's
   * running cooldown is not silently cleared on load.
   */
  supplyCooldownUntil = 0;
  supplyCooldownByTier: Record<string, number> = {};

  /** When this tier may next be bought. */
  supplyTierCooldown(tier: string): number {
    return Math.max(this.supplyCooldownByTier[tier] ?? 0, 0);
  }
  projectOverlay: Phaser.GameObjects.Container | null = null;
  projectButtonBg!: Phaser.GameObjects.Graphics;
  projectButtonIcon!: Phaser.GameObjects.Graphics;
  projectButtonZone!: Phaser.GameObjects.Zone;
  projectBadge!: Phaser.GameObjects.Graphics;
  /** Per-colour segments of the meter label, rebuilt on every refresh. */
  inventory: InventoryState = createDefaultInventory();
  collection: CollectionState = createDefaultCollectionState();
  collectionOverlay: Phaser.GameObjects.Container | null = null;
  mainCollectionBadge!: Phaser.GameObjects.Text;
  mainCollectionPanel!: Phaser.GameObjects.Graphics;
  invBg!: Phaser.GameObjects.Graphics;
  invLabel!: Phaser.GameObjects.Text;
  invIcon!: Phaser.GameObjects.Graphics;
  invZone!: Phaser.GameObjects.Zone;
  /** Infinite, automatic LIFO holding area for rewards that require a board cell. */
  forcedSpawnVault: ForcedSpawn[] = [];
  vaultBg!: Phaser.GameObjects.Graphics;
  vaultIcon!: Phaser.GameObjects.Container;
  vaultCountDot!: Phaser.GameObjects.Graphics;
  vaultCount!: Phaser.GameObjects.Text;
  vaultZone?: Phaser.GameObjects.Zone;
  vaultDeliveryPending = false;
  vaultInboundPending = 0;

  shopState: ShopState = createDefaultShopState();
  shopOverlay: Phaser.GameObjects.Container | null = null;
  shopMode: ShopMode = 'full';
  shopCountdownUpdater: (() => void) | null = null;
  /** Tears down the shop's scroll mask and input listeners. Set while the shop is open. */
  shopScrollCleanup: (() => void) | null = null;
  energyMenuUpdater: (() => void) | null = null;
  /**
   * Transient one-line feedback shown inside the shop panel. Needed once
   * buying stopped closing the shop: a failed buy (board full, can't
   * afford) used to be masked by the panel disappearing, and would
   * otherwise now look like the tap did nothing at all.
   */
  shopNotice: { text: string; error: boolean } | null = null;

  draggingView: BoardView | null = null;
  /**
   * Whether the pending press has crossed `DRAG_START_PX` and become a drag.
   *
   * `draggingView` is set on press so the release path can still resolve the
   * piece under the finger; this says whether the piece has actually been
   * picked up.
   */
  dragActive = false;
  dragFromCell: GridPosition | null = null;
  mergeReadyTarget: BoardView | null = null;
  selectedItemKey: string | null = null;
  lastCurrencyTap: { key: string; at: number } | null = null;
  // Board cell of the source most recently tapped. Its tray stays consistent
  // across ready/recharging states; when empty, the same panel also offers
  // the gem refill action.
  rushTargetKey: string | null = null;
  private actionBg!: Phaser.GameObjects.Graphics;
  actionText!: Phaser.GameObjects.Text;
  orderRewardTexts: Phaser.GameObjects.GameObject[] = [];
  sellButtonBg!: Phaser.GameObjects.Graphics;
  sellButton!: Phaser.GameObjects.Text;
  sellButtonAmount!: Phaser.GameObjects.Text;
  sellButtonZone!: Phaser.GameObjects.Zone;
  /** The currency mark on the sell/refill button's second line. */
  sellButtonMark!: Phaser.GameObjects.Image;
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
  inputLocked = false;
  modalOpen = false;
  autoMergeEnabled = localStorage.getItem(AUTO_MERGE_KEY) === 'true';
  autoMergeText!: Phaser.GameObjects.Text;
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
    // ONE centre line for the whole header row, set by the profile badge - it
    // is the tallest thing in the row and carries its XP ring, so everything
    // else lines up with it rather than the other way round.
    const headerMidY = ruleY - 16;
    const chipTopY = headerMidY - 8;
    // The chips' lower edge. Everything else in the row hangs off it rather
    // than sharing a centre line, because the badge, the gear and the shop
    // button are three different sizes and a common centre left their bottoms
    // ragged. Each offset below is that widget's own drawn half-height, not
    // half its box: the badge carries its XP ring 18px under its centre, and
    // the shop button a drop shadow 20px under its own - and the shop button's
    // container is scaled, so its offset scales with it.
    const chipBottomY = chipTopY + 16;
    const chipMidY = headerMidY;

    this.levelBadgeText = this.buildLevelBadge(headerX + 18 * this.hudScale, headerMidY);

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
    this.buildShopIconButton(headerRight - 18 * this.hudScale, chipMidY, () => {
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

    // The daily menu is the first thing a session says, so it comes up on
    // its own once the board has settled - and ONLY when today's reward is
    // unclaimed. `dailyMenuShown` is a field on the scene, which survives the
    // restart a resize or a fullscreen toggle causes, or the panel would come
    // back every time the viewport changed.
    if (!this.dailyMenuShown && dailyAvailable(this.rewards, Date.now())) {
      this.dailyMenuShown = true;
      this.time.delayedCall(700, () => this.openDailyMenu());
    }

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

  cellToWorld(pos: GridPosition): { x: number; y: number } {
    return {
      x: this.boardOriginX + pos.col * this.cellSize + this.cellSize / 2,
      y: this.boardOriginY + pos.row * this.cellSize + this.cellSize / 2
    };
  }

  worldToCell(x: number, y: number): GridPosition | null {
    const col = Math.floor((x - this.boardOriginX) / this.cellSize);
    const row = Math.floor((y - this.boardOriginY) / this.cellSize);
    const pos = { col, row };
    return this.grid.inBounds(pos) ? pos : null;
  }

  keyOf(pos: GridPosition): string {
    return `${pos.col},${pos.row}`;
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

      // OUT OF ENERGY: sweep every Water source, not one of them.
      //
      // The round-robin below taps a single dispenser per second, which is
      // right while energy is the constraint - it is the energy that is being
      // rationed, not the taps. At zero energy nothing else on the board can
      // be run at all and Water costs nothing, so there is no reason to
      // trickle: every Water source with something in it gets collected in
      // this pass.
      if (this.energy.current <= 0) {
        let tappedWater = false;
        for (const view of [...this.views.values()]) {
          if (!(view instanceof SpawnerView) || view.spawner.typeId !== 'water') continue;
          if (this.grid.emptyCells().length === 0) break;
          syncDispenser(view.spawner, now);
          if (view.spawner.charges <= 0) continue;
          this.spawnFromSpawner(view);
          tappedWater = true;
        }
        if (tappedWater) return;
      }

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
          // timer, so auto-tapping it normally hands it a second production
          // pass - it is skipped while there is energy to spend elsewhere.
          const isWater = dispenser.spawner.typeId === 'water';
          if (isWater && this.energy.current > 0) continue;
          if (this.grid.emptyCells().length === 0 || dispenser.spawner.charges <= 0) continue;
          // The energy gate MUST NOT apply to Water: collecting from it spends
          // none. Without this exclusion the zero-energy case above was undone
          // one line later - `canSpendEnergy` fails at zero, so the one source
          // that could still be run was the one being skipped.
          if (!isWater && !canSpendEnergy(this.energy, ENERGY_COST_PER_COLLECT)) continue;
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
    // The SPLITTER is excluded. `canMergeViews` reports a splitter against any
    // unlocked tier-2+ item as a legal pairing - which it is, for a player who
    // chose to spend it - but it is a one-shot tool, not a merge. Left in, the
    // auto merge saw a permanently "mergeable" pair and fed the player's
    // splitter the first item it found, every time one was on the board.
    const entries = [...this.views.entries()]
      .filter(([, view]) => !(view instanceof SplitterView))
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
        // STALE VIEWS ARE SKIPPED. `entries` is a snapshot, and a lot can
        // destroy a view between taking it and using it - a crate flight
        // landing, a payout consuming cells, a source being emptied. Merging
        // a destroyed view means tweening an object whose scene is gone,
        // which throws from inside this async step.
        if (!fromView.active || !targetView.active) continue;
        if (this.views.get(fromKey) !== fromView || this.views.get(targetKey) !== targetView) continue;

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
        // AND IF IT THROWS ANYWAY, THE GAME MUST NOT LOCK.
        //
        // `onPointerUp` sets `inputLocked` while a merge animates and clears
        // it at the end. An exception in between skipped that clear, and
        // because nothing else ever resets the flag the board kept rendering
        // while ignoring every tap - the whole screen frozen, permanently,
        // with no error visible to the player. The drag flags stranded the
        // same way, which also stopped the auto merge dead.
        try {
          await this.onPointerUp({ x: target.x, y: target.y } as Phaser.Input.Pointer);
        } catch (error) {
          console.error('[auto-merge] step failed; releasing input', error);
          this.inputLocked = false;
        } finally {
          this.draggingView = null;
          this.dragActive = false;
        }
        return;
      }
    }
  }

  // ---- Orders ----






  /** Level milestone crates are automatic physical rewards, never profile claims. */
  autoDeliverLevelRewards(): { level: number; tier: CrateTier }[] {
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













  // ---- Selection / sell tray ----


















































  /** Earned crates are forced spawns: board immediately, or the infinite vault until space opens. */
  awardCrate(tier: CrateTier, source = '', from?: { x: number; y: number }): boolean {
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
  firstFreeCellInReadingOrder(): GridPosition | null {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (this.grid.isEmpty({ col, row })) return { col, row };
      }
    }
    return null;
  }


  placeCrate(pos: GridPosition, tier: string, remaining: CratePayloadEntry[], readyAt?: number): CrateView {
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

  buySupplyCrate(offer: SupplyCrateOffer, from?: { x: number; y: number }): boolean {
    const price = supplyCratePrice(offer, playerLevel(this.orderState));
    if (this.economy.coins < price) {
      this.refreshActionTray(`NOT ENOUGH CREDITS  ·  ${CRATE_LABELS[offer.tier]}`);
      return false;
    }
    if (!supplyCrateReady(this.supplyTierCooldown(offer.tier), Date.now())) {
      this.refreshActionTray(
        `${CRATE_LABELS[offer.tier]} RESTOCKING\nNEXT IN ${formatCrateWait(supplyCooldownRemaining(this.supplyTierCooldown(offer.tier), Date.now()))}`
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
    this.supplyCooldownByTier[offer.tier] = Date.now() + offer.cooldownMs;
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
  tapCrate(view: CrateView): void {
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
        // A FULL BOARD NO LONGER STOPS A CRATE. Only producers used to be
        // routed to the vault here; items and source pieces were refused, so
        // a crate opened on a full board handed over some of its contents and
        // then jammed on the first tile. Everything placeable now takes the
        // same route, and the player draws it back out when they make room.
        cell.remaining.shift();
        const stored: ForcedSpawn = entry.kind === 'resource-producer'
          ? { kind: 'resource-producer', producerId: entry.producerId, remaining: entry.remaining }
          : entry.kind === 'spawner-piece'
            ? { kind: 'spawner-piece', typeId: entry.typeId, tier: entry.tier }
            : { kind: 'item', typeId: entry.typeId, tier: entry.tier };
        this.enqueueForcedSpawn(stored, world);
        view.playDispensePulse();
        if (cell.remaining.length === 0) void this.consumeCrate(view);
        else this.grid.set(view.gridPos, cell);
        this.saveState();
        this.refreshActionTray('BOARD FULL  ·  SENT TO THE VAULT');
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
    this.tryDeliverMeterGold();
    this.saveState();
    this.checkDeadlock();
  }

  tapResourceProducer(view: ResourceProducerView): void {
    const cell = this.grid.get(view.gridPos);
    if (cell?.kind !== 'resource-producer') return;
    const empties = this.grid.emptyCells();
    if (empties.length === 0) {
      // Same rule the crates now follow: a full board sends the drop to the
      // vault instead of refusing the tap. A pouch or basket that could not
      // be emptied while the board was full was the slowest thing on it -
      // the player had to clear space to reclaim the space it was sitting on.
      const config = RESOURCE_PRODUCERS[cell.producerId];
      const world = this.cellToWorld(view.gridPos);
      this.enqueueForcedSpawn(
        { kind: 'item', typeId: config.typeId, tier: rollResourceTier(cell.producerId) },
        world
      );
      cell.remaining--;
      view.playDispensePulse();
      if (cell.remaining <= 0) {
        const key = this.keyOf(view.gridPos);
        this.grid.set(view.gridPos, null);
        this.views.delete(key);
        if (this.selectedItemKey === key) this.selectedItemKey = null;
        void view.playEmptyAndDestroy();
      } else {
        this.grid.set(view.gridPos, cell);
      }
      this.saveState();
      this.refreshActionTray('BOARD FULL  ·  SENT TO THE VAULT');
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
    } else {
      this.grid.set(view.gridPos, cell);
      this.selectedItemKey = this.keyOf(view.gridPos);
    }
    this.saveState();
    this.refreshOrderBar();
    this.refreshActionTray();
  }

  collectCurrencyItem(view: TileView): void {
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
    this.saveState();
    this.refreshActionTray(`${getTierDef(view.typeId, view.tier)?.label?.toUpperCase() ?? 'RESOURCE'} COLLECTED`);
  }

  collectFinalWater(view: TileView): void {
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
      }
    });
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

  refreshActionTray(message?: string): void {
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
    this.tryDeliverMeterGold();
    this.saveState();
    this.refreshOrderBar();
    this.refreshActionTray(`SOLD  +${value} CR\nSPACE RECOVERED`);
  }

  queueSpawnerReward(typeId: string, tier: number, from?: { x: number; y: number }): void {
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
  canSafelyDeliverSpawnerReward(typeId: string, tier: number): boolean {
    if (tier !== 1) return true;
    const hasExistingSpawner = [...this.views.values()].some((v) => v instanceof SpawnerView && v.spawner.typeId === typeId);
    if (!hasExistingSpawner) return true;
    return !this.grid.hasLockedItem(typeId, 1);
  }



  availableShopTypeIds(): string[] {
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
  ownedDispenserTypeIds(): string[] {
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

  specialShopTypeIds(): string[] {
    return availableSpawnerPieceFamilies(this.ownedDispenserTypeIds());
  }

  // ---- Shop ----

  // The shop panel lives in board/shopPanel.ts. These forward to it so the
  // scene's own call sites keep reading as methods.
  openShop(mode: ShopMode = this.shopMode): void { openShopPanel(this, mode); }
  closeShop(): void { closeShopPanel(this); }
  reopenShop(notice: { text: string; error: boolean } | null): void { reopenShopPanel(this, notice); }
  buildOfferSlot(
    container: Phaser.GameObjects.Container, x: number, y: number, w: number,
    key: ShopRowKey, index: number, wasTap: () => boolean
  ): void { buildOfferSlotPanel(this, container, x, y, w, key, index, wasTap); }
  buyOffer(key: ShopRowKey, index: number): void { buyOfferPanel(this, key, index); }
  drawShopCard(
    x: number, y: number, w: number, h: number, accent: number,
    options: { footer?: number; header?: number; solidHeader?: boolean } = {}
  ): Phaser.GameObjects.Graphics { return drawShopCardPanel(this, x, y, w, h, accent, options); }
  drawSectionBanner(cx: number, cy: number, w: number, color: number): Phaser.GameObjects.Graphics {
    return drawSectionBannerPanel(this, cx, cy, w, color);
  }

  /**
   * THE DECAGON METER.
   *
   * Reads the board rather than a running total, because the rule is that ten
   * have to be STANDING THERE at once: sell one, store one, or let a crate
   * payload take the cell it wanted, and the count genuinely goes down. A
   * banked counter would quietly turn this into "feed it ten over time",
   * which is a different and much easier feature.
   *
   * The stored `decagonMeter` is only the display's memory of that count, so
   * partial progress survives a Decagon running dry between sessions.
   */
  private decagonOnBoard(): number {
    return this.grid.countAtTier(1, 'decagon');
  }

  /**
   * Pushes the meter reading onto every Decagon machine on the board. Called
   * whenever the count can have changed - a drop landing, a sale, a store, a
   * payout - because the pips read the board and the board changes underneath
   * them constantly.
   */
  refreshDecagonMachines(): void {
    const held = Math.min(DECAGON_METER_MAX, this.decagonOnBoard());
    this.rewards.decagonMeter = held;
    for (const view of this.views.values()) {
      if (view instanceof SpawnerView && view.spawner.typeId === 'decagon') view.setDecagonHeld(held);
    }
  }

  /**
   * Cashes the meter when the tenth Decagon lands: consumes all ten, rolls
   * the prize table, and hands the prize over through the ordinary reward
   * path - so it lands on the board if there is room and waits in the vault
   * if there is not. Ten cells have just come free, which covers the common
   * prizes outright and leaves the big ones spilling on purpose.
   */
  private tryCashDecagonMeter(): void {
    const held = this.decagonOnBoard();
    this.rewards.decagonMeter = Math.min(DECAGON_METER_MAX, held);
    if (held < DECAGON_METER_MAX) {
      this.refreshDecagonMachines();
      this.refreshActionTray(`DECAGON METER  ·  ${held}/${DECAGON_METER_MAX} ON THE BOARD`);
      return;
    }

    // THE MACHINE STAYS UNTIL THE HAUL IS OUT.
    //
    // It used to vanish the instant the meter filled, which threw the payout
    // away from a cell with nothing on it. The Decagon is what is paying, so
    // it has to still be there while it pays - it eats, it spins, it spits
    // the haul out one piece at a time, and only then does it go.
    //
    // Found FIRST, because the ten items have to know where to fly to.
    const machine = [...this.views.entries()].find(
      (entry): entry is [string, SpawnerView] =>
        entry[1] instanceof SpawnerView && entry[1].spawner.typeId === 'decagon'
    );
    let origin = { x: this.scale.width / 2, y: this.scale.height / 2 };
    if (machine) origin = this.cellToWorld(machine[1].gridPos);

    // THE MEAL. The ten are pulled INTO the machine rather than deleted where
    // they stand - they were blinking out in a single frame, which is the one
    // moment that explains what a Decagon does.
    //
    // Their grid cells and their views part company here: the cells clear
    // immediately, so nothing can count or land on them while the flight is
    // in the air, and the views live on unowned until they arrive.
    let eaten = 0;
    const CONSUME_STAGGER_MS = 55;
    const CONSUME_FLIGHT_MS = 480;
    for (let row = 0; row < ROWS && eaten < DECAGON_METER_MAX; row++) {
      for (let col = 0; col < COLS && eaten < DECAGON_METER_MAX; col++) {
        const pos = { col, row };
        const cell = this.grid.get(pos);
        if (cell?.kind !== 'item' || cell.typeId !== 'decagon') continue;
        const key = this.keyOf(pos);
        const view = this.views.get(key);
        this.views.delete(key);
        this.grid.set(pos, null);
        if (this.selectedItemKey === key) this.selectedItemKey = null;
        if (view) {
          this.tweens.add({
            targets: view,
            x: origin.x,
            y: origin.y,
            scale: 0.15,
            angle: 200,
            alpha: 0.85,
            delay: eaten * CONSUME_STAGGER_MS,
            duration: CONSUME_FLIGHT_MS,
            // Accelerating in: it should look pulled, not placed.
            ease: 'Quad.In',
            onComplete: () => view.destroy()
          });
        }
        eaten++;
      }
    }

    // The payout waits for the last mouthful to land.
    const swallowMs = CONSUME_FLIGHT_MS + CONSUME_STAGGER_MS * Math.max(0, eaten - 1);
    machine?.[1].setDepth(1);
    this.time.delayedCall(swallowMs, () => machine?.[1].playPayoutSpin());

    const payout = rollDecagonPayout(this.rewards);
    const crates = payout.filter((entry) => entry.kind === 'crate').length;
    this.refreshActionTray(
      `DECAGON METER PAID  ·  ${payout.length} ITEMS
` +
      `${crates} CRATES  ·  ${payout.length - crates} BASKETS`
    );

    // ONE AT A TIME, on a timer. Handing all six over in the same frame put
    // them on the board as a single silent pop; spaced out, each one is its
    // own arrival and the spin has something to be spinning for.
    const PAYOUT_BEAT_MS = 300;
    let next = 0;
    const emit = (): void => {
      const entry = payout[next++];
      if (!entry) {
        // The machine leaves with the last item, not before it.
        if (machine) {
          const [key, view] = machine;
          const at = this.cellToWorld(view.gridPos);
          // The cell is held until the collapse finishes, so nothing from the
          // vault lands on top of a machine that is still leaving.
          view.playExit(() => {
            shockwaveRing(this, at.x, at.y, DECAGON_MACHINE_COLOR);
            this.grid.set(view.gridPos, null);
            this.views.delete(key);
            view.destroy();
            this.refreshDecagonMachines();
            this.saveState();
            this.checkDeadlock();
          });
        }
        this.refreshDecagonMachines();
        this.saveState();
        this.refreshOrderBar();
        this.checkDeadlock();
        return;
      }
      if (entry.kind === 'crate') {
        this.awardCrate(entry.tier, 'DECAGON', origin);
      } else {
        this.enqueueForcedSpawn(
          {
            kind: 'resource-producer',
            producerId: entry.producerId,
            remaining: RESOURCE_PRODUCERS[entry.producerId].capacity
          },
          origin
        );
      }
      this.time.delayedCall(PAYOUT_BEAT_MS, emit);
    };
    this.time.delayedCall(swallowMs + 260, emit);
  }

  placeTile(pos: GridPosition, typeId: string, tier: number, animateIn: boolean): TileView {
    const world = this.cellToWorld(pos);
    const view = new TileView(this, world.x, world.y, this.cellSize, typeId, tier, pos);
    this.grid.set(pos, { kind: 'item', typeId, tier });
    this.views.set(this.keyOf(pos), view);
    if (!isCurrencyChain(typeId) && discoverItem(this.collection, typeId, tier)) this.updateLevelBadge();
    // A Decagon landing is the only thing that can complete the meter, and it
    // is checked after the tile exists so the tenth one is counted.
    if (typeId === 'decagon') this.time.delayedCall(0, () => this.tryCashDecagonMeter());
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

  placeLockedTile(pos: GridPosition, typeId: string, tier: number): TileView {
    const world = this.cellToWorld(pos);
    const view = new TileView(this, world.x, world.y, this.cellSize, typeId, tier, pos, true);
    this.grid.set(pos, { kind: 'locked-item', typeId, tier });
    this.views.set(this.keyOf(pos), view);
    return view;
  }



  placeSpawner(
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

  placeResourceProducer(pos: GridPosition, producerId: ResourceProducerId, remaining: number, animateIn: boolean): ResourceProducerView {
    const world = this.cellToWorld(pos);
    const view = new ResourceProducerView(this, world.x, world.y, this.cellSize, producerId, pos);
    this.grid.set(pos, { kind: 'resource-producer', producerId, remaining });
    this.views.set(this.keyOf(pos), view);
    if (animateIn) view.playSpawnPulse();
    return view;
  }

  placeSpawnerPiece(pos: GridPosition, typeId: string, tier: number, animateIn: boolean): SpawnerPieceView {
    const world = this.cellToWorld(pos);
    const view = new SpawnerPieceView(this, world.x, world.y, this.cellSize, typeId, tier, pos);
    this.grid.set(pos, { kind: 'spawner-piece', typeId, tier });
    this.views.set(this.keyOf(pos), view);
    if (animateIn) void view.playMergeIn();
    return view;
  }

  placeSplitter(pos: GridPosition, animateIn: boolean): SplitterView {
    const world = this.cellToWorld(pos);
    const view = new SplitterView(this, world.x, world.y, this.cellSize, pos);
    this.grid.set(pos, { kind: 'splitter' });
    this.views.set(this.keyOf(pos), view);
    if (animateIn) view.playSpawnPulse();
    return view;
  }
















  spawnFromSpawner(view: SpawnerView): void {
    this.selectedItemKey = null;
    this.rushTargetKey = this.keyOf(view.gridPos);

    // THE DECAGON. Costs energy per tap, like every source except Water.
    //
    // Ten taps is ten energy, which looks symbolic against a hundred-point
    // bar - but to a player sitting at zero it is twenty minutes of regen,
    // and that is exactly the player a gate should bite. Leaving it free
    // would also have taken away Water's identity, which is being THE
    // no-energy dispenser.
    //
    // The machine does not end when its reservoir empties - it ends when
    // the meter pays out. See tryCashDecagonMeter.
    if (view.spawner.typeId === 'decagon') {
      const now = Date.now();
      syncDispenser(view.spawner, now);
      const empties = this.grid.emptyCells();
      if (empties.length === 0) {
        this.refreshActionTray('BOARD FULL\nTHE DECAGON NEEDS ROOM TO DROP');
        return;
      }
      // Checked before collecting, the same rule the other sources follow:
      // a dry machine or a full board must never burn energy.
      if (!canSpendEnergy(this.energy, ENERGY_COST_PER_COLLECT)) {
        this.updateEnergyText();
        this.refreshActionTray(
          `OUT OF ENERGY\nNEXT IN ${formatCountdown(msUntilNextEnergy(this.energy))}  ·  TAP THE ENERGY BAR TO REFILL`
        );
        return;
      }
      const produced = collectDispenser(view.spawner, now);
      if (!produced) {
        view.refresh(now);
        this.refreshActionTray();
        return;
      }
      spendEnergy(this.energy, ENERGY_COST_PER_COLLECT);
      const nearest = this.nearestEmptyCells(view.gridPos, empties);
      this.placeTile(nearest[Math.floor(Math.random() * nearest.length)], produced.typeId, produced.tier, true);
      view.playSpawnPulse();
      view.refresh(now);
      // Deliberately NOT feeding the crate meter as well: a Decagon tap
      // already pays into the Decagon meter, and counting it twice would
      // make this the best way to farm ordinary crates too.
      this.updateEnergyText();
      this.refreshActionTray();
      this.saveState();
      this.refreshOrderBar();
      this.checkDeadlock();
      return;
    }

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


  checkDeadlock(): void {
    // A full board is now recoverable through deliberate item selling. Never
    // seize control or destroy a piece on the player's behalf.
    if (!this.modalOpen) this.inputLocked = false;
    this.refreshActionTray?.();
  }

  // Forwards to board/playerInfoPanel.ts, so the scene's own call sites
  // still read as methods.
  openPlayerInfo(): void { openPlayerInfoExt(this); }
  dailyLevel(now: number): number { return dailyLevelExt(this, now); }

  // Forwards to board/dailyMenu.ts, so the scene's own call sites
  // still read as methods.
  openDailyMenu(): void { openDailyMenuExt(this); }

  // Forwards to board/projectPanel.ts, so the scene's own call sites
  // still read as methods.
  openProject(): void { openProjectExt(this); }
  closeProjectPanel(): void { closeProjectPanelExt(this); }
  restoreBoardAfterRoom(): void { restoreBoardAfterRoomExt(this); }
  projectStageReady(): boolean { return projectStageReadyExt(this); }
  projectUnlockReady(): boolean { return projectUnlockReadyExt(this); }
  projectPieceAffordable(): boolean { return projectPieceAffordableExt(this); }
  projectStageFurnished(stage: number): boolean { return projectStageFurnishedExt(this, stage); }
  projectShortfall(stage: ProjectStage): number { return projectShortfallExt(this, stage); }
  completeProjectStage(stageDef: ProjectStage, from: { x: number; y: number }, reopenProject = false): boolean { return completeProjectStageExt(this, stageDef, from, reopenProject); }

  // Forwards to board/inventoryPanel.ts, so the scene's own call sites
  // still read as methods.
  showInventory(initialScroll = 0): void { showInventoryExt(this, initialScroll); }
  retrieveStoredItem(index: number): void { retrieveStoredItemExt(this, index); }
  deployStoredCrate(index: number, tier: CrateTier, kept?: CratePayloadEntry[], readyAt?: number): void { deployStoredCrateExt(this, index, tier, kept, readyAt); }
  storeDraggedView(view: BoardView, fromCell: GridPosition): boolean { return storeDraggedViewExt(this, view, fromCell); }
  refreshInventoryButton(hovered = false): void { refreshInventoryButtonExt(this, hovered); }
  setInventoryHover(hovered: boolean): void { setInventoryHoverExt(this, hovered); }
  playInventoryNudge(): void { playInventoryNudgeExt(this); }
  inventoryButtonBounds(): Phaser.Geom.Rectangle { return inventoryButtonBoundsExt(this); }
  isOverInventoryButton(x: number, y: number): boolean { return isOverInventoryButtonExt(this, x, y); }

  // Forwards to board/collectionPanel.ts, so the scene's own call sites
  // still read as methods.
  openCollection(initialScroll = 0): void { openCollectionExt(this, initialScroll); }
  closeCollection(): void { closeCollectionExt(this); }
  drawCollectionBook(g: Phaser.GameObjects.Graphics, size: number, color: number): void { drawCollectionBookExt(this, g, size, color); }
  buildMainCollectionButton(): void { buildMainCollectionButtonExt(this); }
  refreshMainCollectionButton(): void { refreshMainCollectionButtonExt(this); }

  // Forwards to board/energyPanel.ts, so the scene's own call sites
  // still read as methods.
  offerEnergyRefill(): void { offerEnergyRefillExt(this); }

  // Forwards to board/settingsPanel.ts, so the scene's own call sites
  // still read as methods.
  openSettings(): void { openSettingsExt(this); }
  buildSettingsButton(): void { buildSettingsButtonExt(this); }
  confirmReset(): void { confirmResetExt(this); }
  resetGame(): void { resetGameExt(this); }
  buildDevResetButton(): void { buildDevResetButtonExt(this); }

  // Forwards to board/orderBar.ts, so the scene's own call sites
  // still read as methods.
  refreshOrderBar(): void { refreshOrderBarExt(this); }
  buildOrderBar(): void { buildOrderBarExt(this); }
  destroyOrderBar(): void { destroyOrderBarExt(this); }
  drawOrderScrollHint(): void { drawOrderScrollHintExt(this); }
  peekOrderScroll(): void { peekOrderScrollExt(this); }
  setOrderScroll(value: number): void { setOrderScrollExt(this, value); }
  animateOrderScrollTo(target: number): void { animateOrderScrollToExt(this, target); }
  orderCardWorldCenter(position: number): { x: number; y: number } | null { return orderCardWorldCenterExt(this, position); }
  orderBarMetrics(): { cardH: number; y: number; viewW: number } { return orderBarMetricsExt(this); }
  showOrderDetails(order: OrderDef, current: number, target: number): void { showOrderDetailsExt(this, order, current, target); }
  describeOrderItem(typeId: string, tier: number): void { describeOrderItemExt(this, typeId, tier); }
  clearOrderRewardTexts(): void { clearOrderRewardTextsExt(this); }
  submitOrderSlot(queueSlot: number): void { submitOrderSlotExt(this, queueSlot); }
  completeOrder(index: number, order: OrderDef, position: number): void { completeOrderExt(this, index, order, position); }
  orderProgressSource(): OrderProgressSource { return orderProgressSourceExt(this); }

  // Forwards to board/saveGame.ts, so the scene's own call sites
  // still read as methods.
  loadOrSeed(): void { loadOrSeedExt(this); }
  saveState(): void { saveStateExt(this); }
  seedLockedBoard(preserveEmpty: number): void { seedLockedBoardExt(this, preserveEmpty); }
  migrateLockedItemsToWiderBoard(savedCells: (GridCellData | null)[][]): void { migrateLockedItemsToWiderBoardExt(this, savedCells); }

  // Forwards to board/crateMeter.ts, so the scene's own call sites
  // still read as methods.
  buildCrateMeter(): void { buildCrateMeterExt(this); }
  refreshCrateMeter(now = Date.now()): void { refreshCrateMeterExt(this, now); }
  drawCrateMeterProgress(now = Date.now()): void { drawCrateMeterProgressExt(this, now); }
  claimMeterCrate(): void { claimMeterCrateExt(this); }
  tryDeliverMeterGold(): boolean { return tryDeliverMeterGoldExt(this); }
  crateLaneW(): number { return crateLaneWExt(this); }
  crateRingR(): number { return crateRingRExt(this); }
  crateRingCentre(): { cx: number; cy: number } { return crateRingCentreExt(this); }
  crateAccent(tier: CrateTier): number { return crateAccentExt(this, tier); }

  // Forwards to board/boardVault.ts, so the scene's own call sites
  // still read as methods.
  buildForcedSpawnVault(): void { buildForcedSpawnVaultExt(this); }
  refreshForcedSpawnVault(): void { refreshForcedSpawnVaultExt(this); }
  drawForcedSpawnIcon(g: Phaser.GameObjects.Graphics, spawn: ForcedSpawn, size: number): void { drawForcedSpawnIconExt(this, g, spawn, size); }
  hideBehindRoomPanel(view: Phaser.GameObjects.GameObject & { visible: boolean }): void { hideBehindRoomPanelExt(this, view); }
  enqueueForcedSpawn(spawn: ForcedSpawn, from?: { x: number; y: number }): void { enqueueForcedSpawnExt(this, spawn, from); }
  releaseOneVaultItem(): boolean { return releaseOneVaultItemExt(this); }
  placeForcedSpawn(spot: GridPosition, spawn: ForcedSpawn): BoardView { return placeForcedSpawnExt(this, spot, spawn); }
  vaultPosition(): { x: number; y: number } { return vaultPositionExt(this); }

  // Forwards to board/boardExpansion.ts, so the scene's own call sites
  // still read as methods.
  applyBoardExpansionLocks(savedCells?: (GridCellData | null)[][]): void { applyBoardExpansionLocksExt(this, savedCells); }
  buildBoardExpansionLocks(): void { buildBoardExpansionLocksExt(this); }
  refreshBoardExpansionLocks(): void { refreshBoardExpansionLocksExt(this); }
  buyExpansionCell(pos: GridPosition): void { buyExpansionCellExt(this, pos); }
  expansionPrice(pos: GridPosition): number { return expansionPriceExt(this, pos); }
  expansionRowEligible(row: number): boolean { return expansionRowEligibleExt(this, row); }
  firstExpansionRowComplete(): boolean { return firstExpansionRowCompleteExt(this); }

  // Forwards to board/hudChrome.ts, so the scene's own call sites
  // still read as methods.
  buildEnergyChip(y: number): HudChip { return buildEnergyChipExt(this, y); }
  layoutHudChips(): void { layoutHudChipsExt(this); }
  buildLevelBadge(cx: number, cy: number): Phaser.GameObjects.Text { return buildLevelBadgeExt(this, cx, cy); }
  playLevelUpFlourish(): void { playLevelUpFlourishExt(this); }
  updateLevelBadge(): void { updateLevelBadgeExt(this); }
  buildShopIconButton(cx: number, cy: number, onTap: () => void): void { buildShopIconButtonExt(this, cx, cy, onTap); }
  buildProjectButton(): void { buildProjectButtonExt(this); }
  refreshProjectButton(): void { refreshProjectButtonExt(this); }
  buildInventoryButton(): void { buildInventoryButtonExt(this); }
  buildAutoMergeButton(): void { buildAutoMergeButtonExt(this); }
  updateCurrencyText(): void { updateCurrencyTextExt(this); }
  updateEnergyText(): void { updateEnergyTextExt(this); }

  // Forwards to board/hudChrome.ts, so the scene's own call sites
  // still read as methods.
  buildCurrencyChip(y: number, accent: number, glyph: 'coin' | 'gem', onTap: () => void): HudChip { return buildCurrencyChipExt(this, y, accent, glyph, onTap); }

  // Forwards to board/boardInput.ts, so the scene's own call sites
  // still read as methods.
  async onPointerUp(pointer: Phaser.Input.Pointer): Promise<void> { await onPointerUpExt(this, pointer); }
  onPointerDown(pointer: Phaser.Input.Pointer): void { onPointerDownExt(this, pointer); }
  onPointerMove(pointer: Phaser.Input.Pointer): void { onPointerMoveExt(this, pointer); }
  canMergeViews(a: BoardView, b: BoardView): boolean { return canMergeViewsExt(this, a, b); }
  selectItem(key: string): void { selectItemExt(this, key); }
}
