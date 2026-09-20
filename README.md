# Chumlog

Log your chums.

A small, static, device-local web app. People with optional emoji icons, notes, contact history, labelled important dates, reminders, sorting, random person, search, and manual JSON backup. No account, backend, analytics, remote fonts, push notifications, or runtime dependencies.

## Publish on GitHub Pages

1. Create a GitHub repository, with `main` as its default branch.
2. Add the **contents** of this `chumlog` folder to the repository root. Include `.github/workflows/pages.yml`, `app/`, `scripts/`, `tests/`, `package.json`, and `package-lock.json`. Do not upload the ZIP itself or put the project inside another `chumlog` folder in the repository.
3. In repository **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**.
4. In **Actions**, open **Deploy Chumlog to GitHub Pages** and select **Run workflow**. Later pushes to `main` run it automatically.
5. When deployment succeeds, open the URL shown in the workflow or the repository's Pages settings.

The workflow installs test-only dependencies, runs tests, builds `dist/`, and publishes only that static directory. No personal data is in the build or repository. There are no secrets to configure.

References: [GitHub Pages publishing settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [custom deployment workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

### Without a build workflow

The build also refreshes the generated app files and icons at the repository root to preserve the existing branch-published setup. Edit `app/`, not these generated copies. Both root publishing and the workflow artifact use the same assets and keep the existing database path.

The included `dist/` is already built. Copy its **contents**, including `.nojekyll`, to the root of a dedicated `gh-pages` branch. Choose **Deploy from a branch → gh-pages → /(root)** in Pages settings. When changing the app, run `npm run build` and replace that branch's published files with the new contents of `dist/`.

All asset URLs, the manifest, service-worker scope, and navigation are relative. Both `https://username.github.io/` and `https://username.github.io/repository-name/` work without a base-URL setting. Navigation uses URL fragments, so refreshing a profile does not require server rewrites or a custom 404 page.

### iPhone Home Screen

Open the final HTTPS URL in Safari. Use Safari's Share menu and **Add to Home Screen**. The manifest includes standalone display, icons, start URL, and scope. Offline use requires a successful first online load and service-worker installation. Settings displays the offline status.

Use one chosen installation/browser for your records. Different devices, browser profiles, and potentially separate installed/browser contexts have separate storage. Use Export/Import when moving data. The app does not synchronise these copies.

## Run locally

Node.js 22 or later:

```sh
npm run build
npm start
```

Open `http://localhost:4173/`. Do not double-click `index.html`: `file://` does not provide the required web-app environment. The build uses only Node's standard library; no installation is required to build or run the app.

To run the automated checks:

```sh
npm ci --ignore-scripts
npm test
```

`fake-indexeddb` and `happy-dom` are **test-only** development dependencies. They are not shipped in `dist/`, requested by the browser, or used to store real data.

## Edit interface wording

Edit **`app/strings.js`**, then run `npm run build`. All authored application strings, including validation messages, destructive confirmations, the tagline, version label, and no-JavaScript message, are centralised there. Dates and month names use the browser's locale. `manifest.webmanifest` receives the app name during the build. No sample people or example notes are inserted into the app.

Colours and layout are in `app/styles.css`. Icons and Home Screen images are local files in `app/icons/`.

## Local data and privacy

- IndexedDB is the authoritative data store. The database name is `chumlog:` followed by the app's deployment path. Path namespacing prevents accidental mixing between Chumlog deployments on one origin; it is not a security boundary against other code on that same origin.
- Relationship data is never sent to the host, a third party, or GitHub. The host receives ordinary requests for static app files. There are no data requests, accounts, cookies added by the app, analytics, third-party assets, or notifications.
- Records are not encrypted by Chumlog. Someone with access to this browser profile/device may be able to read them. JSON exports are also unencrypted. Save backup files somewhere appropriate for their contents.
- Clearing site data, private-browsing cleanup, browser eviction, device loss, or changing the website origin/path can make local records unavailable. **Manual export is the backup mechanism.** Test an export before relying on it.
- Changing the repository name, domain, deployment path, or chosen browser does not move the database. Export from the original location before moving and import at the new one.
- Delete person removes that person's associated records in one transaction. Delete all data clears the application's record stores in one transaction, while keeping the installed app files.

## Backup format, version 2

Export writes `chumlog-YYYY-MM-DD.backup.json`:

```json
{
  "app": "Chumlog",
  "schemaVersion": 2,
  "exportedAt": "2026-09-19T00:00:00.000Z",
  "data": {
    "people": [],
    "contacts": [],
    "notes": [],
    "importantDates": [],
    "reminders": []
  }
}
```

Every record has `id`, `createdAt`, and `updatedAt`. IDs are stable UUIDs for new records. Timestamp fields are UTC ISO strings with millisecond precision. Child records have `personId`.

| Collection | Additional fields |
| --- | --- |
| `people` | `name`: nonempty string, up to 200 characters; `emoji`: one emoji (including joined sequences) or `null` |
| `contacts` | `personId`; `date`: `YYYY-MM-DD`; `type`: `message`, `call`, `inPerson`, `other`, or `null`; `note`: string or `null` |
| `notes` | `personId`; `text`: nonempty string |
| `importantDates` | `personId`; `label`: nonempty string, up to 200 characters; `yearly`: boolean; `date`: `MM-DD` when yearly, otherwise `YYYY-MM-DD` |
| `reminders` | `personId`; `text`: nonempty string; `date`: `YYYY-MM-DD` or `null`; `time`: `HH:mm` or `null`; `completed`: boolean |

Text/note fields are limited to 10,000 characters. Yearly important dates omit years. Undated reminders have a null time. Calendar dates are local civil dates, not UTC instants. Reminder times are local wall-clock times; no timezone conversion or notification scheduling is performed. A 29 February birthday appears on 28 February in non-leap years.

`Last talked` is derived from the latest contact date. The People list uses “Last contact”. Coming up contains the next occurrence of each yearly important date, current/future one-off important dates, and every active dated reminder, ordered by date and optional time. Past active reminders remain under “Earlier”. Completed reminders are accessible under “Done” on the profile and can be reopened. Undated reminders remain on the profile. Past one-off important dates remain on the profile.

People default to alphabetical order. “Longest since contact” places people without logged contact first, followed by oldest last contact. “Most recently contacted” puts missing contact dates last. “Next upcoming date” uses the next date from today onward, excluding completed reminders and placing people without an upcoming item last. Ties use names. Sorting does not change any relationship data. Random person selects from the entire People list, independent of search or sorting.

### Import behaviour

Import supports **replacement only**, with a record-count preview, an Export action, and an explicit Replace data confirmation. Cancelling leaves current data untouched. It does not merge records.

Before any write, the importer validates the entire backup: app identifier, schema version, all required arrays/fields, dates, types, IDs, duplicate IDs, timestamps, and person references. Unknown fields are discarded. Unsupported versions, malformed files, files over 10 MB, or collections over 50,000 records are rejected.

Replacement runs in one IndexedDB transaction. A storage failure rolls the transaction back. A revision counter rejects a replacement if another tab changes data after the preview. Individual edits/deletions compare the original record to prevent stale windows silently overwriting changed or deleted records.

## Code map

| Path | Responsibility |
| --- | --- |
| `app/app.js` | Semantic DOM interface, navigation, forms, confirmations, import/export |
| `app/db.js` | IndexedDB schema, transactions, conflict protection, cascading deletion |
| `app/model.js` | Backup validation, dates, birthday recurrence, Coming up, Last talked |
| `app/strings.js` | Replaceable interface wording |
| `app/styles.css` | Palette, responsive layout, focus states, touch targets |
| `app/sw.js` | Offline app shell and update lifecycle |
| `scripts/build.mjs` | Static build, generated metadata, content-based service-worker release hash |
| `scripts/serve.mjs` | Local static server; also supports `/chumlog/` for subpath checks |
| `tests/` | Model, storage, DOM-flow, and service-worker logic tests |

IndexedDB schema version and export schema version are currently both 2.

### v1 → v1.1 migration

The version-1 database upgrades in one atomic IndexedDB transaction. Birthdays become yearly important dates labelled “Birthday”. Every `things` record becomes a reminder: `relevantDate` becomes `date` (including null), and `archived` becomes `completed`. Text, person links, created/updated timestamps and existing reminders are preserved. IDs are retained unless a thing collides with an existing reminder ID; only that migrated ID receives a fresh UUID. The old store is removed within the same transaction, and a failure rolls the entire upgrade back. Closing an older tab releases its database connection; stale version-1 code cannot write to the upgraded schema.

Version-1 JSON backups are fully validated before conversion and replacement. Export always writes version 2. Version-1 app builds cannot read the upgraded database or a version-2 backup. Do not deploy old app code as a schema rollback.

 Future database migrations belong in `openDB()`'s upgrade handler, gated on `oldVersion`; never delete a database to migrate it. Update `validateBackup()` deliberately when supporting another export version. The `meta` store holds only the local revision counter and is not part of an export.

## Offline updates

The build hashes all source assets into a release-specific cache name. Installation must cache the complete app shell before the new worker is eligible to activate. An existing worker continues to serve its complete release while the update waits. The interface offers Reload once an update is ready; it will not activate it from an open editing/confirmation dialog. Activation also happens normally once old tabs close. Updating checks run when the app becomes visible. Only this app's scoped caches are removed during activation, and IndexedDB is never deleted by the worker.

The app works without service-worker support as an ordinary online webpage. Production offline/install behaviour requires HTTPS (localhost is the development exception).

## Verification status

See `VERIFICATION.md`. Automated tests pass. Physical iPhone/Safari verification is separate from automated checks; this project does not claim those checks were performed.
