/** A boundary wall occludes the interior when the camera is on its outer side. */
export function wallOccludes(axis: 'x' | 'z', offset: number, azimuth: number): boolean {
  return offset * (axis === 'x' ? Math.sin(azimuth) : Math.cos(azimuth)) > 0.001;
}
