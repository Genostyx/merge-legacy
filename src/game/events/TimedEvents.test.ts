import { describe, expect, it } from 'vitest';
import {
  EVENTS,
  activeEvent,
  addEventProgress,
  claimMilestone,
  createDefaultTimedEventState,
  eventMsRemaining,
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
  it('ships with no event authored, so merging it starts nothing', () => {
    expect(EVENTS).toHaveLength(0);
    expect(activeEvent(Date.now())).toBeNull();
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
