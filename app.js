import { S } from './strings.js';
import { emptyData, today, validDate, validBirthday, validEmoji, sortPeople, randomPerson, nextBirthday, lastContact, comingUp, makeBackup, validateBackup, TABLES } from './model.js';
import { snapshot, saveRecord, removeRecord, replaceAll, deleteAll } from './db.js';

const $ = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'className') node.className = value;
    else if (key === 'value') node.value = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
};
const paths = {
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2 M8 14h2 M14 14h2 M8 18h2',
  settings: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
  plus: 'M12 5v14 M5 12h14', search: 'M21 21l-5-5 M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15',
  back: 'M15 18l-6-6 6-6', next: 'M9 18l6-6-6-6', check: 'M5 12l4 4L19 6',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5', upload: 'M12 16V4 M7 9l5-5 5 5 M4 16v5h16v-5'
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.65', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name]); svg.append(path); return svg;
}
const button = (text, action, kind = 'secondary', symbol) => $('button', { type: 'button', className: `button ${kind}`, onClick: action }, symbol && icon(symbol), text);
const link = (text, href, kind = '', symbol) => $('a', { href, className: kind }, symbol && icon(symbol), text);
const optional = text => `${text} (${S.optional})`;
const formatDate = value => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
const formatBirthday = value => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).format(new Date(`2000-${value}T12:00:00`));
const stampDate = value => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
const formatTime = value => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(`2000-01-01T${value}:00`));
const initials = name => name.trim().split(/\s+/u).slice(0, 2).map(x => [...x][0]).join('').toLocaleUpperCase();
const avatar = (person, large = false) => $('span', { className: `avatar${large ? ' large' : ''}`, 'aria-hidden': 'true' }, person.emoji || initials(person.name));
let data = emptyData(), revision = 0, search = '', sortOrder = 'alphabetical', loaded = false, offline = false;
let main, notice, dialog, confirmDialog, nav, toastTimer, registration, stale = false;
const channel = 'BroadcastChannel' in window ? new BroadcastChannel(`chumlog:${new URL('.', import.meta.url).pathname}`) : null;
const alertError = error => error.message === 'CONFLICT' ? S.conflict : error.message === 'STALE_IMPORT' ? S.staleImport : error.message === 'PERSON_MISSING' ? S.personMissing : S.operationError;
function announce(text) { clearTimeout(toastTimer); notice.textContent = text; notice.hidden = false; toastTimer = setTimeout(() => { notice.hidden = true; }, 5000); }
function currentRoute() {
  const hash = location.hash.slice(1);
  return hash.startsWith('person/') ? { page: 'person', id: hash.slice(7) } : { page: ['coming-up','settings'].includes(hash) ? hash : 'people' };
}
function focusHeading() { main.querySelector('h1')?.focus({ preventScroll: true }); }
async function refresh({ focus = false } = {}) {
  const result = await snapshot(); data = result.data; revision = result.revision; loaded = true; stale = false;
  render(); if (focus) focusHeading();
}
async function changed(message) {
  const active = document.activeElement;
  const recordId = active?.closest('[data-record]')?.dataset.record;
  const activeText = active?.textContent;
  channel?.postMessage('changed');
  await refresh();
  if (!dialog.open && !confirmDialog.open) {
    const row = recordId && [...main.querySelectorAll('[data-record]')].find(x => x.dataset.record === recordId);
    const target = row && [...row.querySelectorAll('button')].find(x => x.textContent === activeText);
    if (target) target.focus({ preventScroll: true }); else if (active && !active.isConnected) focusHeading();
  }
  announce(message);
}
async function externalRefresh() {
  if (dialog.open || confirmDialog.open) { stale = true; return; }
  try { await refresh(); } catch { announce(S.loadError); }
}
channel?.addEventListener('message', externalRefresh);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { externalRefresh(); registration?.update().catch(() => {}); } });
window.addEventListener('pageshow', () => { if (loaded) externalRefresh(); });

function shell() {
  document.title = S.app;
  nav = $('nav', { 'aria-label': S.app },
    link(S.people, '#people', '', 'people'), link(S.comingUp, '#coming-up', '', 'calendar'), link(S.settings, '#settings', '', 'settings'));
  main = $('main', { id: 'main', tabindex: '-1' });
  notice = $('div', { className: 'toast', role: 'status', 'aria-live': 'polite', hidden: true });
  dialog = $('dialog', { className: 'editor', 'aria-labelledby': 'dialog-title' });
  confirmDialog = $('dialog', { className: 'confirmation', 'aria-labelledby': 'confirm-title' });
  const brand = $('a', { href: '#people', className: 'brand', 'aria-label': S.app }, $('span', { className: 'wordmark' }, S.app, $('span', { className: 'brand-dot', 'aria-hidden': 'true' })), $('span', { className: 'tagline' }, S.tagline));
  document.querySelector('#app').append(link(S.skip, '#main', 'skip-link'), $('aside', { className: 'sidebar' }, brand, nav, $('div', { className: 'sidebar-line', 'aria-hidden': 'true' })), main, notice, dialog, confirmDialog, $('div', { id: 'update-banner', className: 'update-banner', hidden: true }));
  window.addEventListener('hashchange', () => { render(); focusHeading(); window.scrollTo(0, 0); });
}

function header(title, action) { return $('header', { className: 'page-header' }, $('h1', { tabindex: '-1' }, title), action); }
function render() {
  const route = currentRoute();
  for (const a of nav.querySelectorAll('a')) {
    const selected = a.hash === `#${route.page === 'person' ? 'people' : route.page}`;
    if (selected) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  main.replaceChildren();
  if (!loaded) { main.append($('p', { role: 'status' }, S.loading)); return; }
  if (route.page === 'people') renderPeople();
  else if (route.page === 'person') renderPerson(route.id);
  else if (route.page === 'coming-up') renderComingUp();
  else renderSettings();
}
function renderPeople() {
  const list = $('div', { className: 'people-list' });
  const searchInput = $('input', { type: 'search', value: search, id: 'search', placeholder: S.search, autocomplete: 'off', onInput: e => { search = e.target.value; populate(); } });
  const populate = () => {
    const people = sortPeople(data, data.people.filter(p => p.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), sortOrder);
    list.replaceChildren(...people.map(p => {
      const last = lastContact(data, p.id);
      return $('a', { href: `#person/${p.id}`, className: 'person-row' }, avatar(p), $('span', { className: 'person-label' }, $('span', { className: 'person-name' }, p.name), last && $('span', { className: 'meta' }, `${S.lastContact} · ${formatDate(last)}`)), icon('next'));
    }));
    if (search && !people.length) list.append($('p', { className: 'quiet empty-result', role: 'status' }, S.noResults));
  };
  const sort = field(S.sort, 'sort', { options: ['alphabetical','longest','recent','next'].map(key => [key,S[key]]), value: sortOrder });
  sort.querySelector('select').addEventListener('change', e => { sortOrder = e.target.value; populate(); });
  const random = button(S.random, () => { const person = randomPerson(data.people); if (person) location.hash = `#person/${person.id}`; }, 'text-button');
  random.disabled = !data.people.length;
  main.append(header(S.people, button(S.addPerson, () => editPerson(), 'primary', 'plus')), $('div', { className: 'search-field' }, icon('search'), $('label', { for: 'search', className: 'sr-only' }, S.search), searchInput), $('div', { className: 'people-tools' }, sort, random), list);
  populate();
}
function section(title, addLabel, onAdd, children, kind = '') {
  return $('section', { className: `profile-section ${kind}` }, $('div', { className: 'section-heading' }, $('h2', {}, title), button(S.add, onAdd, 'text-button', 'plus')), children);
}
function renderPerson(id) {
  const person = data.people.find(x => x.id === id);
  if (!person) { location.replace('#people'); return; }
  const last = lastContact(data, id);
  const subrecords = table => data[table].filter(x => x.personId === id);
  const reminders = subrecords('reminders');
  const importantDates = subrecords('importantDates').sort((a,b) => (a.yearly ? nextBirthday(a.date) : a.date).localeCompare(b.yearly ? nextBirthday(b.date) : b.date));
  const dated = (a,b) => (a.date || '9999').localeCompare(b.date || '9999') || b.createdAt.localeCompare(a.createdAt);
  main.append(link(S.back, '#people', 'back-link', 'back'), $('header', { className: 'profile-header' }, avatar(person, true), $('div', { className: 'profile-title' }, $('h1', { tabindex: '-1' }, person.name), $('div', { className: 'profile-meta' }, last && $('span', {}, `${S.lastTalked} · ${formatDate(last)}`))), button(S.edit, () => editPerson(person), 'text-button')),
    $('div', { className: 'profile-actions' }, button(S.logContact, () => editEntry('contacts', person), 'primary', 'plus')));
  const dateSection = section(S.importantDates, S.addDate, () => editImportantDate(person), importantDates.map(row => $('article', { className: 'entry', 'data-record': row.id }, $('p', { className: 'entry-text' }, row.label), $('div', { className: 'entry-date' }, row.yearly ? formatBirthday(row.date) : formatDate(row.date)), $('div', { className: 'entry-actions' }, button(S.edit, () => editImportantDate(person, row), 'text-button'), button(S.delete, () => deleteEntry('importantDates', row), 'text-button')))), 'dates-section');
  dateSection.querySelector('button').setAttribute('aria-label', S.addDate);
  const reminderSection = section(S.reminders, S.addReminder, () => editEntry('reminders', person), reminders.filter(x => !x.completed).sort(dated).map(x => entry('reminders', x, person)), 'reminders-section');
  reminderSection.querySelector('button').setAttribute('aria-label', S.addReminder);
  const completedItems = reminders.filter(x => x.completed).map(x => ['reminders', x]);
  if (completedItems.length) reminderSection.append($('details', { className: 'completed-items' }, $('summary', {}, S.done), completedItems.sort((a,b) => b[1].updatedAt.localeCompare(a[1].updatedAt)).map(([table,row]) => entry(table,row,person))));
  const noteSection = section(S.notes, S.addNote, () => editEntry('notes', person), subrecords('notes').sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(x => entry('notes',x,person)), 'notes-section');
  noteSection.querySelector('button').setAttribute('aria-label', S.addNote);
  const contactSection = $('section', { className: 'profile-section contacts-section' }, $('div', { className: 'section-heading' }, $('h2', {}, S.contacts)), subrecords('contacts').sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).map(x => entry('contacts',x,person)));
  main.append($('div', { className: 'profile-grid' }, noteSection, reminderSection, dateSection, contactSection));
}
function entry(table, row, person) {
  const isContact = table === 'contacts', isNote = table === 'notes';
  const date = row.date;
  const finished = row.completed;
  const node = $('article', { className: `entry ${finished ? 'finished' : ''}`, 'data-record': row.id });
  if (isContact) {
    node.append($('div', { className: 'entry-date' }, formatDate(row.date), row.type && $('span', { className: 'quiet' }, ` · ${S.contactTypes[row.type]}`)));
    if (row.note) node.append($('p', { className: 'entry-text' }, row.note));
  } else {
    node.append($('p', { className: 'entry-text' }, row.text));
    if (date) node.append($('div', { className: 'entry-date' }, formatDate(date), row.time ? ` · ${formatTime(row.time)}` : ''));
  }
  if (isNote) node.append($('div', { className: 'meta', title: `${S.created}: ${stampDate(row.createdAt)}` }, stampDate(row.updatedAt)));
  const actions = $('div', { className: 'entry-actions' }, button(S.edit, () => editEntry(table, person, row), 'text-button'), button(S.delete, () => deleteEntry(table, row), 'text-button'));
  if (!isNote && !isContact) actions.prepend(button(finished ? S.reopen : S.done, async () => {
    try { await saveRecord(table, { ...row, completed: !finished }, row); await changed(S.saved); } catch (error) { announce(alertError(error)); }
  }, 'text-button', finished ? undefined : 'check'));
  node.append(actions); return node;
}
function renderComingUp() {
  main.append(header(S.comingUp));
  const items = comingUp(data), now = today();
  const groups = new Map();
  for (const item of items) {
    const key = item.date < now ? 'earlier' : item.date.slice(0,7);
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item);
  }
  for (const [key, rows] of groups) {
    const label = key === 'earlier' ? S.earlier : new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(`${key}-01T12:00:00`));
    const group = $('section', { className: 'agenda-group' }, $('h2', {}, label));
    for (const row of rows) {
      const d = new Date(`${row.date}T12:00:00`);
      const dateblock = $('div', { className: 'date-block', 'aria-label': formatDate(row.date) }, $('span', {}, new Intl.DateTimeFormat(undefined, { month: 'short' }).format(d)), $('strong', {}, d.getDate()));
      const content = $('div', { className: 'agenda-content' }, link(row.person.name, `#person/${row.personId}`, 'agenda-person'), $('p', {}, row.kind === 'importantDates' ? row.label : row.text), $('span', { className: 'meta' }, row.date === now ? S.today : formatDate(row.date), row.time ? ` · ${formatTime(row.time)}` : ''));
      const item = $('article', { className: `agenda-item ${row.kind === 'importantDates' ? 'birthday-item' : ''}` }, dateblock, content);
      if (row.kind !== 'importantDates') item.append(button(S.done, async () => {
        const original = data[row.kind].find(x => x.id === row.id);
        try { await saveRecord(row.kind, { ...original, completed: true }, original); await changed(S.saved); } catch (error) { announce(alertError(error)); }
      }, 'text-button', 'check'));
      group.append(item);
    }
    main.append(group);
  }
}
function renderSettings() {
  const fileInput = $('input', { type: 'file', accept: '.json,application/json', id: 'import-file', className: 'sr-only', tabindex: '-1', onChange: async e => { const file = e.target.files[0]; e.target.value = ''; if (file) await importFile(file); } });
  main.append(header(S.settings), $('section', { className: 'settings-section' }, $('div', { className: 'settings-actions' }, button(S.export, exportData, 'secondary', 'download'), button(S.import, () => fileInput.click(), 'secondary', 'upload')), fileInput, $('p', { className: 'quiet' }, S.backupText), $('p', { className: 'quiet' }, S.exportPrivacy)),
    $('section', { className: 'settings-section' }, $('h2', {}, S.privacy), $('p', {}, S.privacyText)),
    $('section', { className: 'settings-section' }, $('h2', {}, S.about), $('p', {}, `${S.app} ${S.version}`), $('p', { className: 'quiet', id: 'offline-status' }, offline ? S.offlineReady : 'serviceWorker' in navigator ? S.offlinePending : S.offlineUnavailable)),
    $('section', { className: 'settings-section' }, button(S.deleteAll, async () => {
      try {
        const preview = await snapshot();
        await confirmAction(S.deleteAllQuestion, S.deleteAllDetail, S.deleteAll, async () => { await deleteAll(preview.revision); await changed(S.deleted); });
      } catch (error) { announce(alertError(error)); }
    }, 'danger-text')));
}

// Native modal dialogs supply focus containment and keyboard Escape behaviour.
function confirmAction(title, description, label, action, extra = null) {
  return new Promise(resolve => {
    const errorNode = $('p', { className: 'error', role: 'alert', hidden: true });
    const cancel = button(S.cancel, () => { confirmDialog.close(); resolve(false); });
    const accept = button(label, async () => {
      accept.disabled = true; cancel.disabled = true;
      try { await action(); confirmDialog.close(); if (!dialog.open && document.activeElement === document.body) focusHeading(); resolve(true); }
      catch (error) { errorNode.textContent = alertError(error); errorNode.hidden = false; }
      finally { accept.disabled = false; cancel.disabled = false; }
    }, 'primary');
    if (description) confirmDialog.setAttribute('aria-describedby','confirm-description'); else confirmDialog.removeAttribute('aria-describedby');
    confirmDialog.replaceChildren(...[$('h2', { id: 'confirm-title' }, title), description && $('p', { id: 'confirm-description' }, description), extra, errorNode, $('div', { className: 'dialog-actions' }, cancel, accept)].filter(Boolean));
    confirmDialog.oncancel = e => { if (accept.disabled) e.preventDefault(); else resolve(false); };
    confirmDialog.showModal(); cancel.focus();
  });
}
function field(label, name, { type = 'text', value = '', required = false, maxLength, max, min, multiline = false, options, autocomplete } = {}) {
  const id = `field-${name}`;
  let input;
  if (options) {
    input = $('select', { id, name, required }, options.map(([value, text]) => $('option', { value }, text)));
    input.value = value;
  } else if (multiline) input = $('textarea', { id, name, required, maxlength: maxLength || 10000, rows: 5 }, value);
  else input = $('input', { id, name, type, value, required, maxlength: maxLength, max, min, autocomplete });
  input.addEventListener('input', () => input.setCustomValidity(''));
  return $('div', { className: 'field' }, $('label', { for: id }, label), input);
}
function showEditor(title, fields, onSave, destructive = null) {
  const errorNode = $('p', { className: 'error', role: 'alert', hidden: true });
  const form = $('form', {});
  let busy = false;
  const serialized = () => JSON.stringify([...new FormData(form)]);
  let initial;
  const close = async () => {
    if (busy) return;
    if (serialized() !== initial) {
      const approved = await confirmAction(S.discardTitle, null, S.discard, async () => {});
      if (!approved) return;
    }
    dialog.close(); if (stale) await externalRefresh();
  };
  const cancel = button(S.cancel, close);
  const save = $('button', { type: 'submit', className: 'button primary' }, S.save);
  form.append(...fields, errorNode, $('div', { className: 'dialog-actions' }, cancel, save));
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return;
    for (const input of form.querySelectorAll('input, textarea')) {
      if (!input.disabled && input.required && !input.value.trim()) { input.setCustomValidity(S.required); input.reportValidity(); return; }
    }
    busy = true; save.disabled = true; cancel.disabled = true; errorNode.hidden = true;
    try {
      await onSave(new FormData(form));
      dialog.close(); await changed(S.saved); focusHeading();
    } catch (error) { errorNode.textContent = ['CONFLICT','PERSON_MISSING'].includes(error.message) ? alertError(error) : error.message === 'EMOJI' ? S.emojiError : error.message === 'BIRTHDAY' ? S.birthdayError : error.message === 'DATE' ? S.dateError : error.message === 'FUTURE' ? S.futureContact : S.saveError; errorNode.hidden = false; }
    finally { busy = false; save.disabled = false; cancel.disabled = false; }
  });
  dialog.replaceChildren(...[$('h2', { id: 'dialog-title' }, title), form, destructive].filter(Boolean));
  dialog.oncancel = e => { e.preventDefault(); close(); };
  initial = serialized(); dialog.showModal();
  form.querySelector('input,textarea,select')?.focus();
}
function editPerson(original = null) {
  const fields = [field(S.name,'name',{ value: original?.name || '', required: true, maxLength: 200, autocomplete: 'off' }), field(optional(S.emoji),'emoji',{ value: original?.emoji || '', maxLength: 64, autocomplete: 'off' })];
  const destructive = original && button(S.deletePerson, async () => {
    const approved = await confirmAction(S.deletePersonQuestion, S.deletePersonDetail, S.delete, async () => { await removeRecord('people',original); dialog.close(); location.hash = '#people'; await changed(S.deleted); });
    if (approved) focusHeading();
  }, 'danger-text delete-person');
  showEditor(original ? S.editPerson : S.addPerson, fields, async form => {
    const emoji = form.get('emoji').trim() || null;
    if (emoji && !validEmoji(emoji)) throw new Error('EMOJI');
    const saved = await saveRecord('people',{ name: form.get('name').trim(), emoji },original);
    if (!original) location.hash = `#person/${saved.id}`;
  }, destructive);
}
function editImportantDate(person, original = null) {
  const months = [['','—'], ...Array.from({ length: 12 }, (_,i) => [String(i+1).padStart(2,'0'), new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(2000,i,1))])];
  const days = [['','—'], ...Array.from({ length: 31 }, (_,i) => [String(i+1).padStart(2,'0'), String(i+1)])];
  const annual = original?.yearly ?? true;
  const check = $('input', { id: 'field-yearly', name: 'yearly', type: 'checkbox', checked: annual });
  const monthDay = $('fieldset', { className: 'birthday-fields' }, $('legend', {}, S.date), field(S.month,'month',{ options: months, value: annual ? original?.date?.slice(0,2) || '' : '' }), field(S.day,'day',{ options: days, value: annual ? original?.date?.slice(3) || '' : '' }));
  const fullDate = field(S.date, 'date', { type: 'date', value: !annual ? original?.date || '' : '', min: '0001-01-01' });
  const toggle = () => {
    monthDay.hidden = !check.checked; fullDate.hidden = check.checked;
    for (const input of monthDay.querySelectorAll('select')) { input.disabled = !check.checked; input.required = check.checked; }
    fullDate.querySelector('input').disabled = check.checked;
    fullDate.querySelector('input').required = !check.checked;
  };
  check.addEventListener('change', toggle); toggle();
  showEditor(original ? S.editDate : S.addDate, [field(S.label,'label',{ value: original?.label || '', required: true, maxLength: 200 }), $('div', { className: 'check-field' }, check, $('label', { for: 'field-yearly' }, S.yearly)), monthDay, fullDate], async form => {
    const yearly = form.has('yearly');
    const date = yearly ? `${form.get('month')}-${form.get('day')}` : form.get('date');
    if (!(yearly ? validBirthday(date) : validDate(date))) throw new Error(yearly ? 'BIRTHDAY' : 'DATE');
    await saveRecord('importantDates', { personId: person.id, label: form.get('label').trim(), date, yearly }, original);
  });
}
function editEntry(table, person, original = null) {
  const fields = [];
  const titles = { notes: [S.addNote,S.editNote], reminders: [S.addReminder,S.editReminder], contacts: [S.logContact,S.editContact] };
  if (table === 'contacts') {
    fields.push(field(S.date,'date',{ type: 'date', value: original?.date || today(), required: true, max: today(), min: '0001-01-01' }), field(optional(S.type),'type',{ options: [['','—'],...Object.entries(S.contactTypes)], value: original?.type || '' }), field(optional(S.note),'note',{ value: original?.note || '', multiline: true }));
  } else {
    fields.push(field(S.text,'text',{ value: original?.text || '', multiline: true, required: true }));
    if (table !== 'notes') fields.push(field(optional(S.date),'date',{ type: 'date', value: original?.date || '', required: false, min: '0001-01-01' }));
    if (table === 'reminders') fields.push(field(optional(S.time),'time',{ type: 'time', value: original?.time || '' }));
  }
  if (table === 'reminders') {
    const dateInput = fields[1].querySelector('input');
    const timeInput = fields[2].querySelector('input');
    const toggleTime = () => { timeInput.disabled = !dateInput.value; };
    dateInput.addEventListener('input', toggleTime); toggleTime();
  }
  showEditor(titles[table][original ? 1 : 0], fields, async form => {
    const date = form.get('date') || null;
    if (date && !validDate(date)) throw new Error('DATE');
    if (table === 'contacts' && date > today()) throw new Error('FUTURE');
    const values = { personId: person.id };
    if (table === 'contacts') Object.assign(values, { date, type: form.get('type') || null, note: form.get('note').trim() || null });
    else values.text = form.get('text').trim();
    if (table === 'reminders') Object.assign(values,{ date, time: date ? form.get('time') || null : null, completed: original?.completed || false });
    await saveRecord(table,values,original);
  });
}
async function deleteEntry(table, row) {
  await confirmAction(S.deleteItemQuestion, S.deleteItemDetail, S.delete, async () => { await removeRecord(table,row); await changed(S.deleted); });
}
async function exportData() {
  try {
    const { data: current } = await snapshot();
    const url = URL.createObjectURL(new Blob([JSON.stringify(makeBackup(current),null,2)], { type: 'application/json' }));
    const a = $('a',{ href: url, download: `chumlog-${today()}.backup.json` }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url),60000); announce(S.exported);
  } catch { announce(S.operationError); }
}
async function importFile(file) {
  if (file.size > 10 * 1024 * 1024) { announce(S.largeImport); return; }
  let backup, incoming;
  try { backup = JSON.parse(await file.text()); incoming = validateBackup(backup); }
  catch { announce(S.invalidImport); return; }
  try {
    const current = await snapshot();
    const names = { people: S.people, contacts: S.contacts, notes: S.notes, importantDates: S.importantDates, reminders: S.reminders };
    const preview = $('dl',{ className: 'import-counts' },TABLES.map(k => [$('dt',{},names[k]),$('dd',{},incoming[k].length)]));
    const extra = $('div', {}, preview, button(S.export,exportData,'secondary','download'));
    await confirmAction(S.importTitle,S.importDetail,S.replace,async () => { await replaceAll(backup,current.revision); await changed(S.imported); },extra);
  } catch (error) { announce(alertError(error)); }
}

async function setupOffline() {
  if (!('serviceWorker' in navigator)) return;
  try {
    registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    const status = () => { offline = Boolean(registration.active); const node = document.querySelector('#offline-status'); if (node) node.textContent = offline ? S.offlineReady : S.offlinePending; };
    const offer = () => {
      if (!registration.waiting || !navigator.serviceWorker.controller) return;
      const banner = document.querySelector('#update-banner');
      banner.replaceChildren($('span',{},S.updateReady),button(S.update,() => { if (dialog.open || confirmDialog.open) { announce(S.keepEditing); return; } registration.waiting.postMessage({ type: 'ACTIVATE' }); },'secondary'));
      banner.hidden = false;
    };
    offer(); status();
    registration.addEventListener('updatefound',() => { const worker = registration.installing; worker?.addEventListener('statechange',() => { status(); if (worker.state === 'installed') offer(); }); });
    navigator.serviceWorker.ready.then(status);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange',() => { if (reloading) return; if (document.querySelector('#update-banner')?.hidden === false) { reloading = true; location.reload(); } });
  } catch { const node = document.querySelector('#offline-status'); if (node) node.textContent = S.offlineUnavailable; }
}
shell();
try { await refresh(); } catch { main.replaceChildren(header(S.app),$('p',{ role:'alert' },S.loadError),button(S.retry,() => location.reload(),'primary')); }
setupOffline();
