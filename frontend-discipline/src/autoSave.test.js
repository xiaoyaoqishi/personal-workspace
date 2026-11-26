import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoSaver } from './autoSave.js';

const initial = { revision:0, slots:[{id:'a',notes:''}], saved:false };
const deferred = () => { let resolve; const promise=new Promise(r=>{resolve=r;}); return {promise,resolve}; };

test('queued newer text survives an older response and writes with next revision', async()=>{
  const first=deferred(); const calls=[]; let view;
  const saver=createAutoSaver({initial,delay:100000,onChange:v=>{view=v;},onState:()=>{},save:body=>{
    calls.push(body);
    return calls.length===1 ? first.promise : Promise.resolve({...body,revision:2,saved:true});
  }});
  saver.enqueue([{id:'a',notes:'first'}]);
  const saving=saver.flush();
  await Promise.resolve();
  saver.enqueue([{id:'a',notes:'latest text'}]);
  first.resolve({revision:1,slots:[{id:'a',notes:'first'}],saved:true});
  await saving;
  assert.equal(calls.length,2);
  assert.equal(calls[1].revision,1);
  assert.equal(calls[1].slots[0].notes,'latest text');
  assert.equal(view.slots[0].notes,'latest text');
  assert.equal(saver.dirty,false);
  saver.dispose();
});

test('failed save preserves input, stops auto retries and allows explicit retry', async()=>{
  let reject=true; let state;
  const saver=createAutoSaver({initial,delay:100000,onChange:()=>{},onState:v=>{state=v;},save:async body=>{
    if(reject) throw new Error('offline');
    return {...body,revision:1,saved:true};
  }});
  saver.enqueue([{id:'a',notes:'keep this'}]);
  await assert.rejects(saver.flush(),/offline/);
  assert.equal(saver.dirty,true);
  assert.equal(state,'error');
  saver.enqueue([{id:'a',notes:'keep newer text'}]);
  assert.equal(state,'error');
  assert.equal(saver.value.slots[0].notes,'keep newer text');
  reject=false; await saver.retry();
  assert.equal(state,'saved'); assert.equal(saver.dirty,false);
  saver.dispose();
});

test('flush calls share one flight and replacement cannot erase pending edits',async()=>{
  const pending=deferred(); let calls=0;
  const saver=createAutoSaver({initial,delay:100000,onChange:()=>{},onState:()=>{},save:()=>{calls++;return pending.promise;}});
  saver.enqueue([{id:'a',notes:'pending'}]);
  assert.throws(()=>saver.replace(initial),/保存完成/);
  const one=saver.flush(); const two=saver.flush();
  await Promise.resolve(); assert.equal(calls,1);
  pending.resolve({revision:1,slots:[{id:'a',notes:'pending'}],saved:true});
  await Promise.all([one,two]);
  saver.replace({revision:2,slots:[{id:'a',notes:'pending'},{id:'b',notes:''}],saved:true});
  assert.equal(saver.value.slots.length,2);
  saver.dispose();
});
