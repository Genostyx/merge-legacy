/**
 * Global energy - the SESSION-length pacing gate.
 *
 * This deliberately sits alongside the per-family dispenser recharge ladder
 * (see Dispensers.ts) rather than replacing it. The two gate different time
 * scales, which is what Merge Mansion does too ("timer progress and global
 * energy are independent" - docs/DISPENSER_ENERGY_RESEARCH.md):
 *
 *   - The dispenser ladder paces the MINUTE. Drain a reservoir, watch it
 *     tick back, collect when it lights up. Playtesting says this is the
 *     most satisfying beat in the game, so energy must not smother it.
 *   - Energy paces the SESSION. It caps how long one sitting can run
 *     before the player has to come back later.
 *
 * The binding design constraint, from that same doc: energy must never be
 * tight enough to stop a player spending the drops a dispenser hands them.
 * With ENERGY_CAP 100 against the largest reservoir on the board (wood, 30
 * drops), a full-energy player can drain every source several times over -
 * see the `covers a full board of reservoirs` test, which pins that.
 *
 * Numbers are the researched Merge Mansion values (cap 100, 1 per 2 min,
 * 1 per producer tap), which the doc also found Tasty Travels matches on
 * refill rate.
 */
export interface EnergyState {
  current: number;
  /**
   * When the in-progress refill tick started. Advances by whole ticks as
   * energy accrues, so partial progress survives a reload instead of
   * restarting - a player who quits 1:59 into a tick doesn't lose it.
   */
  lastTickAt: number;
  refillPurchases: number;
  refillPriceResetAt: number;
}

export const ENERGY_CAP = 100;
export const ENERGY_REFILL_MS = 120_000; // 1 energy per 2 minutes
export const ENERGY_COST_PER_COLLECT = 1;

export const ENERGY_REFILL_BASE_GEMS = 20;
export const ENERGY_REFILL_PRICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function createDefaultEnergy(now: number = Date.now()): EnergyState {
  return { current: ENERGY_CAP, lastTickAt: now, refillPurchases: 0, refillPriceResetAt: 0 };
}

export function energyRefillCost(state: EnergyState, now: number = Date.now()): number {
  if (!Number.isFinite(state.refillPurchases) || !Number.isFinite(state.refillPriceResetAt)
    || (state.refillPriceResetAt > 0 && now >= state.refillPriceResetAt)) {
    state.refillPurchases = 0;
    state.refillPriceResetAt = 0;
  }
  return ENERGY_REFILL_BASE_GEMS * (2 ** state.refillPurchases);
}

export function recordEnergyRefillPurchase(state: EnergyState, now: number = Date.now()): void {
  energyRefillCost(state, now);
  if (state.refillPurchases === 0) state.refillPriceResetAt = now + ENERGY_REFILL_PRICE_WINDOW_MS;
  state.refillPurchases += 1;
}

/**
 * Accrues elapsed (including offline) refill ticks. Safe to call every
 * frame; it only mutates on a completed tick boundary.
 */
export function syncEnergy(state: EnergyState, now: number = Date.now()): void {
  if (!Number.isFinite(state.current)) state.current = ENERGY_CAP;
  state.current = Math.max(0, Math.floor(state.current));
  // Only non-finite counts as missing. Treating 0 as missing would wipe the
  // elapsed interval whenever the epoch really is 0.
  if (!Number.isFinite(state.lastTickAt)) state.lastTickAt = now;

  // At or above cap there is no natural refill, and the tick clock restarts
  // from now - otherwise sitting full for an hour would bank a backlog that
  // instantly refunds the next 30 collects.
  if (state.current >= ENERGY_CAP) {
    state.lastTickAt = now;
    return;
  }

  const elapsed = now - state.lastTickAt;
  if (elapsed < ENERGY_REFILL_MS) return;

  const ticks = Math.floor(elapsed / ENERGY_REFILL_MS);
  state.current = Math.min(ENERGY_CAP, state.current + ticks);
  state.lastTickAt = state.current >= ENERGY_CAP ? now : state.lastTickAt + ticks * ENERGY_REFILL_MS;
}

export function canSpendEnergy(state: EnergyState, amount: number, now: number = Date.now()): boolean {
  syncEnergy(state, now);
  return state.current >= amount;
}

export function spendEnergy(state: EnergyState, amount: number, now: number = Date.now()): boolean {
  if (!canSpendEnergy(state, amount, now)) return false;
  // Dropping from full starts the refill clock at the moment of the spend,
  // so the first tick after a full bar is a complete interval.
  const wasFull = state.current >= ENERGY_CAP;
  state.current -= amount;
  if (wasFull) state.lastTickAt = now;
  return true;
}

/**
 * Grants energy. Purchases and rewards may push PAST the natural cap (a
 * researched Merge Mansion behaviour); natural refill then stays paused
 * until the player spends back below it.
 */
export function addEnergy(state: EnergyState, amount: number, now: number = Date.now()): void {
  state.current = Math.max(0, state.current + amount);
  if (state.current >= ENERGY_CAP) state.lastTickAt = now;
}

/** ms until the next single energy arrives, or 0 when at/above cap. */
export function msUntilNextEnergy(state: EnergyState, now: number = Date.now()): number {
  syncEnergy(state, now);
  if (state.current >= ENERGY_CAP) return 0;
  return Math.max(0, state.lastTickAt + ENERGY_REFILL_MS - now);
}

/** ms until the bar is back to full, or 0 when already at/above cap. */
export function msUntilEnergyFull(state: EnergyState, now: number = Date.now()): number {
  syncEnergy(state, now);
  if (state.current >= ENERGY_CAP) return 0;
  const missing = ENERGY_CAP - state.current;
  return msUntilNextEnergy(state, now) + (missing - 1) * ENERGY_REFILL_MS;
}

/** Coerces anything loaded from a save into a usable state. */
export function normalizeEnergy(raw: unknown, now: number = Date.now()): EnergyState {
  const candidate = raw as Partial<EnergyState> | undefined;
  if (!candidate || !Number.isFinite(candidate.current) || !Number.isFinite(candidate.lastTickAt)) {
    return createDefaultEnergy(now);
  }
  const state: EnergyState = {
    current: candidate.current!,
    lastTickAt: candidate.lastTickAt!,
    refillPurchases: Number.isFinite(candidate.refillPurchases) ? Math.max(0, Math.floor(candidate.refillPurchases!)) : 0,
    refillPriceResetAt: Number.isFinite(candidate.refillPriceResetAt) ? Math.max(0, candidate.refillPriceResetAt!) : 0
  };
  // A save written in the future (clock change) would otherwise stall the
  // bar forever, since elapsed would stay negative.
  if (state.lastTickAt > now) state.lastTickAt = now;
  energyRefillCost(state, now);
  syncEnergy(state, now);
  return state;
}
