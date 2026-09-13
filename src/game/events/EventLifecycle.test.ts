import { describe, expect, it } from 'vitest';
import { alignEventBoard, createDefaultEventBoardState, normalizeEventBoardState } from './EventBoard';
import { pendingEventRewards, createDefaultTimedEventState, claimMilestone, type TimedEventDef } from './TimedEvents';

describe('event lifecycle', () => {
  it('adopts a legacy board without deleting banked energy', () => {
    const board = createDefaultEventBoardState(); board.energy = 5;
    const next = alignEventBoard(board, 'first');
    expect(next.board.eventId).toBe('first'); expect(next.board.energy).toBe(5);
    expect(next.refund).toBe(0);
  });
  it('refunds once and resets all state when the next event starts', () => {
    const board = createDefaultEventBoardState();
    board.eventId = 'first'; board.energy = 7; board.orders = [8]; board.seenTier = 8; board.overflowPaid = 3;
    const next = alignEventBoard(board, 'second');
    expect(next.refund).toBe(7);
    expect(next.board).toEqual({ ...createDefaultEventBoardState(), eventId: 'second' });
    expect(alignEventBoard(next.board, 'second').refund).toBe(0);
    expect(normalizeEventBoardState(JSON.parse(JSON.stringify(next.board))).eventId).toBe('second');
  });
  it('refunds expiry once without retaining the old board', () => {
    const board = { ...createDefaultEventBoardState(), eventId: 'first', energy: 4 };
    const ended = alignEventBoard(board, null);
    expect(ended.refund).toBe(4); expect(ended.board.eventId).toBeNull();
    expect(alignEventBoard(ended.board, null).refund).toBe(0);
  });
  it('keeps rewards reachable after expiry without allowing duplicate claims', () => {
    const event: TimedEventDef = { id: 'first', title: 'Test', startsAt: 1, endsAt: 10, goal: 1,
      milestones: [{ at: 1, kind: 'gems', amount: 2 }] };
    const state = createDefaultTimedEventState(); state.progress.first = 1;
    expect(pendingEventRewards(state, 9, [event])).toBeNull();
    expect(pendingEventRewards(state, 10, [event])).toBe(event);
    expect(claimMilestone(state, event, 0)).toBe(true);
    expect(pendingEventRewards(state, 11, [event])).toBeNull();
    expect(claimMilestone(state, event, 0)).toBe(false);
  });
});
