/**
 * TIMED EVENTS - the spine only.
 *
 * Deliberately inert: `EVENTS` ships empty, nothing imports this yet, and it
 * touches no save, no board and no economy. Adding it changes the running
 * game not at all, which is the point - it is somewhere to build from without
 * a half-finished feature sitting in the player's way.
 *
 * What is decided here, so later work does not have to relitigate it:
 *
 *  - A window is two ABSOLUTE epoch timestamps, never a duration. The daily
 *    claim and the crate restocks already learned this: a remaining-time
 *    field stops counting while the game is closed and restarts on load.
 *  - Events do not overlap. `activeEvent` returns the FIRST match, so if two
 *    windows are ever authored across each other the earlier one wins rather
 *    than the game picking arbitrarily.
 *  - Progress is stored per event id, not as one running number, so an old
 *    event's progress can never be inherited by the next one.
 *
 * The clock caveat this shares with everything else in the project: it reads
 * the device clock, so a player who moves their clock forward can open a
 * window early. See TODO.md's "Time and anti-cheat" - the fix is one clock
 * module for all of it, not a special case here.
 */

export interface TimedEventDef {
  id: string;
  /** Shown to the player. Kept out of the art's way - see the show-don't-tell rule. */
  title: string;
  /** Absolute epoch ms, inclusive. */
  startsAt: number;
  /** Absolute epoch ms, exclusive - the event is over AT this instant. */
  endsAt: number;
  /** What finishing it takes. Meaning is the caller's; the spine only counts. */
  goal: number;
}

/**
 * The authored schedule. EMPTY ON PURPOSE - an event only exists once one is
 * written here, so merging this cannot start anything.
 */
export const EVENTS: readonly TimedEventDef[] = [];

export interface TimedEventState {
  /** Progress by event id. Ids absent from EVENTS are pruned on normalize. */
  progress: Record<string, number>;
  /** Ids whose reward has been taken, so it cannot be taken twice. */
  claimed: string[];
}

export function createDefaultTimedEventState(): TimedEventState {
  return { progress: {}, claimed: [] };
}

/**
 * Rebuilds the state from whatever a save happens to hold.
 *
 * Prunes ids that are no longer authored: a finished event's progress would
 * otherwise sit in every save forever, and an id reused later would inherit
 * it.
 */
export function normalizeTimedEventState(
  raw: Partial<TimedEventState> | undefined,
  events: readonly TimedEventDef[] = EVENTS
): TimedEventState {
  const known = new Set(events.map((event) => event.id));
  const state = createDefaultTimedEventState();
  if (!raw) return state;

  if (raw.progress && typeof raw.progress === 'object') {
    for (const [id, value] of Object.entries(raw.progress)) {
      if (!known.has(id)) continue;
      if (!Number.isFinite(value)) continue;
      state.progress[id] = Math.max(0, Math.floor(value as number));
    }
  }
  if (Array.isArray(raw.claimed)) {
    state.claimed = raw.claimed.filter((id): id is string => typeof id === 'string' && known.has(id));
  }
  return state;
}

/** The event whose window contains `now`, or null. */
export function activeEvent(
  now: number,
  events: readonly TimedEventDef[] = EVENTS
): TimedEventDef | null {
  return events.find((event) => now >= event.startsAt && now < event.endsAt) ?? null;
}

/** Milliseconds until the event closes. 0 once it has. */
export function eventMsRemaining(event: TimedEventDef, now: number): number {
  return Math.max(0, event.endsAt - now);
}

/** Progress recorded so far, capped at the goal. */
export function eventProgress(state: TimedEventState, event: TimedEventDef): number {
  return Math.min(event.goal, state.progress[event.id] ?? 0);
}

/**
 * Adds progress, but ONLY while the window is open. An event that keeps
 * counting after it closes is the bug this exists to make impossible.
 * Returns true when this call completed it.
 */
export function addEventProgress(
  state: TimedEventState,
  event: TimedEventDef,
  amount: number,
  now: number
): boolean {
  if (now < event.startsAt || now >= event.endsAt) return false;
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const before = eventProgress(state, event);
  state.progress[event.id] = Math.min(event.goal, before + Math.floor(amount));
  return before < event.goal && state.progress[event.id] >= event.goal;
}

export function isEventComplete(state: TimedEventState, event: TimedEventDef): boolean {
  return eventProgress(state, event) >= event.goal;
}

export function isEventClaimed(state: TimedEventState, event: TimedEventDef): boolean {
  return state.claimed.includes(event.id);
}

/**
 * Marks the reward taken. Refuses unless the event is complete, and refuses a
 * second time - the caller pays out only when this returns true.
 *
 * Claiming is deliberately allowed AFTER the window closes: a player who
 * finished an event and shut the game before collecting should not lose it.
 */
export function claimEvent(state: TimedEventState, event: TimedEventDef): boolean {
  if (!isEventComplete(state, event) || isEventClaimed(state, event)) return false;
  state.claimed.push(event.id);
  return true;
}
