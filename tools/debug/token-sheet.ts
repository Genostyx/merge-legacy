import { mkdirSync, writeFileSync } from 'node:fs';
import { drawEventToken, EVENT_TOKEN_COLOR } from '../../src/game/objects/EventTokenView';
import { materialLighting } from '../../src/game/ui/Theme';
import { iconSheetRecorder } from './icon-sheet';

/** Dev-only: the event medallion on its own, large, for checking the device. */
export function writeTokenSheet(path = 'tools/debug/out/event-token.svg'): string {
  const g = iconSheetRecorder();
  drawEventToken(g as never, 300, materialLighting(EVENT_TOKEN_COLOR, 6));
  mkdirSync('tools/debug/out', { recursive: true });
  writeFileSync(path,
    `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="-110 -110 220 220">` +
    `<rect x="-110" y="-110" width="220" height="220" fill="#1a1a18"/>` +
    g.out.join('') + '</svg>', 'utf8');
  return path;
}
