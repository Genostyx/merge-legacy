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
   * The player level this opens at.
   *
   * A gate rather than a difficulty knob. The early game hands out energy
   * generously - the tutorial's free taps, the first level rewards, an
   * un-upgraded board that costs little to work - so a brand-new player would
   * clear an event faster than a settled one, which inverts the whole point
   * of a reward track. Absent means level 1.
   */
  minLevel?: number;
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
    minLevel: 5,
    // 140 points, at a point per tier. What a player is DEALT cannot swing
    // this: each slot walks a shuffled bag of its whole band, so two players
    // filling at the same rate meet the same orders in the same number of
    // fills. See `drawEventOrder`.
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
 * Tokens per source tap. THE ONLY SOURCE OF THEM.
 *
 * Completing an order used to pay a guaranteed token as well, and it had to
 * go: order difficulty swings enormously across the game - trivial at level
 * two, substantial at level thirty - so a flat token per order cannot be
 * balanced at both ends. Early on it flooded the event; late on it would
 * barely register. The level gate hid the symptom without fixing the cause.
 *
 * A tap is the one unit of main-board play that means the same thing at every
 * level: it costs energy. Paying against that keeps the two boards linked
 * while making the rate predictable and independent of where the player is.
 *
 * 0.12 is one token per eight or nine taps. At roughly 200 taps a day that is
 * about 24 a day - the same total the two sources used to add up to, now all
 * from the half that behaves.
 */
export const EVENT_TOKENS_PER_TAP = 0.12;

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

/**
 * THE LEVEL AN EVENT ACTUALLY STARTS FOR A PLAYER.
 *
 * A weekly event that runs while the player is still learning the board
 * is a week of the calendar they cannot get back - so below this they
 * SEE what is on and when it ends, and it does not begin for them.
 */
export const EVENT_START_LEVEL = 10;

/**
 * The event this PLAYER is taking part in: open by the clock, and past
 * the level an event starts at.
 *
 * Everything that GRANTS something goes through here rather than
 * `activeEvent`, so the gate cannot be enforced in one place and
 * forgotten in another - tokens dropping for a level-2 player would be
 * its own bug.
 */
export function activeEventFor(
  now: number, level: number, events: readonly TimedEventDef[] = EVENTS
): TimedEventDef | null {
  const event = activeEvent(now, events);
  if (!event) return null;
  if (level < EVENT_START_LEVEL) return null;
  return level >= (event.minLevel ?? 1) ? event : null;
}

/**
 * The event this player can SEE, running or not.
 *
 * Distinct from `activeEventFor` on purpose: a player below the start
 * level gets the chip, the name and the countdown - "this is what an
 * event is, here is when the next one is yours" - and no progress, no
 * tokens and no rewards. Hiding it entirely meant a player met the whole
 * feature for the first time on the day it became theirs.
 */
export function visibleEventFor(
  now: number, events: readonly TimedEventDef[] = EVENTS
): TimedEventDef | null {
  return activeEvent(now, events);
}

/** Whether the player is old enough for an event to run for them. */
export function eventsStartedFor(level: number): boolean {
  return level >= EVENT_START_LEVEL;
}

/** Milliseconds until the event closes. 0 once it has. */
export function eventMsRemaining(event: TimedEventDef, now: number): number {
  return Math.max(0, event.endsAt - now);
}

/**
 * The countdown, as a running clock: `2D 4HR 31:18`.
 *
 * Days and hours are LABELLED and the minutes:seconds are not, because those
 * two are the part that moves - an unlabelled pair of digits ticking reads as
 * a clock without being told. Labelling every field would make the whole
 * thing read as a duration to parse rather than a timer to watch.
 *
 * A zero field is dropped rather than shown: no `0D`, no `0HR`. A leading
 * zero is the one digit that carries no information, and dropping it lets the
 * figures that remain grow as the window closes - the last hour of an event
 * is simply `31:18`.
 */
export function formatEventCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}D`);
  if (hours > 0) parts.push(`${hours}HR`);
  parts.push(`${pad(minutes)}:${pad(seconds)}`);
  return parts.join(' ');
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
