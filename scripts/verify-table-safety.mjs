import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] || '.rhwp';
const table = readFileSync(join(root, 'rhwp-studio/src/command/commands/table.ts'), 'utf8');
const vite = readFileSync(join(root, 'rhwp-studio/vite.config.ts'), 'utf8');

const required = [
  'webHwpEqualizeSelectedGrid',
  'webHwpCanonicalUnits',
  'equalizeSelectedTableRowsPersisted',
  'equalizeSelectedTableColumnsPersisted',
  "canExecute: hasMultiCellSelection",
  "id: 'table:cell-merge'",
  "id: 'table:cell-split'",
  "id: 'table:insert-row-col'",
  "id: 'table:delete-row-col'",
  "id: 'table:create'",
  'wasm.resizeTableCells(sec, ppi, ci, updates)',
];

for (const marker of required) {
  if (!table.includes(marker)) throw new Error('missing table safety marker: ' + marker);
}

const equalStart = table.indexOf("id: 'table:cell-height-equal'");
const equalEnd = table.indexOf("id: 'table:formula'", equalStart);
if (equalStart < 0 || equalEnd < 0) throw new Error('equalization command block missing');
const equalBlock = table.slice(equalStart, equalEnd);

if (equalBlock.includes('localResize: true')) {
  throw new Error('renderer-local equalization must not be used by v0.5.2');
}
if (!equalBlock.includes("webHwpEqualizeSelectedGrid(services, 'height')") ||
    !equalBlock.includes("webHwpEqualizeSelectedGrid(services, 'width')")) {
  throw new Error('persisted equalization command wiring missing');
}

const mergeStart = table.indexOf("id: 'table:cell-merge'");
const mergeEnd = table.indexOf("id: 'table:transpose-copy'", mergeStart);
const mergeBlock = table.slice(mergeStart, mergeEnd);
if (!mergeBlock.includes('canExecute: hasMultiCellSelection') ||
    !mergeBlock.includes('hasNonRectangularCellSelection(ih)')) {
  throw new Error('merge selection safety guards missing');
}

const splitStart = table.indexOf("id: 'table:cell-split'");
const splitEnd = table.indexOf("id: 'table:cell-merge'", splitStart);
const splitBlock = table.slice(splitStart, splitEnd);
if (!splitBlock.includes('hasNonRectangularCellSelection(ih)')) {
  throw new Error('split non-rectangular guard missing');
}

if (vite.includes('VitePWA(') || vite.includes("from 'vite-plugin-pwa'")) {
  throw new Error('embedded Studio still contains PWA/service worker plugin');
}

console.log('Web HWP Editor v0.5.2 table safety verification passed.');
