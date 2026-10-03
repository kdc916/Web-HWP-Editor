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
  if (start >= 0) {
    const endStart = source.indexOf(endMarker, start);
    if (endStart < 0) throw new Error('VitePWA end marker not found');
    source = source.slice(0, start) + source.slice(endStart + endMarker.length);
  }

  if (source.includes('VitePWA(') || source.includes("from 'vite-plugin-pwa'")) {
    throw new Error('embedded Studio PWA removal incomplete');
  }
  writeFileSync(file, source);
}

function replaceCommandBlock(source, startId, endId, replacement) {
  const start = source.indexOf(`  {\n    id: '${startId}'`);
  const end = source.indexOf(`  {\n    id: '${endId}'`, start + 1);
  if (start < 0 || end < 0) {
    throw new Error(`command block not found: ${startId} -> ${endId}`);
  }
  return source.slice(0, start) + replacement + '\n' + source.slice(end);
}

function patchPersistentEqualization() {
  const file = join(root, 'rhwp-studio', 'src', 'command', 'commands', 'table.ts');
  let source = readFileSync(file, 'utf8');

  const helper = String.raw`
/**
 * Web HWP Editor v0.5.2 table integrity helpers.
 *
 * Equal-height/width must mutate persisted HWP cell geometry, not only renderer-local
 * geometry. Rows/columns are canonical grid units. A merged cell is always resized to
 * the sum of every unit it spans, so merge/split/save/reopen cannot drift apart.
 */
function webHwpDistributeUnits(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  let remainder = total - base * count;
  return Array.from({ length: count }, () => {
    const value = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return value;
  });
}

function webHwpCanonicalUnits(
  services: CommandServices,
  sec: number,
  ppi: number,
  ci: number,
  dims: TableDimensions,
  axis: 'height' | 'width',
): number[] | null {
  const count = axis === 'height' ? dims.rowCount : dims.colCount;
  const units = Array<number>(count).fill(0);

  for (let cellIdx = 0; cellIdx < dims.cellCount; cellIdx += 1) {
    const info = services.wasm.getCellInfo(sec, ppi, ci, cellIdx);
    const props = services.wasm.getCellProperties(sec, ppi, ci, cellIdx);
    const span = axis === 'height' ? info.rowSpan : info.colSpan;
    if (span !== 1) continue;

    const unit = axis === 'height' ? info.row : info.col;
    const value = Number(axis === 'height' ? props.height : props.width);
    if (unit >= 0 && unit < units.length && Number.isFinite(value) && value > units[unit]) {
      units[unit] = value;
    }
  }

  // If a unit has no independent persisted size, guessing would recreate the old drift bug.
  return units.every((value) => value > 0) ? units : null;
}

function webHwpEqualizeSelectedGrid(
  services: CommandServices,
  axis: 'height' | 'width',
): void {
  const ctx = currentTableCellContext(services);
  if (!ctx) return;
  const { ih, pos } = ctx;

  if ((pos.cellPath?.length ?? 0) > 1) {
    console.warn('[WebHWP table] nested-table equalization is fail-closed');
    return;
  }
  if (hasNonRectangularCellSelection(ih)) {
    console.warn('[WebHWP table] non-rectangular cell selection is not equalized');
    return;
  }

  const sec = pos.sectionIndex;
  const ppi = pos.parentParaIndex!;
  const ci = pos.controlIndex!;
  const dims = services.wasm.getTableDimensions(sec, ppi, ci);
  const range = ih.isInCellSelectionMode?.() ? ih.getSelectedCellRange?.() : null;
  if (!range) return;

  const startUnit = axis === 'height' ? range.startRow : range.startCol;
  const endUnit = axis === 'height' ? range.endRow : range.endCol;
  const selectedCount = endUnit - startUnit + 1;
  if (selectedCount < 2) return;

  const canonical = webHwpCanonicalUnits(services, sec, ppi, ci, dims, axis);
  if (!canonical) {
    console.warn('[WebHWP table] persisted grid could not be derived safely');
    return;
  }

  const selectedTotal = canonical
    .slice(startUnit, endUnit + 1)
    .reduce((sum, value) => sum + value, 0);
  const equal = webHwpDistributeUnits(selectedTotal, selectedCount);
  const targetUnits = canonical.slice();
  for (let i = 0; i < selectedCount; i += 1) {
    targetUnits[startUnit + i] = equal[i];
  }

  const updates: Parameters<CommandServices['wasm']['resizeTableCells']>[3] = [];
  for (let cellIdx = 0; cellIdx < dims.cellCount; cellIdx += 1) {
    const info = services.wasm.getCellInfo(sec, ppi, ci, cellIdx);
    const props = services.wasm.getCellProperties(sec, ppi, ci, cellIdx);

    if (axis === 'height') {
      const end = Math.min(targetUnits.length, info.row + Math.max(1, info.rowSpan));
      const desired = targetUnits.slice(info.row, end).reduce((sum, value) => sum + value, 0);
      const current = Number(props.height);
      const delta = desired - current;
      if (delta !== 0) updates.push({ cellIdx, heightDelta: delta });
    } else {
      const end = Math.min(targetUnits.length, info.col + Math.max(1, info.colSpan));
      const desired = targetUnits.slice(info.col, end).reduce((sum, value) => sum + value, 0);
      const current = Number(props.width);
      const delta = desired - current;
      if (delta !== 0) updates.push({ cellIdx, widthDelta: delta });
    }
  }

  if (updates.length === 0) return;

  safeTableOp(() => ih.executeOperation({
    kind: 'snapshot',
    operationType: axis === 'height'
      ? 'equalizeSelectedTableRowsPersisted'
      : 'equalizeSelectedTableColumnsPersisted',
    operation: (wasm) => {
      const result = wasm.resizeTableCells(sec, ppi, ci, updates);
      if (result && result.ok === false) {
        throw new Error(axis === 'height'
          ? '셀 높이 균등화 저장에 실패했습니다.'
          : '셀 너비 균등화 저장에 실패했습니다.');
      }
      return pos;
    },
  }), axis === 'height' ? '셀 높이를 같게' : '셀 너비를 같게');

  restoreEditorFocus(ih);
}
`;

  const exportMarker = 'export const tableCommands: CommandDef[] = [';
  const exportAt = source.indexOf(exportMarker);
  if (exportAt < 0) throw new Error('tableCommands marker not found');
  if (!source.includes('function webHwpEqualizeSelectedGrid(')) {
    source = source.slice(0, exportAt) + helper + '\n' + source.slice(exportAt);
  }

  const equalCommands = String.raw`  {
    id: 'table:cell-height-equal',
    label: '셀 높이를 같게',
    shortcutLabel: 'H',
    canExecute: hasMultiCellSelection,
    execute(services) { webHwpEqualizeSelectedGrid(services, 'height'); },
  },
  {
    id: 'table:cell-width-equal',
    label: '셀 너비를 같게',
    shortcutLabel: 'W',
    canExecute: hasMultiCellSelection,
    execute(services) { webHwpEqualizeSelectedGrid(services, 'width'); },
  },`;

  source = replaceCommandBlock(source, 'table:cell-height-equal', 'table:formula', equalCommands);

  // Merge must never silently include Ctrl-excluded cells or nested-table ranges.
  source = source.replace(
    "    canExecute: (ctx) => ctx.inCellSelectionMode,\n    execute(services) {\n      const ih = services.getInputHandler();\n      if (!ih) return;\n      const range = ih.getSelectedCellRange();\n      const tableCtx = ih.getCellTableContext();",
    "    canExecute: hasMultiCellSelection,\n    execute(services) {\n      const ih = services.getInputHandler();\n      if (!ih) return;\n      if (hasNonRectangularCellSelection(ih)) return;\n      const range = ih.getSelectedCellRange();\n      const tableCtx = ih.getCellTableContext();\n      if ((tableCtx?.cellPath?.length ?? 0) > 1) return;"
  );

  // Split supports a rectangular cell block, but excluded/non-rectangular blocks are unsafe.
  source = source.replace(
    "      const range = ih.getSelectedCellRange?.();\n      const tableCtx = ih.getCellTableContext?.();\n      const isMultiCell = range && tableCtx &&",
    "      const range = ih.getSelectedCellRange?.();\n      const tableCtx = ih.getCellTableContext?.();\n      if (hasNonRectangularCellSelection(ih)) return;\n      if ((tableCtx?.cellPath?.length ?? 0) > 1) return;\n      const isMultiCell = range && tableCtx &&"
  );

  if (source.includes('localResize: true')) {
    const heightAt = source.indexOf("id: 'table:cell-height-equal'");
    const formulaAt = source.indexOf("id: 'table:formula'", heightAt);
    if (source.slice(heightAt, formulaAt).includes('localResize: true')) {
      throw new Error('legacy local-only equalization remains');
    }
  }
  if (!source.includes("canExecute: hasMultiCellSelection") ||
      !source.includes("webHwpEqualizeSelectedGrid(services, 'height')") ||
      !source.includes("webHwpEqualizeSelectedGrid(services, 'width')")) {
    throw new Error('persistent equalization patch incomplete');
  }

  writeFileSync(file, source);
}


function patchStudioEqualizationRegressionTest() {
  const file = join(root, 'rhwp-studio', 'tests', 'table-cell-width-equal-1491.test.ts');
  const lines = [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { readFileSync } from 'node:fs';",
    "import { dirname, join } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    "",
    "const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));",
    "const table = readFileSync(join(rootDir, 'src/command/commands/table.ts'), 'utf8');",
    "",
    "function commandBlock(commandId: string): string {",
    "  const start = table.indexOf(\"id: '\" + commandId + \"'\");",
    "  assert.notEqual(start, -1, commandId + ' command not found');",
    "  const end = table.indexOf('\\n  {', start + 1);",
    "  assert.notEqual(end, -1, commandId + ' command end not found');",
    "  return table.slice(start, end);",
    "}",
    "",
    "test('셀 높이 같게는 renderer-local hint가 아니라 persisted grid를 수정한다', () => {",
    "  const block = commandBlock('table:cell-height-equal');",
    "  assert.match(block, /canExecute:\\s*hasMultiCellSelection/);",
    "  assert.match(block, /webHwpEqualizeSelectedGrid\\(services, 'height'\\)/);",
    "  assert.doesNotMatch(block, /localResize:\\s*true/);",
    "  assert.doesNotMatch(block, /renderHeight/);",
    "});",
    "",
    "test('셀 너비 같게는 renderer-local hint가 아니라 persisted grid를 수정한다', () => {",
    "  const block = commandBlock('table:cell-width-equal');",
    "  assert.match(block, /canExecute:\\s*hasMultiCellSelection/);",
    "  assert.match(block, /webHwpEqualizeSelectedGrid\\(services, 'width'\\)/);",
    "  assert.doesNotMatch(block, /localResize:\\s*true/);",
    "  assert.doesNotMatch(block, /renderWidth/);",
    "});",
    "",
    "test('persisted equalization helper는 병합 셀 크기를 span 단위 합으로 계산한다', () => {",
    "  assert.match(table, /targetUnits\\.slice\\(info\\.row, end\\)\\.reduce/);",
    "  assert.match(table, /targetUnits\\.slice\\(info\\.col, end\\)\\.reduce/);",
    "  assert.match(table, /wasm\\.resizeTableCells\\(sec, ppi, ci, updates\\)/);",
    "  assert.match(table, /operationType:\\s*axis === 'height'/);",
    "});",
    "",
    "test('셀 합치기는 다중 직사각형 선택에서만 활성화된다', () => {",
    "  const block = commandBlock('table:cell-merge');",
    "  assert.match(block, /canExecute:\\s*hasMultiCellSelection/);",
    "  assert.match(block, /hasNonRectangularCellSelection\\(ih\\)/);",
    "});",
    "",
    "test('셀 나누기는 비직사각형 블록을 거부한다', () => {",
    "  const block = commandBlock('table:cell-split');",
    "  assert.match(block, /hasNonRectangularCellSelection\\(ih\\)/);",
    "});",
    "",
  ];
  writeFileSync(file, lines.join(String.fromCharCode(10)));
}

patchEmbeddedVite();
patchPersistentEqualization();
patchStudioEqualizationRegressionTest();
console.log('Web HWP Editor v0.5.2 Studio patch applied.');
