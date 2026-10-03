// Values written to HWP are integer HWPUNIT (7200 per inch).
const PIXEL_TO_HWP = 75;
export function distribute(total, count) {
  const base = Math.floor(total / count), remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}
export function gridUnits(cells, count, axis, boxes = []) {
  const startKey = axis === 'height' ? 'row' : 'col';
  const spanKey = axis === 'height' ? 'rowSpan' : 'colSpan';
  const units = Array(count).fill(0);
  const rendered = new Map();
  for (const box of boxes) {
    rendered.set(box.cellIdx, (rendered.get(box.cellIdx) || 0) + box.h * PIXEL_TO_HWP);
  }
  const size = (cell, index) => Math.ceil(Math.max(cell[axis], axis === 'height' ? rendered.get(index) || 0 : 0));
  cells.forEach((cell, index) => {
    if (cell[spanKey] === 1) units[cell[startKey]] = Math.max(units[cell[startKey]], size(cell, index));
  });
  for (const [index, cell] of cells.entries()) {
    const start = cell[startKey], end = start + cell[spanKey];
    if (start < 0 || end > count || end <= start) throw new Error('표의 셀 범위가 올바르지 않습니다.');
    const missing = [];
    let known = 0;
    for (let i = start; i < end; i++) { if (!units[i]) missing.push(i); else known += units[i]; }
    if (missing.length) {
      const parts = distribute(Math.max(missing.length, size(cell, index) - known), missing.length);
      missing.forEach((unit, i) => { units[unit] = parts[i]; });
    }
  }
  if (units.some(value => !Number.isFinite(value) || value <= 0)) throw new Error('표 크기를 계산하지 못했습니다.');
  return units;
}
export function equalizeSelectedGrid(services, axis) {
  const input = services.getInputHandler();
  if (!input) throw new Error('편집기를 준비한 후 다시 시도해주세요.');
  const position = input.getCursorPosition(), range = input.getSelectedCellRange?.();
  const context = input.getCellTableContext?.();
  if (!range || !context) throw new Error('크기를 맞출 셀을 먼저 선택하세요.');
  if ((context.cellPath?.length || 0) > 1) throw new Error('중첩 표의 크기 맞추기는 지원하지 않습니다. 바깥 표에서 사용해주세요.');
  if (input.hasExcludedCellSelection?.()) throw new Error('떨어진 셀은 크기를 맞출 수 없습니다. 연속된 셀을 선택하세요.');
  const { sec, ppi, ci } = context, wasm = services.wasm;
  const dimensions = wasm.getTableDimensions(sec, ppi, ci);
  const cells = Array.from({ length: dimensions.cellCount }, (_, index) => ({ ...wasm.getCellInfo(sec, ppi, ci, index), ...wasm.getCellProperties(sec, ppi, ci, index) }));
  const count = axis === 'height' ? dimensions.rowCount : dimensions.colCount;
  const start = axis === 'height' ? range.startRow : range.startCol;
  const end = axis === 'height' ? range.endRow : range.endCol;
  if (end <= start) throw new Error(axis === 'height' ? '두 줄 이상을 선택하세요.' : '두 칸 이상을 선택하세요.');
  const units = gridUnits(cells, count, axis, axis === 'height' ? wasm.getTableCellBboxes(sec, ppi, ci) : []);
  const selected = units.slice(start, end + 1);
  const equal = axis === 'height' ? selected.map(() => Math.max(...selected)) : distribute(selected.reduce((a, b) => a + b, 0), selected.length);
  units.splice(start, selected.length, ...equal);
  const updates = [];
  cells.forEach((cell, cellIdx) => {
    const first = axis === 'height' ? cell.row : cell.col;
    const span = axis === 'height' ? cell.rowSpan : cell.colSpan;
    const desired = units.slice(first, first + span).reduce((a, b) => a + b, 0);
    const delta = desired - cell[axis];
    if (delta) updates.push({ cellIdx, [axis + 'Delta']: delta });
  });
  if (!updates.length) return;
  input.executeOperation({
    kind: 'snapshot', operationType: axis === 'height' ? 'equalizeSelectedTableRowsPersisted' : 'equalizeSelectedTableColumnsPersisted',
    operation(engine) {
      const result = engine.resizeTableCells(sec, ppi, ci, updates);
      if (result?.ok === false) throw new Error('표 크기 변경을 저장하지 못했습니다.');
      return position;
    },
  });
  input.textarea?.focus();
}
