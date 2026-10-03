import test from 'node:test';
import assert from 'node:assert/strict';
import { distribute, gridUnits } from '../js/table-geometry.js';
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
