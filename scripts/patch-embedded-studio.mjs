import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] || '.rhwp';

function patchEmbeddedVite() {
  const file = join(root, 'rhwp-studio', 'vite.config.ts');
  let source = readFileSync(file, 'utf8');

  source = source.replace("import { VitePWA } from 'vite-plugin-pwa';\n", '');

  const startMarker = '    VitePWA({';
  const endMarker = [
    '      devOptions: {',
    '        enabled: false,',
    '      },',
    '    }),',
  ].join('\n');

  const start = source.indexOf(startMarker);
  if (start < 0) {
    throw new Error('VitePWA start marker not found');
  }
  const endStart = source.indexOf(endMarker, start);
  if (endStart < 0) {
    throw new Error('VitePWA end marker not found');
  }
  const end = endStart + endMarker.length;
  source = source.slice(0, start) + source.slice(end);

  if (source.includes('VitePWA(') || source.includes("from 'vite-plugin-pwa'")) {
    throw new Error('embedded Studio PWA removal incomplete');
  }
  writeFileSync(file, source);
}

function patchSafeEqualization() {
  const file = join(root, 'rhwp-studio', 'src', 'command', 'commands', 'table.ts');
  let source = readFileSync(file, 'utf8');

  const disabledBlocks = `  {
    id: 'table:cell-height-equal',
    label: t('command.table.cellHeightEqual.label'),
    shortcutLabel: 'H',
    canExecute: localTableGeometryCanPersist,
    execute() {},
  },
  {
    id: 'table:cell-width-equal',
    label: t('command.table.cellWidthEqual.label'),
    shortcutLabel: 'W',
    canExecute: localTableGeometryCanPersist,
    execute() {},
  },`;

  if (!source.includes(disabledBlocks)) {
    throw new Error('disabled equalization command block not found');
  }

  const helper = `
/**
 * Web HWP Editor safe equalization.
 *
 * HWP/HWPX cannot persist arbitrary per-row/per-column local geometry.
 * We therefore only perform WHOLE-TABLE equalization and update every cell,
 * including merged cells, from one canonical row/column grid.
 *
 * The merged-cell dimension is always the sum of the rows/columns it spans.
 * This prevents the classic mismatch:
 *   equalize rows -> merge vertical cells -> merged cell bottom drifts.
 */
function distributeWhole(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  let remainder = total - base * count;
  return Array.from({ length: count }, () => {
    const value = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return value;
  });
}

function equalizeWholeTableGeometry(
  services: CommandServices,
  axis: 'height' | 'width',
): void {
  const ctx = currentTableCellContext(services);
  if (!ctx) return;

  const { ih, pos } = ctx;
  if ((pos.cellPath?.length ?? 0) > 1) {
    console.warn('[table equalize] nested tables are not modified by the safe whole-table path');
    return;
  }

  const sec = pos.sectionIndex;
  const ppi = pos.parentParaIndex!;
  const ci = pos.controlIndex!;
  const dims = services.wasm.getTableDimensions(sec, ppi, ci);
  if (dims.rowCount <= 0 || dims.colCount <= 0 || dims.cellCount <= 0) return;

  const cells = Array.from({ length: dims.cellCount }, (_, cellIdx) => {
    const info = services.wasm.getCellInfo(sec, ppi, ci, cellIdx);
    const props = services.wasm.getCellProperties(sec, ppi, ci, cellIdx);
    return {
      cellIdx,
      row: info.row,
      col: info.col,
      rowSpan: Math.max(1, info.rowSpan),
      colSpan: Math.max(1, info.colSpan),
      width: Number(props.width ?? 0),
      height: Number(props.height ?? 0),
    };
  });

  const unitCount = axis === 'height' ? dims.rowCount : dims.colCount;
  const baseUnits = Array<number>(unitCount).fill(0);

  for (const cell of cells) {
    const span = axis === 'height' ? cell.rowSpan : cell.colSpan;
    if (span !== 1) continue;
    const index = axis === 'height' ? cell.row : cell.col;
    const value = axis === 'height' ? cell.height : cell.width;
    if (index >= 0 && index < baseUnits.length && value > baseUnits[index]) {
      baseUnits[index] = value;
    }
  }

  // A row/column covered only by merged cells has no trustworthy independent
  // persisted size. Fail closed instead of manufacturing geometry.
  if (baseUnits.some((value) => value <= 0)) {
    console.warn('[table equalize] skipped: a grid unit has no persisted single-span size', baseUnits);
    return;
  }

  const targetUnits = distributeWhole(
    baseUnits.reduce((sum, value) => sum + value, 0),
    unitCount,
  );

  const updates = cells.flatMap((cell) => {
    if (axis === 'height') {
      const end = Math.min(targetUnits.length, cell.row + cell.rowSpan);
      const desired = targetUnits.slice(cell.row, end).reduce((sum, value) => sum + value, 0);
      const delta = desired - cell.height;
      return delta === 0 ? [] : [{ cellIdx: cell.cellIdx, heightDelta: delta }];
    }

    const end = Math.min(targetUnits.length, cell.col + cell.colSpan);
    const desired = targetUnits.slice(cell.col, end).reduce((sum, value) => sum + value, 0);
    const delta = desired - cell.width;
    return delta === 0 ? [] : [{ cellIdx: cell.cellIdx, widthDelta: delta }];
  });

  if (updates.length === 0) return;

  safeTableOp(() => ih.executeOperation({
    kind: 'snapshot',
    operationType: axis === 'height' ? 'equalizeWholeTableHeight' : 'equalizeWholeTableWidth',
    operation: (wasm) => {
      const result = wasm.resizeTableCells(sec, ppi, ci, updates);
      if (!result.ok) throw new Error('표 전체 균등화 저장에 실패했습니다.');
      return pos;
    },
  }), axis === 'height' ? '표 전체 높이 같게' : '표 전체 너비 같게');

  restoreEditorFocus(ih);
}

`;

  const exportMarker = 'export const tableCommands: CommandDef[] = [';
  const exportIndex = source.indexOf(exportMarker);
  if (exportIndex < 0) throw new Error('tableCommands export marker not found');

  source = source.slice(0, exportIndex) + helper + source.slice(exportIndex);

  const safeBlocks = `  {
    id: 'table:cell-height-equal',
    label: t('command.table.cellHeightEqual.label'),
    shortcutLabel: 'H',
    canExecute: inTableOrCellSelection,
    execute(services) { equalizeWholeTableGeometry(services, 'height'); },
  },
  {
    id: 'table:cell-width-equal',
    label: t('command.table.cellWidthEqual.label'),
    shortcutLabel: 'W',
    canExecute: inTableOrCellSelection,
    execute(services) { equalizeWholeTableGeometry(services, 'width'); },
  },`;

  source = source.replace(disabledBlocks, safeBlocks);

  if (!source.includes('equalizeWholeTableGeometry') || source.includes('canExecute: localTableGeometryCanPersist')) {
    throw new Error('safe equalization patch incomplete');
  }

  writeFileSync(file, source);
}

patchEmbeddedVite();
patchSafeEqualization();
console.log('Embedded rhwp Studio patched: no PWA + safe whole-table equalization.');
