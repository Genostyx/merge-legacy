import type { CrateTier } from '../rewards/Rewards';
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
  /**
   * The reward rungs, in ascending order of `at`. Each is claimed on its own -
   * a track of four small payouts keeps a player checking back, where one
   * payout at the end only rewards finishing.
   */
  milestones: EventMilestone[];
}

export type EventMilestone =
  | { at: number; kind: 'crate'; tier: CrateTier }
  | { at: number; kind: 'gems'; amount: number };

/**
 * The authored schedule. An event exists only while its own window contains
 * the clock, so a past entry is inert without being deleted - which is what
 * keeps its claimed rungs meaningful in a save (see `normalizeTimedEventState`,
 * which prunes only ids that are gone from this list entirely).
 */
export const EVENTS: readonly TimedEventDef[] = [
  {
    id: 'verdigris-1',
    title: 'Verdigris',
    // Absolute, and deliberately short. A three-day window is the length the
    // genre has settled on: long enough that one missed evening does not lose
    // it, short enough that the track still reads as something to finish.
    startsAt: Date.UTC(2026, 8, 10),
    endsAt: Date.UTC(2026, 8, 13),
    // 140 points, against a LINEAR payout of two a tier.
    //
    // Three days of ordinary main-board play buys roughly 70 taps of event
    // energy, and the opening crust is worth about 60 items more once
    // cleared. Spread across the three order bands that lands a little over
    // 140, so the last rung is reachable without playing unusually hard.
    //
    // Stated plainly because it is a real consequence: a player who only ever
    // fills the easy slot beats that comfortably, since the payout does not
    // keep pace with the doubling merge cost. The bands cap how much of the
    // board that strategy can use, they do not forbid it.
    goal: 140,
    // Five rungs, front-loaded. The first lands inside a single session, so a
    // player learns what the board is for before deciding whether to chase
    // the rest; only the last needs the full window.
    milestones: [
      { at: 15, kind: 'crate', tier: 'bronze' },
      { at: 35, kind: 'gems', amount: 10 },
      { at: 65, kind: 'crate', tier: 'silver' },
      { at: 100, kind: 'gems', amount: 20 },
      { at: 140, kind: 'crate', tier: 'gold' }
    ]
  }
];

/**
 * Tokens per source tap, and per order completed.
 *
 * Aimed at a typical player reaching the top rung inside the window without
 * having to play unusually hard for it. At roughly 200 taps and 8 orders a day
 * that is around 18 tokens a day, so 100 lands late on the third day - which
 * is where a top rung should sit: reachable, but not before the event is over.
 */
export const EVENT_TOKENS_PER_TAP = 0.08;
export const EVENT_TOKENS_PER_ORDER = 1;

export interface TimedEventState {
  /** Progress by event id. Ids absent from EVENTS are pruned on normalize. */
  progress: Record<string, number>;
  /**
   * Rungs already taken, as `<eventId>:<milestone index>`.
   *
   * Per RUNG rather than per event, because the track pays four times and a
   * single flag could not tell which of them had been collected. Kept after
   * the window shuts so a rung earned inside it can still be claimed - the
   * player earned it, and losing it to the clock would be the version of this
   * that people resent.
   */
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
    state.claimed = raw.claimed.filter((key): key is string =>
      typeof key === 'string' && known.has(key.split(':')[0]));
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

/**
 * The countdown, as a running clock: `HH:MM:SS`.
 *
 * Days are rolled into the HOURS field rather than shown separately. A
 * "2d 4h" reading tells a player nothing is happening for hours and is worth
 * no second glance; a clock that moves every second says the window is
 * actually closing, which is the entire job of an event timer. Rolling the
 * days in also keeps it to eight characters, so the same string fits the chip
 * in the order row and the panel header without two formats to keep in step.
 */
export function formatEventCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
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

/** Every rung the player has reached and not yet taken, lowest first. */
export function unclaimedMilestones(
  state: TimedEventState, event: TimedEventDef
): { index: number; milestone: EventMilestone }[] {
  const points = eventProgress(state, event);
  return event.milestones
    .map((milestone, index) => ({ index, milestone }))
    .filter(({ index, milestone }) =>
      points >= milestone.at && !isMilestoneClaimed(state, event, index));
}

export function isMilestoneClaimed(
  state: TimedEventState, event: TimedEventDef, index: number
): boolean {
  return state.claimed.includes(`${event.id}:${index}`);
}

/**
 * Marks one rung taken. Refuses a rung not yet reached, and refuses a second
 * take - the caller pays out only when this returns true.
 *
 * Deliberately does NOT check the window. A rung reached inside it can still
 * be collected afterwards: the player earned it, and losing it to the clock is
 * the version of this that people resent.
 */
export function claimMilestone(
  state: TimedEventState, event: TimedEventDef, index: number
): boolean {
  const milestone = event.milestones[index];
  if (!milestone) return false;
  if (eventProgress(state, event) < milestone.at) return false;
  if (isMilestoneClaimed(state, event, index)) return false;
  state.claimed.push(`${event.id}:${index}`);
  return true;
}
