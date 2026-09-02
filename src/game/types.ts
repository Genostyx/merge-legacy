export interface TierDef {
  tier: number;
  key: string;       // texture/emoji key
  label: string;
  color: number;      // fallback fill color if no art asset
}

export interface ChainDef {
  typeId: string;
  tiers: TierDef[];
}

export interface GridPosition {
  col: number;
  row: number;
}

export type TileState = 'idle' | 'dragging' | 'merging' | 'spawning';
