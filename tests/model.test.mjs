import test from 'node:test';
import assert from 'node:assert/strict';
import { validDate, validBirthday, nextBirthday, lastContact, comingUp, makeBackup, validateBackup, emptyData } from '../app/model.js';
const ts = '2026-09-19T00:00:00.000Z';
const base = { createdAt: ts, updatedAt: ts };
const fixture = () => ({ ...emptyData(), people: [{...base,id:'p1',name:'Test person',birthday:'02-29'}] });
test('calendar dates, birthdays, leap years, and year rollover', () => {
  assert.equal(validDate('2026-02-29'),false);
  assert.equal(validDate('2024-02-29'),true);
  assert.equal(validDate('2026-13-01'),false);
  assert.equal(validDate('0000-01-01'),false);
  assert.equal(validBirthday('02-29'),true);
  assert.equal(validBirthday('04-31'),false);
  assert.equal(nextBirthday('02-29','2026-02-28'),'2026-02-28');
  assert.equal(nextBirthday('02-29','2027-03-01'),'2028-02-29');
  assert.equal(nextBirthday('01-01','2026-12-31'),'2027-01-01');
});
test('Last talked is the latest contact date, not latest entry creation', () => {
  const data = fixture();
  data.contacts = [{personId:'p1',date:'2026-09-01'},{personId:'p1',date:'2026-09-17'},{personId:'p1',date:'2026-08-15'}];
  assert.equal(lastContact(data,'p1'),'2026-09-17');
  data.contacts.splice(1,1);
  assert.equal(lastContact(data,'p1'),'2026-09-01');
});
test('Coming up retains past active items and excludes completed items', () => {
  const data = fixture();
  data.things = [{id:'t',personId:'p1',text:'A',relevantDate:'2026-09-18',archived:false},{id:'t2',personId:'p1',text:'B',relevantDate:'2026-09-19',archived:true}];
  data.reminders = [{id:'r',personId:'p1',date:'2026-09-20',time:'09:00',completed:false},{id:'r2',personId:'p1',date:'2026-09-19',completed:true}];
  assert.deepEqual(comingUp(data,'2026-09-19').map(x=>x.id),['t','r','p1']);
});
test('export round trip retains all record types and completion states', () => {
  const data = fixture();
  data.contacts.push({...base,id:'c',personId:'p1',date:'2026-09-19',type:null,note:null});
  data.notes.push({...base,id:'n',personId:'p1',text:'<&>\nText'});
  data.things.push({...base,id:'t',personId:'p1',text:'T',relevantDate:null,archived:true});
  data.reminders.push({...base,id:'r',personId:'p1',text:'R',date:'2026-09-20',time:'14:30',completed:true});
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(makeBackup(data)))),data);
});
test('invalid backups are rejected before writes', () => {
  const mutations = [
    b=>b.schemaVersion=2,
    b=>delete b.data.notes,
    b=>b.data.people.push({...b.data.people[0]}),
    b=>b.data.people[0].birthday='04-31',
    b=>b.data.people[0].name=' ',
    b=>b.data.notes.push({...base,id:'n',personId:'missing',text:'x'}),
    b=>b.data.reminders.push({...base,id:'r',personId:'p1',text:'x',date:'2026-09-19',time:'25:00',completed:false}),
    b=>b.data.things.push({...base,id:'t',personId:'p1',text:'x',relevantDate:null,archived:'false'})
  ];
  for (const mutate of mutations) { const b=makeBackup(fixture()); mutate(b); assert.throws(()=>validateBackup(b)); }
});
test('unknown fields are not imported', () => {
  const b=makeBackup(fixture()); b.data.people[0].untrusted='x';
  assert.equal('untrusted' in validateBackup(b).people[0],false);
});
