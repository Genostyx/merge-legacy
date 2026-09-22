import { describe, expect, it } from 'vitest';
import {
  EVENT_START_LEVEL,
  eventsStartedFor,
  visibleEventFor,
  eventsInPlay,
  eventWeekStart,
  eventForWeek,
  EVENT_WEEK_MS,
  activeEvent,
  activeEventFor,
  addEventProgress,
  claimMilestone,
  createDefaultTimedEventState,
  eventMsRemaining,
  formatEventCountdown,
  isMilestoneClaimed,
  isEventComplete,
  normalizeTimedEventState,
  unclaimedMilestones,
  type TimedEventDef
} from './TimedEvents';

const HOUR = 3_600_000;
const evt = (over: Partial<TimedEventDef> = {}): TimedEventDef => ({
  id: 'test-event', title: 'Test', startsAt: 1000, endsAt: 1000 + HOUR, goal: 3,
  milestones: [
    { at: 1, kind: 'gems', amount: 5 },
    { at: 3, kind: 'crate', tier: 'bronze' }
  ],
  ...over
});

describe('timed events', () => {
  it('builds every week with a window that opens before it shuts', () => {
    // Reversed or zero-length windows are the authoring slip that would make
    // an event silently never happen, and nothing else would catch it.
    for (const event of eventsInPlay(Date.UTC(2026, 8, 19))) {
      expect(event.endsAt).toBeGreaterThan(event.startsAt);
      expect(event.goal).toBeGreaterThan(0);
      const ats = event.milestones.map((m: { at: number }) => m.at);
      expect([...ats].sort((a, b) => a - b)).toEqual(ats);
      expect(Math.max(...ats)).toBeLessThanOrEqual(event.goal);
    }
  });

  it('never opens two windows across each other', () => {
    const sorted = [...eventsInPlay(Date.UTC(2026, 8, 19))]
      .sort((a, b) => a.startsAt - b.startsAt);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startsAt).toBeGreaterThanOrEqual(sorted[i - 1].endsAt);
    }
  });

  it('starts the week on Monday 00:00 UTC, whatever day it is asked', () => {
    // 2026-09-14 is a Monday. Every instant from it up to the next Monday
    // has to resolve to it, including the last millisecond.
    const monday = Date.UTC(2026, 8, 14);
    expect(eventWeekStart(monday)).toBe(monday);
    expect(eventWeekStart(monday + EVENT_WEEK_MS - 1)).toBe(monday);
    expect(eventWeekStart(monday + EVENT_WEEK_MS)).toBe(monday + EVENT_WEEK_MS);
    // Sunday is the END of the week, not the start - the off-by-one that
    // `getUTCDay` returning 0 for Sunday invites.
    expect(new Date(monday + 6 * 86_400_000).getUTCDay()).toBe(0);
    expect(eventWeekStart(monday + 6 * 86_400_000)).toBe(monday);
  });

  it('tiles the weeks edge to edge and gives each its own id', () => {
    const monday = Date.UTC(2026, 8, 14);
    const thisWeek = eventForWeek(monday);
    const nextWeek = eventForWeek(monday + EVENT_WEEK_MS);
    expect(thisWeek.endsAt).toBe(nextWeek.startsAt);
    // Different ids are the whole reset mechanism: progress is keyed by id,
    // so a shared one would carry last week's points into this week.
    expect(thisWeek.id).not.toBe(nextWeek.id);
    expect(thisWeek.id).toBe('verdigris-2026-09-14');
  });

  it('never runs out of event, however far ahead the clock is', () => {
    for (const year of [2026, 2030, 2040]) {
      const event = eventsInPlay(Date.UTC(year, 5, 17))[1];
      expect(event.startsAt).toBeLessThanOrEqual(Date.UTC(year, 5, 17));
      expect(event.endsAt).toBeGreaterThan(Date.UTC(year, 5, 17));
    }
  });

  it('keeps last week so its earned rungs can still be claimed', () => {
    // A rung reached on Sunday night, opened on Monday: the window has shut
    // and normalize must not have pruned the id out from under it.
    const monday = Date.UTC(2026, 8, 14);
    const lastWeek = eventForWeek(monday - EVENT_WEEK_MS);
    const state = createDefaultTimedEventState();
    state.progress[lastWeek.id] = lastWeek.goal;
    const restored = normalizeTimedEventState(state, eventsInPlay(monday));
    expect(restored.progress[lastWeek.id]).toBe(lastWeek.goal);
    expect(unclaimedMilestones(restored, lastWeek).length)
      .toBe(lastWeek.milestones.length);
    // Two weeks on it is gone, so a save cannot accumulate them forever.
    const later = normalizeTimedEventState(state, eventsInPlay(monday + EVENT_WEEK_MS));
    expect(later.progress[lastWeek.id]).toBeUndefined();
  });

  it('counts down as a running clock, and stops at zero', () => {
    expect(formatEventCountdown(0)).toBe('00:00');
    expect(formatEventCountdown(-5000)).toBe('00:00');
    expect(formatEventCountdown(9_000)).toBe('00:09');
    expect(formatEventCountdown(HOUR * 52 + 90_000)).toBe('2D 4HR 01:30');
    expect(formatEventCountdown(HOUR + 61_000)).toBe('1HR 01:01');
    // Zero fields are DROPPED, never shown as 0D or 0HR.
    expect(formatEventCountdown(HOUR * 48 + 90_000)).toBe('2D 01:30');
    expect(formatEventCountdown(59 * 60_000 + 9_000)).toBe('59:09');
  });

  it('opens on its start and is over AT its end, not after', () => {
    const e = evt();
    const list = [e];
    expect(activeEvent(999, list)).toBeNull();
    expect(activeEvent(1000, list)).toBe(e);
    expect(activeEvent(1000 + HOUR - 1, list)).toBe(e);
    expect(activeEvent(1000 + HOUR, list)).toBeNull();
    expect(eventMsRemaining(e, 1000 + HOUR + 5)).toBe(0);
  });

  it('does not start for a player below the start level', () => {
    // The early game hands out energy generously, so a brand-new player would
    // clear an event faster than a settled one - which inverts the point of a
    // reward track. A weekly event running while they are still learning the
    // board is also a week of the calendar they cannot get back.
    const e = evt({ minLevel: 5 });
    const list = [e];
    expect(activeEventFor(2000, 4, list)).toBeNull();
    // Past the event's OWN gate but not the global one.
    expect(activeEventFor(2000, 5, list)).toBeNull();
    expect(activeEventFor(2000, EVENT_START_LEVEL, list)).toBe(e);
    // The clock still has the final say.
    expect(activeEventFor(999, 99, list)).toBeNull();
    // An event with no gate of its own still waits for the start level.
    expect(activeEventFor(2000, 1, [evt()])).toBeNull();
    expect(activeEventFor(2000, EVENT_START_LEVEL, [evt()])).not.toBeNull();
  });

  it('is visible before it starts, so the player meets it first', () => {
    // Seeing what is on and when it ends is the whole point of the gate
    // being a start level rather than a hidden feature: a player should
    // not meet events for the first time on the day they become theirs.
    const e = evt({ minLevel: 5 });
    expect(visibleEventFor(2000, [e])).toBe(e);
    expect(eventsStartedFor(EVENT_START_LEVEL - 1)).toBe(false);
    expect(eventsStartedFor(EVENT_START_LEVEL)).toBe(true);
    // The clock still governs what is visible.
    expect(visibleEventFor(999, [e])).toBeNull();
  });

  it('refuses progress outside the window', () => {
    const e = evt();
    const state = createDefaultTimedEventState();
    expect(addEventProgress(state, e, 1, 999)).toBe(false);
    expect(addEventProgress(state, e, 1, 1000 + HOUR)).toBe(false);
    expect(state.progress[e.id]).toBeUndefined();
  });

  it('reports completion exactly once, and caps at the goal', () => {
    const e = evt();
    const state = createDefaultTimedEventState();
    expect(addEventProgress(state, e, 2, 2000)).toBe(false);
    expect(addEventProgress(state, e, 5, 2000)).toBe(true);   // crosses the goal
    expect(addEventProgress(state, e, 5, 2000)).toBe(false);  // already complete
    expect(state.progress[e.id]).toBe(e.goal);
  });

  it('pays a rung after the window shuts, but only once', () => {
    // A rung reached inside the window survives it. The player earned it, and
    // losing it to the clock is the version of this that people resent.
    const e = evt();
    const state = createDefaultTimedEventState();
    addEventProgress(state, e, 3, 2000);
    expect(claimMilestone(state, e, 1)).toBe(true);
    expect(claimMilestone(state, e, 1)).toBe(false);
    expect(isMilestoneClaimed(state, e, 1)).toBe(true);
  });

  it('will not pay a rung that has not been reached', () => {
    const e = evt();
    const state = createDefaultTimedEventState();
    addEventProgress(state, e, 1, 2000);
    expect(claimMilestone(state, e, 0)).toBe(true);   // at 1, reached
    expect(claimMilestone(state, e, 1)).toBe(false);  // at 3, not reached
  });

  it('lists every reached rung that is still owed', () => {
    const e = evt();
    const state = createDefaultTimedEventState();
    addEventProgress(state, e, 3, 2000);
    expect(unclaimedMilestones(state, e).map((m) => m.index)).toEqual([0, 1]);
    claimMilestone(state, e, 0);
    expect(unclaimedMilestones(state, e).map((m) => m.index)).toEqual([1]);
  });

  it('prunes ids that are no longer authored', () => {
    // Otherwise a finished event's progress rides in every save forever, and
    // an id reused later inherits it.
    const state = normalizeTimedEventState(
      { progress: { 'test-event': 2, 'old-event': 9 }, claimed: ['old-event:0', 'test-event:1'] },
      [evt()]
    );
    expect(state.progress).toEqual({ 'test-event': 2 });
    expect(state.claimed).toEqual(['test-event:1']);
  });

  it('survives junk in a save', () => {
    const state = normalizeTimedEventState(
      { progress: { 'test-event': Number.NaN } as unknown as Record<string, number>, claimed: [1 as unknown as string] },
      [evt()]
    );
    expect(state).toEqual({ progress: {}, claimed: [] });
    expect(normalizeTimedEventState(undefined)).toEqual({ progress: {}, claimed: [] });
  });
});
