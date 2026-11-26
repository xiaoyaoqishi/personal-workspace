import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestTimeSlot, validateRoutineSlots } from './routineSlots.js';

test('new slots fill a deleted internal gap without overlap',()=>{
  const slots=[{start:'07:00',end:'08:30',theme:'读书'},{start:'11:30',end:'13:30',theme:'午休'}];
  const suggested=suggestTimeSlot(slots);
  assert.deepEqual(suggested,{start:'08:30',end:'09:30'});
  assert.equal(validateRoutineSlots([...slots,{...suggested,theme:'学习'}]),'');
});
test('late evening insertion never creates an inverted or zero-length interval',()=>{
  assert.deepEqual(suggestTimeSlot([{start:'07:00',end:'23:00'}]),{start:'23:00',end:'23:59'});
  const slots=[{start:'07:00',end:'23:59',theme:'活动'}];
  const suggested=suggestTimeSlot(slots);
  assert.equal(validateRoutineSlots([...slots,{...suggested,theme:'新增'}]),'');
  assert.equal(suggestTimeSlot([{start:'00:00',end:'23:59'}]),null);
});
test('validation identifies the specific missing theme, invalid time and overlap',()=>{
  assert.match(validateRoutineSlots([{start:'07:00',end:'08:00',theme:''}]),/第 1 段.*主题/);
  assert.match(validateRoutineSlots([{start:'23:30',end:'23:00',theme:'活动'}]),/结束时间/);
  assert.match(validateRoutineSlots([{start:'07:00',end:'08:30',theme:'读书'},{start:'08:00',end:'09:00',theme:'运动'}]),/读书.*运动.*重叠/);
});
