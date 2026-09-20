# Verification

The source and static build were checked on 20 September 2026.

## Automated checks

`npm test` exercises the production modules using Node's test runner. Storage tests use `fake-indexeddb`; interface tests use `happy-dom`. Service-worker tests use a controlled cache/network harness. These are automated logic and DOM integration tests, not a substitute for real browser/device QA.

Covered flows:

- Create a person with an emoji; read it again after reopening the database.
- Edit a person; reject stale edits; delete the person and all associated records atomically.
- Add, edit, and delete notes; render user-entered HTML as plain text.
- Create dated/undated reminders; mark done and reopen them.
- Log and edit contact; derive Last talked from contact dates; delete contacts.
- Create dated reminders with optional times; complete them.
- Combine important dates and active dated records in Coming up; retain past active items; exclude completed records.
- Search people, including case-insensitive matching and no results.
- Export from Settings, validate the resulting JSON, preview/cancel an import, and confirm replacement.
- Reject malformed/unsupported backups, duplicate IDs, orphaned records, invalid dates and types.
- Prevent a stale import from replacing data edited after its preview.
- Roll back an import when a simulated storage failure occurs after clearing begins.
- Keep unsaved input visible when a write fails; successfully retry the save.
- Handle leap-day yearly dates and year boundaries.
- Add/edit/delete multiple important dates, including yearly and one-off dates.
- Sort by name, contact dates and upcoming dates, including missing dates and ties; select a random person.
- Omit null contact-note text and render emoji on the list and profile.
- Upgrade a populated version-1 database, including undated/completed things and colliding IDs; preserve all records and timestamps.
- Roll back a failed database upgrade, retry it, and reopen without duplicate migration.
- Import old backups and export/re-import version-2 backups.
- Cache relative app URLs under a GitHub Pages-style project path; serve cached navigation/assets with no network request.
- Keep failed service-worker installs inactive; activate an update only on the defined activation message; preserve unrelated caches.

`npm run build` produces the static `dist/` directory. Source JavaScript syntax and local asset references are checked separately. The shipped app has no runtime packages or remote font/script imports.

## Checks still requiring a browser/device

The remote browser preview could not be reached in this build environment. Accordingly, visual layout, native dialog focus behaviour, real IndexedDB browser persistence, real offline installation/update behaviour, downloads/import file picking, and screen-reader operation have **not** been verified in Chrome or Safari. DOM tests do not establish those browser guarantees.

The project is published at `https://eggypants.github.io/Chumlog/`. Version 1.1 deployment status is recorded in GitHub Actions. Browser/device limitations above still apply.

After publishing, use disposable test records to check:

1. On an iPhone-sized screen, add a person, edit every record type, complete/reopen dated items, search, and confirm that the layout does not scroll sideways. Repeat with enlarged text.
2. Close/reopen Safari and the Home Screen app to verify the records in the chosen context remain available. Test each context separately rather than assuming shared storage.
3. Export a backup, change a test record, import the backup, and confirm the expected replacement. Cancel both an import and a destructive confirmation.
4. Wait for Settings to show Available offline, enable airplane mode, reload, and add/edit a test record. Reconnect and confirm persistence.
5. Publish a small wording change, reopen the app, accept Reload, and confirm the update preserves records. Check behaviour with another tab open.
6. Use keyboard navigation and a screen reader to check field labels, focus trapping/return, visible focus, error announcements, and destructive confirmations.

The app starts with an empty database. Test fixtures are confined to `tests/` and are not copied to `dist/`.
