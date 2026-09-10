import { mkdirSync, writeFileSync } from 'node:fs';
import { drawEventToken, EVENT_TOKEN_COLOR } from '../../src/game/objects/EventTokenView';
import { materialLighting } from '../../src/game/ui/Theme';
import { iconSheetRecorder } from './icon-sheet';

/**
 * The event medallion at the sizes it is ACTUALLY drawn, side by side.
 *
 * A single large render is how the crown's detail got approved twice and
 * failed on the board twice: at 300px every ray and every shade is obvious,
 * and at a 74px cell it is a teal disc with a smudge on it. The small
 * renders are the ones that matter - the big one is only there to show what
 * was intended.
 *
 * Rendered at cell size, then scaled up for viewing, so a feature that
 * vanishes at 74px vanishes here too instead of being quietly rescued by the
 * viewer's zoom.
 */
const SIZES = [74, 52, 40];
const VIEW = 200;

export function writeTokenSheet(path = 'tools/debug/out/event-token.svg'): string {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW * (SIZES.length + 1)}" height="${VIEW + 22}">`,
    `<rect width="100%" height="100%" fill="#1a1a18"/>`
  ];

  SIZES.forEach((size, i) => {
    const g = iconSheetRecorder();
    drawEventToken(g as never, size, materialLighting(EVENT_TOKEN_COLOR, 6));
    // Drawn at its real size inside a box, then the whole box is magnified -
    // so what is lost to a small render stays lost.
    const k = VIEW / size;
    parts.push(
      `<g transform="translate(${i * VIEW + VIEW / 2} ${VIEW / 2}) scale(${k})">${g.out.join('')}</g>`,
      `<text x="${i * VIEW + VIEW / 2}" y="${VIEW + 14}" fill="#8a8a86" font-size="12" ` +
      `font-family="monospace" text-anchor="middle">${size}px (x${k.toFixed(1)})</text>`
    );
  });

  // ...and one true-size row, unmagnified, at the far right.
  SIZES.forEach((size, i) => {
    const g = iconSheetRecorder();
    drawEventToken(g as never, size, materialLighting(EVENT_TOKEN_COLOR, 6));
    parts.push(
      `<g transform="translate(${SIZES.length * VIEW + VIEW / 2} ${40 + i * 60})">${g.out.join('')}</g>`
    );
  });
  parts.push(
    `<text x="${SIZES.length * VIEW + VIEW / 2}" y="${VIEW + 14}" fill="#8a8a86" font-size="12" ` +
    `font-family="monospace" text-anchor="middle">true size</text>`,
    '</svg>'
  );

  mkdirSync('tools/debug/out', { recursive: true });
  writeFileSync(path, parts.join(String.fromCharCode(10)), 'utf8');
  return path;
}
