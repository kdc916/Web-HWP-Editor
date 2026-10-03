import test from 'node:test';
import assert from 'node:assert/strict';
import { distribute, gridUnits, equalizeSelectedGrid } from '../js/table-geometry.js';
test('integer distribution preserves width without cumulative rounding loss', () => {
  for (const total of [1000,13984,41953]) for(const count of [2,3,7]) {
    const units=distribute(total,count); assert.equal(units.reduce((a,b)=>a+b,0),total); assert.ok(Math.max(...units)-Math.min(...units)<=1);
  }
});
test('rendered text height takes precedence over the saved minimum', () => {
  assert.deepEqual(gridUnits([{row:0,rowSpan:1,height:282},{row:1,rowSpan:1,height:282}],2,'height',[{cellIdx:0,h:17.1},{cellIdx:1,h:80}]),[1283,6000]);
});
test('merged cells still define a usable grid without independent cells', () => {
  assert.deepEqual(gridUnits([{col:0,colSpan:2,width:1001},{col:2,colSpan:1,width:500}],3,'width'),[501,500,500]);
});
test('paginated cell fragments are accumulated', () => {
  assert.deepEqual(gridUnits([{row:0,rowSpan:1,height:282}],1,'height',[{cellIdx:0,h:30},{cellIdx:0,h:20}]),[3750]);
});
test('tall merged cells are not squeezed into shorter independent row minima', () => {
  const cells=[{row:0,rowSpan:1,height:100},{row:1,rowSpan:1,height:100},{row:0,rowSpan:2,height:1000}];
  assert.deepEqual(gridUnits(cells,2,'height'),[500,500]);
});
test('invalid spans and non-finite geometry are rejected before mutation', () => {
  for(const cell of [{col:-1,colSpan:1,width:20},{col:0,colSpan:1.5,width:20},{col:0,colSpan:3,width:20},{col:0,colSpan:1,width:NaN}]) assert.throws(()=>gridUnits([cell],2,'width'));
});
test('equalizing two rows leaves an unrelated third row unchanged', () => {
  const cells=[{row:0,col:0,rowSpan:1,colSpan:1,height:100,width:1000},{row:1,col:0,rowSpan:1,colSpan:1,height:200,width:1000},{row:2,col:0,rowSpan:1,colSpan:1,height:282,width:1000}];
  let updates;
  const wasm={getTableDimensions:()=>({rowCount:3,colCount:1,cellCount:3}),getCellInfo:(_s,_p,_c,i)=>cells[i],getCellProperties:(_s,_p,_c,i)=>cells[i],getTableCellBboxes:()=>cells.map((c,cellIdx)=>({cellIdx,h:20})),resizeTableCells:(_s,_p,_c,u)=>{updates=u;return {ok:true}}};
  const input={getCursorPosition:()=>({}),getSelectedCellRange:()=>({startRow:0,endRow:1,startCol:0,endCol:0}),getCellTableContext:()=>({sec:0,ppi:0,ci:0}),executeOperation:op=>op.operation(wasm)};
  equalizeSelectedGrid({wasm,getInputHandler:()=>input},'height');
  assert.deepEqual(updates.map(u=>u.cellIdx),[0,1]);
  assert.equal(cells[2].height,282);
});
