import { describe, expect, it } from 'vitest';
import {
  EVENT_START_LEVEL,
  eventsStartedFor,
  visibleEventFor,
  EVENTS,
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
  it('authors every event with a window that opens before it shuts', () => {
    // Reversed or zero-length windows are the authoring slip that would make
    // an event silently never happen, and nothing else would catch it.
    for (const event of EVENTS) {
      expect(event.endsAt).toBeGreaterThan(event.startsAt);
      expect(event.goal).toBeGreaterThan(0);
      const ats = event.milestones.map((m) => m.at);
      expect([...ats].sort((a, b) => a - b)).toEqual(ats);
      expect(Math.max(...ats)).toBeLessThanOrEqual(event.goal);
    }
  });

  it('never opens two windows across each other', () => {
    const sorted = [...EVENTS].sort((a, b) => a.startsAt - b.startsAt);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startsAt).toBeGreaterThanOrEqual(sorted[i - 1].endsAt);
    }
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
