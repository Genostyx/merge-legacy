export interface LegacyMachineState {
  gearOneLevel: number;
  turns: number[];
  claimed: number[][];
}

export type LegacyReward =
  | { kind: 'credits'; amount: number }
  | { kind: 'gems'; amount: number }
  | { kind: 'energy'; amount: number };

export const LEGACY_GEARS = 5;
export const LEGACY_GEAR_RATIO = 10;
export const LEGACY_MILESTONES = [1, 3, 10, 25, 50];

export function createDefaultLegacyMachine(): LegacyMachineState {
  return {
    gearOneLevel: 0,
    turns: Array.from({ length: LEGACY_GEARS }, () => 0),
    claimed: Array.from({ length: LEGACY_GEARS }, () => [])
  };
}

export function normalizeLegacyMachine(raw: unknown): LegacyMachineState {
  const state = createDefaultLegacyMachine();
  const candidate = raw as Partial<LegacyMachineState> | undefined;
  if (!candidate || typeof candidate !== 'object') return state;
  state.gearOneLevel = Number.isFinite(candidate.gearOneLevel)
    ? Math.max(0, Math.floor(candidate.gearOneLevel!))
    : 0;
  if (Array.isArray(candidate.turns)) {
    candidate.turns.slice(0, LEGACY_GEARS).forEach((turns, i) => {
      if (Number.isFinite(turns)) state.turns[i] = Math.max(0, turns as number);
    });
  }
  if (Array.isArray(candidate.claimed)) {
    candidate.claimed.slice(0, LEGACY_GEARS).forEach((claimed, i) => {
      if (!Array.isArray(claimed)) return;
      state.claimed[i] = claimed
        .filter((value): value is number => Number.isFinite(value))
        .map((value) => Math.max(0, Math.floor(value)));
    });
  }
  return state;
}

export function legacySpeed(state: LegacyMachineState): number {
  return 1 + state.gearOneLevel * 0.2;
}

export function legacyUpgradeCost(level: number): { credits: number; gems: number; energy: number } {
  return {
    credits: Math.round(250 * (level + 1) * (1 + level * 0.45)),
    gems: 4 + level * 2,
    energy: 10 + level * 5
  };
}

export function addLegacyMomentum(state: LegacyMachineState, baseTurns: number): void {
  state.turns[0] += baseTurns * legacySpeed(state);
  for (let i = 1; i < LEGACY_GEARS; i++) {
    state.turns[i] = state.turns[i - 1] / LEGACY_GEAR_RATIO;
  }
}

export function projectStageLegacyMomentum(stage: number): number {
  return [4, 7, 12, 20, 32][Math.max(0, Math.min(4, stage - 1))] ?? 4;
}

export function legacyReward(gear: number, milestone: number): LegacyReward {
  if (gear === 0) return { kind: 'credits', amount: 120 * milestone };
  if (gear === 1) return milestone >= 10 ? { kind: 'gems', amount: 2 + Math.floor(milestone / 10) } : { kind: 'energy', amount: 10 * milestone };
  if (gear === 2) return { kind: 'credits', amount: 900 * milestone };
  if (gear === 3) return { kind: 'gems', amount: 5 + Math.floor(milestone / 5) };
  return { kind: 'energy', amount: 50 + milestone * 5 };
}

export function claimableLegacyMilestones(state: LegacyMachineState): Array<{ gear: number; milestone: number; reward: LegacyReward }> {
  const claims: Array<{ gear: number; milestone: number; reward: LegacyReward }> = [];
  for (let gear = 0; gear < LEGACY_GEARS; gear++) {
    for (const milestone of LEGACY_MILESTONES) {
      if (state.turns[gear] < milestone || state.claimed[gear].includes(milestone)) continue;
      claims.push({ gear, milestone, reward: legacyReward(gear, milestone) });
    }
  }
  return claims;
}

export function markLegacyClaimed(state: LegacyMachineState, gear: number, milestone: number): void {
  if (!state.claimed[gear].includes(milestone)) state.claimed[gear].push(milestone);
}
