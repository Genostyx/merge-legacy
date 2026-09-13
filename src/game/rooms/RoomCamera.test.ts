import { describe, expect, it, vi } from 'vitest';
import { RoomView3D } from './RoomView3D';
import { wallOccludes } from './WallCutaway';

describe('room camera', () => {
  it('cancels a pending snap when a new orbit starts', () => {
    const frames = new Map<number, FrameRequestCallback>(); let id = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => frames.delete(handle));
    try {
      const view = Object.create(RoomView3D.prototype);
      Object.assign(view, { disposed: false, azimuth: 0.9, settleFrame: null, render: vi.fn() });
      view.settleRotation(); expect(frames.size).toBe(1);
      view.orbitBy(10, 0); expect(frames.size).toBe(0);
      const azimuth = view.azimuth;
      for (const callback of frames.values()) callback(performance.now() + 220);
      expect(view.azimuth).toBe(azimuth);
    } finally { vi.unstubAllGlobals(); }
  });
  it('changes the occluding boundary walls for every quarter turn', () => {
    const faces = [['x', 1], ['x', -1], ['z', 1], ['z', -1]] as const;
    for (let turn = 0; turn < 4; turn++) {
      const angle = Math.PI / 4 + turn * Math.PI / 2;
      const hidden = faces.filter(([axis, offset]) => wallOccludes(axis, offset, angle));
      expect(hidden).toHaveLength(2);
      expect(hidden).not.toEqual(faces.filter(([axis, offset]) => wallOccludes(axis, offset, angle + Math.PI / 2)));
    }
  });
});
