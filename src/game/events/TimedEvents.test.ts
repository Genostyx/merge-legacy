import { describe, expect, it } from 'vitest';
import {
  EVENTS,
  activeEvent,
  addEventProgress,
  claimEvent,
  createDefaultTimedEventState,
  eventMsRemaining,
  isEventClaimed,
  isEventComplete,
  normalizeTimedEventState,
  type TimedEventDef
} from './TimedEvents';

const HOUR = 3_600_000;
const evt = (over: Partial<TimedEventDef> = {}): TimedEventDef => ({
  id: 'test-event', title: 'Test', startsAt: 1000, endsAt: 1000 + HOUR, goal: 3, ...over
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

  it('pays a finished event even after its window shuts, but only once', () => {
    const e = evt();
    const state = createDefaultTimedEventState();
    addEventProgress(state, e, 3, 2000);
    expect(isEventComplete(state, e)).toBe(true);
    expect(claimEvent(state, e)).toBe(true);
    expect(claimEvent(state, e)).toBe(false);
    expect(isEventClaimed(state, e)).toBe(true);
  });

  it('will not pay an unfinished event', () => {
    const e = evt();
    const state = createDefaultTimedEventState();
    addEventProgress(state, e, 1, 2000);
    expect(claimEvent(state, e)).toBe(false);
  });

  it('prunes ids that are no longer authored', () => {
    // Otherwise a finished event's progress rides in every save forever, and
    // an id reused later inherits it.
    const state = normalizeTimedEventState(
      { progress: { 'test-event': 2, 'old-event': 9 }, claimed: ['old-event'] },
      [evt()]
    );
    expect(state.progress).toEqual({ 'test-event': 2 });
    expect(state.claimed).toEqual([]);
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
