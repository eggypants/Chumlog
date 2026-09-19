export const SCHEMA_VERSION = 1;
export const TABLES = ['people', 'contacts', 'notes', 'things', 'reminders'];
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
    ...data.people.filter(p => p.birthday).map(p => ({ kind: 'birthday', id: p.id, personId: p.id, date: nextBirthday(p.birthday, from), time: null })),
    ...data.things.filter(x => !x.archived && x.relevantDate).map(x => ({ ...x, kind: 'things', date: x.relevantDate, time: null })),
    ...data.reminders.filter(x => !x.completed).map(x => ({ ...x, kind: 'reminders' }))
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
  if (!record(input) || input.app !== 'Chumlog' || input.schemaVersion !== SCHEMA_VERSION || !timestamp(input.exportedAt) || !record(input.data)) fail();
  const result = emptyData();
  for (const table of TABLES) {
    const rows = input.data[table];
    if (!Array.isArray(rows) || rows.length > 50000) fail();
    const ids = new Set();
    for (const row of rows) {
      if (!record(row) || !id(row.id) || ids.has(row.id) || !timestamp(row.createdAt) || !timestamp(row.updatedAt) || row.updatedAt < row.createdAt) fail();
      ids.add(row.id);
      const base = { id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt };
      if (table === 'people') {
        if (!str(row.name, 200) || !nullable(row.birthday, validBirthday)) fail();
        result.people.push({ ...base, name: row.name, birthday: row.birthday });
        continue;
      }
      if (!id(row.personId)) fail();
      base.personId = row.personId;
      if (table === 'contacts') {
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
          if (!validDate(row.date) || !nullable(row.time, v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) || typeof row.completed !== 'boolean') fail();
          result.reminders.push({ ...base, date: row.date, time: row.time, completed: row.completed });
        }
      }
    }
  }
  const people = new Set(result.people.map(p => p.id));
  for (const table of TABLES.slice(1)) if (result[table].some(r => !people.has(r.personId))) fail();
  return result;
}
export const makeBackup = data => ({ app: 'Chumlog', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data });
