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

## Live browser check (20 September 2026)

GitHub Actions passed all 24 automated tests, built version 1.1.0, and deployed successfully (commit `3fb45348c41589f0370076089f5076421e276800`). The live site was checked in remote Chrome at `https://eggypants.github.io/Chumlog/`.

A disposable person, birthday, completed undated thing and contact with no note were created using v1. After the service-worker Reload update, the birthday appeared under Important dates, the completed context remained under Reminders → Done, and the empty contact note was omitted. An emoji and a second important date were saved; Coming up displayed both labelled dates. People displayed Last contact and the sort selector; Random person opened the profile. Records persisted after a further refresh. Desktop layout was visually inspected.

## Checks still requiring a browser/device

Physical iPhone/Safari, narrow-viewport visual layout, screen-reader operation, and actual airplane-mode behaviour have not been verified. Export/import and offline logic have automated coverage; real browser file picking/download round trips remain unverified.

After publishing, use disposable test records to check:

1. On an iPhone-sized screen, add a person, edit every record type, complete/reopen dated items, search, and confirm that the layout does not scroll sideways. Repeat with enlarged text.
2. Close/reopen Safari and the Home Screen app to verify the records in the chosen context remain available. Test each context separately rather than assuming shared storage.
3. Export a backup, change a test record, import the backup, and confirm the expected replacement. Cancel both an import and a destructive confirmation.
4. Wait for Settings to show Available offline, enable airplane mode, reload, and add/edit a test record. Reconnect and confirm persistence.
5. Publish a small wording change, reopen the app, accept Reload, and confirm the update preserves records. Check behaviour with another tab open.
6. Use keyboard navigation and a screen reader to check field labels, focus trapping/return, visible focus, error announcements, and destructive confirmations.

The app starts with an empty database. Test fixtures are confined to `tests/` and are not copied to `dist/`.
