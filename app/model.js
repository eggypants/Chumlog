import { S } from './strings.js';
export const SCHEMA_VERSION = 2;
export const LEGACY_TABLES = ['people', 'contacts', 'notes', 'things', 'reminders'];
export const TABLES = ['people', 'contacts', 'notes', 'importantDates', 'reminders'];
export const emptyData = () => Object.fromEntries(TABLES.map(k => [k, []]));
export const today = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s) || s < '0001-01-01') return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s;
}
export const validBirthday = s => typeof s === 'string' && /^\d{2}-\d{2}$/.test(s) && validDate(`2000-${s}`);
export function nextBirthday(birthday, from = today()) {
  let year = Number(from.slice(0, 4));
  const occurrence = y => birthday === '02-29' && !validDate(`${y}-02-29`) ? `${y}-02-28` : `${y}-${birthday}`;
  if (occurrence(year) < from) year++;
  return occurrence(year);
}
export function lastContact(data, personId) {
  return data.contacts.filter(x => x.personId === personId).map(x => x.date).sort().at(-1) || null;
}
export function comingUp(data, from = today()) {
  const byId = new Map(data.people.map(p => [p.id, p]));
  return [
    ...data.importantDates.map(x => ({ ...x, kind: 'importantDates', date: x.yearly ? nextBirthday(x.date, from) : x.date, time: null })).filter(x => x.date >= from),
    ...data.reminders.filter(x => !x.completed && x.date).map(x => ({ ...x, kind: 'reminders' }))
  ].filter(x => byId.has(x.personId)).map(x => ({ ...x, person: byId.get(x.personId) }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || a.person.name.localeCompare(b.person.name));
}
const fail = () => { throw new Error('INVALID_BACKUP'); };
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max, nonempty = true) => typeof v === 'string' && v.length <= max && (!nonempty || v.trim().length > 0);
const nullable = (v, check) => v === null || check(v);
const timestamp = v => str(v, 40) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v;
const id = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);

// Strictly validate and whitelist fields before starting any write transaction.
export function validateBackup(input) {
  if (!record(input) || input.app !== 'Chumlog' || ![1, SCHEMA_VERSION].includes(input.schemaVersion) || !timestamp(input.exportedAt) || !record(input.data)) fail();
  const legacy = input.schemaVersion === 1;
  const tables = legacy ? LEGACY_TABLES : TABLES;
  const result = Object.fromEntries(tables.map(k => [k, []]));
  for (const table of tables) {
    const rows = input.data[table];
    if (!Array.isArray(rows) || rows.length > 50000) fail();
    const ids = new Set();
    for (const row of rows) {
      if (!record(row) || !id(row.id) || ids.has(row.id) || !timestamp(row.createdAt) || !timestamp(row.updatedAt) || row.updatedAt < row.createdAt) fail();
      ids.add(row.id);
      const base = { id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt };
      if (table === 'people') {
        if (!str(row.name, 200)) fail();
        if (legacy) {
          if (!nullable(row.birthday, validBirthday)) fail();
          result.people.push({ ...base, name: row.name, birthday: row.birthday });
        } else {
          if (!nullable(row.emoji, validEmoji)) fail();
          result.people.push({ ...base, name: row.name, emoji: row.emoji });
        }
        continue;
      }
      if (!id(row.personId)) fail();
      base.personId = row.personId;
      if (table === 'importantDates') {
        if (!str(row.label, 200) || typeof row.yearly !== 'boolean' || !(row.yearly ? validBirthday(row.date) : validDate(row.date))) fail();
        result.importantDates.push({ ...base, label: row.label, date: row.date, yearly: row.yearly });
      } else if (table === 'contacts') {
        if (!validDate(row.date) || !nullable(row.type, v => ['message','call','inPerson','other'].includes(v)) || !nullable(row.note, v => str(v, 10000, false))) fail();
        result.contacts.push({ ...base, date: row.date, type: row.type, note: row.note });
      } else {
        if (!str(row.text, 10000)) fail();
        base.text = row.text;
        if (table === 'notes') result.notes.push(base);
        if (table === 'things') {
          if (!nullable(row.relevantDate, validDate) || typeof row.archived !== 'boolean') fail();
          result.things.push({ ...base, relevantDate: row.relevantDate, archived: row.archived });
        }
        if (table === 'reminders') {
          if (!(legacy ? validDate(row.date) : nullable(row.date, validDate)) || (!row.date && row.time !== null) || !nullable(row.time, v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) || typeof row.completed !== 'boolean') fail();
          result.reminders.push({ ...base, date: row.date, time: row.time, completed: row.completed });
        }
      }
    }
  }
  const people = new Set(result.people.map(p => p.id));
  for (const table of tables.slice(1)) if (result[table].some(r => !people.has(r.personId))) fail();
  return legacy ? migrateV1(result) : result;
}
export const makeBackup = data => ({ app: 'Chumlog', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data });

// One visible emoji, including joined families, flags and skin-tone sequences.
export function validEmoji(value) {
  if (typeof value !== 'string' || value.length > 64 || !/\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(value)) return false;
  if (typeof Intl.Segmenter === 'function') return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].length === 1;
  return /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\uFE0F\u200D\u20E3#*0-9]|[\u{E0020}-\u{E007F}])+$/u.test(value);
}

// Called only after legacy backup validation, or inside the atomic IndexedDB upgrade.
export function migrateV1(data) {
  const result = emptyData();
  result.contacts = data.contacts.map(x => ({ ...x }));
  result.notes = data.notes.map(x => ({ ...x }));
  result.reminders = data.reminders.map(x => ({ ...x }));
  const used = new Set(result.reminders.map(x => x.id));
  for (const row of data.things) {
    let id = row.id;
    while (used.has(id)) id = crypto.randomUUID();
    used.add(id);
    result.reminders.push({ id, personId: row.personId, text: row.text, date: row.relevantDate, time: null, completed: row.archived, createdAt: row.createdAt, updatedAt: row.updatedAt });
  }
  for (const { birthday, ...person } of data.people) {
    result.people.push({ ...person, emoji: null });
    if (birthday) result.importantDates.push({ id: person.id, personId: person.id, label: S.birthday, date: birthday, yearly: true, createdAt: person.createdAt, updatedAt: person.updatedAt });
  }
  return result;
}

export function sortPeople(data, people, order = 'alphabetical', from = today()) {
  const contacts = new Map();
  for (const row of data.contacts) if (!contacts.has(row.personId) || contacts.get(row.personId) < row.date) contacts.set(row.personId, row.date);
  const upcoming = new Map();
  if (order === 'next') for (const row of comingUp(data, from)) if (row.date >= from && !upcoming.has(row.personId)) upcoming.set(row.personId, row.date);
  const name = (a,b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  return [...people].sort((a,b) => {
    if (order === 'longest') return (contacts.get(a.id) || '').localeCompare(contacts.get(b.id) || '') || name(a,b);
    if (order === 'recent') return (contacts.get(b.id) || '').localeCompare(contacts.get(a.id) || '') || name(a,b);
    if (order === 'next') return (upcoming.get(a.id) || '9999-99-99').localeCompare(upcoming.get(b.id) || '9999-99-99') || name(a,b);
    return name(a,b);
  });
}
export const randomPerson = (people, random = Math.random) => people.length ? people[Math.floor(random() * people.length)] : null;
