import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IDBObjectStore } from 'fake-indexeddb';
import { LEGACY_TABLES, TABLES, makeBackup, validateBackup } from '../app/model.js';
import { openDB, snapshot, replaceAll } from '../app/db.js';
const ts='2026-09-19T00:00:00.000Z';
const base={createdAt:ts,updatedAt:ts};
const legacy={
  people:[{...base,id:'p',name:'Migration test',birthday:'02-29'},{...base,id:'q',name:'No birthday',birthday:null}],
  contacts:[{...base,id:'contact',personId:'p',date:'2026-09-18',type:null,note:null}],
  notes:[{...base,id:'note',personId:'p',text:'Keep this note'}],
  things:[{...base,id:'collision',personId:'p',text:'Dated active',relevantDate:'2026-10-01',archived:false},{...base,id:'undated',personId:'p',text:'Undated active',relevantDate:null,archived:false},{...base,id:'done',personId:'p',text:'Completed context',relevantDate:null,archived:true}],
  reminders:[{...base,id:'collision',personId:'p',text:'Existing reminder',date:'2026-10-02',time:'10:00',completed:true}]
};
const backup=()=>({app:'Chumlog',schemaVersion:1,exportedAt:ts,data:structuredClone(legacy)});
const name=`chumlog:${new URL('../app/',import.meta.url).pathname}`;
const req=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
function verify(data) {
  assert.equal(data.people.length,2);
  assert.equal(data.people[0].emoji,null);
  assert.equal('birthday' in data.people[0],false);
  assert.equal('things' in data,false);
  assert.deepEqual(data.notes,legacy.notes);
  assert.deepEqual(data.contacts,legacy.contacts);
  assert.equal(data.importantDates.length,1);
  assert.deepEqual(data.importantDates[0],{...base,id:'p',personId:'p',label:'Birthday',date:'02-29',yearly:true});
  assert.equal(data.reminders.length,4);
  assert.equal(new Set(data.reminders.map(x=>x.id)).size,4);
  assert.deepEqual(data.reminders.find(x=>x.id==='collision'),legacy.reminders[0]);
  for(const thing of legacy.things){
    const reminder=data.reminders.find(x=>x.text===thing.text);
    assert.equal(reminder.date,thing.relevantDate);assert.equal(reminder.completed,thing.archived);
    assert.equal(reminder.createdAt,thing.createdAt);assert.equal(reminder.updatedAt,thing.updatedAt);
    assert.equal(reminder.personId,thing.personId);
  }
  assert.deepEqual(validateBackup(makeBackup(data)),data);
}
test('legacy backup migration preserves every record, timestamps and completion, including ID collisions',()=>{
  const input=backup(),before=structuredClone(input);verify(validateBackup(input));assert.deepEqual(input,before);
  input.data.things[0].relevantDate='2026-02-30';assert.throws(()=>validateBackup(input),/INVALID_BACKUP/);
});
test('database upgrade rolls back on failure, retries, and survives reopen without duplication',async()=>{
  const request=indexedDB.open(name,1);
  request.onupgradeneeded=()=>{
    const db=request.result;
    for(const table of LEGACY_TABLES){const store=db.createObjectStore(table,{keyPath:'id'});if(table!=='people')store.createIndex('personId','personId');}
    db.createObjectStore('meta',{keyPath:'id'});
  };
  const old=await req(request),tx=old.transaction([...LEGACY_TABLES,'meta'],'readwrite'),finished=done(tx);
  for(const table of LEGACY_TABLES)for(const row of legacy[table])tx.objectStore(table).add(row);
  tx.objectStore('meta').put({id:'revision',value:7});await finished;old.close();
  const realAdd=IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add=function(...args){if(this.name==='importantDates')throw new DOMException('Full','QuotaExceededError');return realAdd.apply(this,args);};
  try{await assert.rejects(openDB());}finally{IDBObjectStore.prototype.add=realAdd;}
  const preserved=await req(indexedDB.open(name,1));
  assert.equal(preserved.version,1);assert.equal(preserved.objectStoreNames.contains('things'),true);
  assert.deepEqual(await req(preserved.transaction('things').objectStore('things').getAll()),[...legacy.things].sort((a,b)=>a.id.localeCompare(b.id)));
  preserved.close();
  const migrated=await snapshot();verify(migrated.data);assert.equal(migrated.revision,8);
  const db=await openDB();assert.equal(db.version,2);assert.equal(db.objectStoreNames.contains('things'),false);
  for(const table of TABLES.slice(1))assert.ok(db.transaction(table).objectStore(table).indexNames.contains('personId'));
  db.onversionchange();assert.deepEqual(await snapshot(),migrated);
  await replaceAll(backup(),migrated.revision);verify((await snapshot()).data);
});
