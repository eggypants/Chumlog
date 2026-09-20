import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IDBObjectStore } from 'fake-indexeddb';
import { openDB, snapshot, saveRecord, removeRecord, replaceAll, deleteAll } from '../app/db.js';
import { makeBackup, emptyData } from '../app/model.js';

test('IndexedDB lifecycle, conflict protection, import and rollback', async t => {
  let person;
  await t.test('add and reload from the database', async () => {
    person=await saveRecord('people',{name:'Test Person',emoji:'🐦'});
    assert.deepEqual((await snapshot()).data.people,[person]);
    const db=await openDB(); db.onversionchange();
    assert.equal((await snapshot()).data.people[0].name,'Test Person');
  });
  await t.test('update and reject a stale edit without overwriting', async () => {
    const original=person;
    person=await saveRecord('people',{name:'Edited Person',emoji:'🐦'},original);
    await assert.rejects(saveRecord('people',{name:'Stale',emoji:null},original),/CONFLICT/);
    assert.deepEqual((await snapshot()).data.people,[person]);
  });
  await t.test('create, edit, complete, reopen and remove linked records', async () => {
    let note=await saveRecord('notes',{personId:person.id,text:'Original note'});
    note=await saveRecord('notes',{personId:person.id,text:'Edited note'},note);
    assert.equal((await snapshot()).data.notes[0].text,'Edited note');
    await removeRecord('notes',note);
    assert.equal((await snapshot()).data.notes.length,0);
    let thing=await saveRecord('importantDates',{personId:person.id,label:'Anniversary',date:'10-01',yearly:true});
    thing=await saveRecord('importantDates',{...thing,date:'10-02'},thing);
    assert.equal((await snapshot()).data.importantDates[0].date,'10-02');
    assert.equal((await snapshot()).data.importantDates.length,1);
    let contact=await saveRecord('contacts',{personId:person.id,date:'2026-09-19',type:null,note:null});
    contact=await saveRecord('contacts',{...contact,date:'2026-09-18',type:'call'},contact);
    await removeRecord('contacts',contact);
    let reminder=await saveRecord('reminders',{personId:person.id,text:'Reminder',date:'2026-10-01',time:'12:30',completed:false});
    reminder=await saveRecord('reminders',{...reminder,completed:true},reminder);
    assert.equal((await snapshot()).data.reminders[0].completed,true);
  });
  let backup;
  await t.test('export snapshot, delete and restore every table', async () => {
    const before=await snapshot(); backup=makeBackup(before.data);
    await deleteAll(before.revision);
    assert.deepEqual((await snapshot()).data,emptyData());
    await replaceAll(backup,(await snapshot()).revision);
    assert.deepEqual((await snapshot()).data,backup.data);
  });
  await t.test('invalid import and stale replacement leave everything intact', async () => {
    const before=await snapshot();
    const invalid=structuredClone(backup); invalid.data.importantDates[0].date='04-31';
    await assert.rejects(replaceAll(invalid,before.revision),/INVALID_BACKUP/);
    await assert.rejects(replaceAll(backup,before.revision-1),/STALE_IMPORT/);
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('failure after clear rolls back the entire import', async () => {
    const before=await snapshot();
    const realAdd=IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add=function(){throw new DOMException('Simulated storage failure','QuotaExceededError');};
    try { await assert.rejects(replaceAll(backup,before.revision),/Simulated storage failure/); }
    finally { IDBObjectStore.prototype.add=realAdd; }
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('person deletion cascades and cannot be resurrected by a stale editor', async () => {
    await removeRecord('people',person);
    assert.deepEqual((await snapshot()).data,emptyData());
    await assert.rejects(saveRecord('notes',{personId:person.id,text:'Stale note'}),/PERSON_MISSING/);
    await assert.rejects(saveRecord('people',{name:'Stale',emoji:null},person),/CONFLICT/);
  });
});
