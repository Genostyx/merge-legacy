import type { CrateTier } from '../rewards/Rewards';
/**
 * TIMED EVENTS - the spine only.
 *
 * What is decided here, so later work does not have to relitigate it:
 *
 *  - A window is two ABSOLUTE epoch timestamps, never a duration. The daily
 *    claim and the crate restocks already learned this: a remaining-time
 *    field stops counting while the game is closed and restarts on load.
 *  - Those timestamps are DERIVED FROM THE WEEK rather than authored, so the
 *    event recurs forever and cannot lapse. See `eventsInPlay`.
 *  - Events do not overlap. `activeEvent` returns the FIRST match, so if two
 *    windows ever cross, the earlier one wins rather than the game picking
 *    arbitrarily.
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
 * THE WEEK IS THE EVENT. Nothing here is authored with a date.
 *
 * A hand-written window is a thing that expires: `verdigris-1` ran for
 * three days in September and then the feature went dark, with the whole
 * spine still built and nothing left for it to show. Every merge game in
 * the genre runs its event on a repeating weekly reset instead, and that
 * is what this is - the window is computed from the clock, so there is no
 * schedule to keep topped up and no way for the game to run out of event.
 *
 * MONDAY 00:00 UTC, which is where the genre has settled, and where the
 * week starts on the calendar the player already has.
 *
 * UTC rather than local: an event is the same event for everybody, and a
 * local reset would hand one timezone a head start on a track they are
 * implicitly compared against.
 */
export const EVENT_WEEK_MS = 7 * 86_400_000;

/**
 * One week's event, before it knows which week it is.
 *
 * The rotation is a LIST so a second event can be added without touching
 * anything else. With one entry the same event returns every week, which
 * is the intended state rather than a placeholder: the weekly slot is one
 * recurring event whose contents reroll, and the contents come from the
 * order bags, not from this table.
 */
export interface TimedEventTemplate {
  /** Stable across weeks. The dated id is built from this. */
  slug: string;
  title: string;
  minLevel?: number;
  goal: number;
  milestones: EventMilestone[];
}

export const EVENT_ROTATION: readonly TimedEventTemplate[] = [
  {
    slug: 'verdigris',
    title: 'Verdigris',
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

/** Monday 00:00 UTC of the week containing `now`. */
export function eventWeekStart(now: number): number {
  const at = new Date(now);
  // getUTCDay is 0 on Sunday, so shift it to put Monday at zero.
  const sinceMonday = (at.getUTCDay() + 6) % 7;
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
    - sinceMonday * 86_400_000;
}

/**
 * The event for one week, its id stamped with that week's Monday.
 *
 * THE DATE IN THE ID is what resets progress, with no resetting code
 * anywhere: progress and claimed rungs are both keyed by event id, so a
 * new week is simply an id nothing has been recorded against. It also
 * makes it impossible for one week's rewards to be inherited by the next,
 * which is the mistake a single running counter eventually makes.
 */
export function eventForWeek(weekStart: number): TimedEventDef {
  const template = EVENT_ROTATION[
    Math.floor(weekStart / EVENT_WEEK_MS) % EVENT_ROTATION.length
  ];
  return {
    id: `${template.slug}-${new Date(weekStart).toISOString().slice(0, 10)}`,
    title: template.title,
    startsAt: weekStart,
    endsAt: weekStart + EVENT_WEEK_MS,
    minLevel: template.minLevel,
    goal: template.goal,
    milestones: template.milestones
  };
}

/**
 * The weeks that still matter: the one running, and the one before it.
 *
 * LAST WEEK IS KEPT deliberately. Rungs stay claimable after their window
 * shuts - see `claimMilestone` - and `normalizeTimedEventState` prunes any
 * id this does not list, so dropping last week would delete rewards earned
 * on Sunday night from a player who next opens the game on Monday. One
 * week of grace, then it goes.
 */
export function eventsInPlay(now: number = Date.now()): readonly TimedEventDef[] {
  const week = eventWeekStart(now);
  return [eventForWeek(week - EVENT_WEEK_MS), eventForWeek(week)];
}

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
  /** Progress by event id. Ids no longer in play are pruned on normalize. */
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
  events: readonly TimedEventDef[] = eventsInPlay()
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
  events: readonly TimedEventDef[] = eventsInPlay(now)
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
  now: number, level: number, events: readonly TimedEventDef[] = eventsInPlay(now)
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
  now: number, events: readonly TimedEventDef[] = eventsInPlay(now)
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

/** Keeps earned rungs reachable after their playable window closes. */
export function pendingEventRewards(
  state: TimedEventState, now: number, events = eventsInPlay(now)
): TimedEventDef | null {
  return [...events].reverse().find((event) => now >= event.endsAt
    && unclaimedMilestones(state, event).length > 0) ?? null;
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
