import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] || '.rhwp';
const table = readFileSync(join(root, 'rhwp-studio/src/command/commands/table.ts'), 'utf8');
const vite = readFileSync(join(root, 'rhwp-studio/vite.config.ts'), 'utf8');

const required = [
  'equalizeWholeTableGeometry',
  "operationType: axis === 'height' ? 'equalizeWholeTableHeight' : 'equalizeWholeTableWidth'",
  'wasm.resizeTableCells(sec, ppi, ci, updates)',
  "id: 'table:cell-merge'",
  "id: 'table:cell-split'",
  "id: 'table:insert-row-col'",
  "id: 'table:delete-row-col'",
  "id: 'table:create'",
];

for (const marker of required) {
  if (!table.includes(marker)) throw new Error('missing table safety marker: ' + marker);
}
if (table.includes('canExecute: localTableGeometryCanPersist')) {
  throw new Error('legacy non-persistable equalization routing remains');
}
if (vite.includes('VitePWA(') || vite.includes("from 'vite-plugin-pwa'")) {
  throw new Error('embedded Studio still contains PWA/service worker plugin');
}

console.log('Table safety patch verification passed.');
