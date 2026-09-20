import test from 'node:test';
import assert from 'node:assert/strict';
import { validDate, validBirthday, nextBirthday, lastContact, comingUp, makeBackup, validateBackup, emptyData } from '../app/model.js';
const ts = '2026-09-19T00:00:00.000Z';
const base = { createdAt: ts, updatedAt: ts };
const fixture = () => ({ ...emptyData(), people: [{...base,id:'p1',name:'Test person',emoji:null}], importantDates: [{...base,id:'birthday',personId:'p1',label:'Birthday',date:'02-29',yearly:true}] });
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
  data.reminders = [{id:'t',personId:'p1',date:'2026-09-18',completed:false},{id:'undated',personId:'p1',date:null,completed:false},{id:'r',personId:'p1',date:'2026-09-20',time:'09:00',completed:false},{id:'r2',personId:'p1',date:'2026-09-19',completed:true}];
  assert.deepEqual(comingUp(data,'2026-09-19').map(x=>x.id),['t','r','birthday']);
});
test('export round trip retains all record types and completion states', () => {
  const data = fixture();
  data.contacts.push({...base,id:'c',personId:'p1',date:'2026-09-19',type:null,note:null});
  data.notes.push({...base,id:'n',personId:'p1',text:'<&>\nText'});
  data.reminders.push({...base,id:'t',personId:'p1',text:'T',date:null,time:null,completed:true});
  data.reminders.push({...base,id:'r',personId:'p1',text:'R',date:'2026-09-20',time:'14:30',completed:true});
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(makeBackup(data)))),data);
});
test('invalid backups are rejected before writes', () => {
  const mutations = [
    b=>b.schemaVersion=3,
    b=>delete b.data.notes,
    b=>b.data.people.push({...b.data.people[0]}),
    b=>b.data.importantDates[0].date='04-31',
    b=>b.data.people[0].name=' ',
    b=>b.data.notes.push({...base,id:'n',personId:'missing',text:'x'}),
    b=>b.data.reminders.push({...base,id:'r',personId:'p1',text:'x',date:'2026-09-19',time:'25:00',completed:false}),
    b=>b.data.reminders.push({...base,id:'t',personId:'p1',text:'x',date:null,time:null,completed:'false'}),
    b=>b.data.people[0].emoji='not an emoji',
    b=>b.data.importantDates[0].yearly='true'
  ];
  for (const mutate of mutations) { const b=makeBackup(fixture()); mutate(b); assert.throws(()=>validateBackup(b)); }
});
test('unknown fields are not imported', () => {
  const b=makeBackup(fixture()); b.data.people[0].untrusted='x';
  assert.equal('untrusted' in validateBackup(b).people[0],false);
});

test('important dates support multiple annual and one-off dates without showing past one-off dates', () => {
  const data=fixture();
  data.importantDates.push({...base,id:'anniversary',personId:'p1',label:'Anniversary',date:'09-19',yearly:true},{...base,id:'future',personId:'p1',label:'One-off',date:'2026-09-20',yearly:false},{...base,id:'past',personId:'p1',label:'Past',date:'2026-09-18',yearly:false});
  assert.deepEqual(comingUp(data,'2026-09-19').map(x=>[x.id,x.date]),[['anniversary','2026-09-19'],['future','2026-09-20'],['birthday','2027-02-28']]);
  assert.deepEqual(validateBackup(makeBackup(data)),data);
});
test('sorts use contact dates and next future items, with stable missing-date behaviour', async()=>{
  const {sortPeople}=await import('../app/model.js');
  const data={...emptyData(),people:[{id:'a',name:'Alpha'},{id:'b',name:'Beta'},{id:'c',name:'Charlie'},{id:'d',name:'Delta'}],contacts:[{personId:'a',date:'2026-09-01'},{personId:'b',date:'2026-08-01'},{personId:'a',date:'2026-07-01'}],reminders:[{id:'r',personId:'b',date:'2026-09-20',completed:false},{id:'old',personId:'c',date:'2026-09-18',completed:false},{id:'done',personId:'d',date:'2026-09-19',completed:true}],importantDates:[{id:'d',personId:'a',date:'09-19',yearly:true}]};
  const order=key=>sortPeople(data,data.people,key,'2026-09-19').map(x=>x.id);
  assert.deepEqual(order('alphabetical'),['a','b','c','d']);
  assert.deepEqual(order('longest'),['c','d','b','a']);
  assert.deepEqual(order('recent'),['a','b','c','d']);
  assert.deepEqual(order('next'),['a','b','c','d']);
  assert.deepEqual(data.people.map(x=>x.id),['a','b','c','d']);
});
test('emoji supports joined sequences, and random person includes all people without filtering',async()=>{
  const {validEmoji,randomPerson}=await import('../app/model.js');
  for(const emoji of ['🐦','👨‍👩‍👧‍👦','🇦🇺','👍🏽','1️⃣','❤️'])assert.equal(validEmoji(emoji),true,emoji);
  for(const value of ['','Bird','🐦🐦','<script>'])assert.equal(validEmoji(value),false,value);
  const people=[{id:'a'},{id:'b'}];
  assert.equal(randomPerson([],()=>0),null);assert.equal(randomPerson(people,()=>0),people[0]);assert.equal(randomPerson(people,()=>.999),people[1]);
});
