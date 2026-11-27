# Note

A Google Keep–style markdown note taking app for the Linux desktop and Android.
Notes are plain markdown files in a folder, either on this device or on a
WebDAV server so they sync between devices.

## Linux

Build the AppImage (or download it from a "Build apps" workflow run):

```sh
npm install
npm run dist
chmod +x apps/desktop/release/Note-*.AppImage
./apps/desktop/release/Note-*.AppImage
```

On first start, choose where to keep your notes:

- **This device**: a folder on your computer, `~/Documents/Notes` unless you
  pick another. Nothing is synced, so you can use any tool you like (Syncthing,
  a Git repository, a cloud drive's folder) to back it up or share it.
- **WebDAV server**: the URL of the WebDAV folder and your credentials. The
  password is encrypted with the system keyring; without a keyring it isn't
  saved and you're asked for it on each start.

You can switch at any time from Settings, between the two or to another folder
or server. Your notes are copied to the new location, and the old copies are
left where they were. A note that is already there is skipped if it's the
same, and kept alongside as `<name> (2).md` if it differs, so nothing is
overwritten. If the old location can't be read (say, the server is down),
the switch is cancelled; disconnect first to switch without your notes.

## Android

Needs Android 7 or later. Building needs JDK 21 and the Android SDK (platform
36), found through `JAVA_HOME` and `ANDROID_HOME`:

```sh
npm install
npm run apk
adb install apps/android/android/app/build/outputs/apk/debug/app-debug.apk
```

Notes kept on the device are stored in the app's own storage, in
`Android/data/io.github.daniebker.note/files/notes`, where you can reach them
over USB. Android deletes this folder when the app is uninstalled.

This is a debug build, signed with a key specific to the machine that built it,
so a build from elsewhere (including CI) can't update it in place. The password
is encrypted with a key held in the Android Keystore. Self-signed certificates
aren't trusted.

## Releases

Pushing a version tag builds the AppImage and a signed APK, and publishes them
as a GitHub release:

```sh
git tag v1.0.0
git push origin v1.0.0
```

Tags with a suffix, such as `v1.0.0-rc.1`, are marked as pre-releases.

The APK needs a signing key, set up once. Keep the keystore and its password
backed up somewhere safe: without them, installed copies can't be updated.

```sh
keytool -genkeypair -v -keystore note-release.keystore -alias note \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 note-release.keystore | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD   # the password you chose
gh secret set ANDROID_KEY_ALIAS --body note
gh secret set ANDROID_KEY_PASSWORD        # the same password
```

Don't commit the keystore.

## Note files

Each note is `<folder>/<name>.md`:

```markdown
---
title: Groceries
color: mint
pinned: false
archived: false
created: 2026-11-26T20:00:00.000Z
updated: 2026-11-26T20:00:00.000Z
---

The note body.
```

Markdown files added by other tools show up too; the frontmatter is optional and
unknown fields are preserved. Changes made elsewhere are loaded when the window
regains focus. Subfolders and hidden files are ignored.

## Development

```sh
npm run lint && npm run check-types && npm test   # tests need rclone
(cd apps/desktop && npm run dev)
(cd apps/android/android && ./gradlew testDebugUnitTest)   # after npm run apk
```

To try it without a server:
`rclone serve webdav ./webdav-data --addr localhost:8080`

## Moving from the web app

Copy the web app's SQLite database to your machine, then export its notes
(Node 22.13 or later):

```sh
node apps/desktop/scripts/export-legacy-notes.mjs note.db exported-notes
```

This writes one folder per user. Copy the contents of yours to your notes
folder, or upload them to the WebDAV folder.

## Layout

- `apps/desktop`: the Electron app
- `apps/android`: the Capacitor app and its native Java code
- `packages/notes`: the UI and note storage both apps share (the WebDAV and
  desktop folders; Android's is in `apps/android/src/local-folder.ts` and
  `LocalFolder.java`)
- `apps/docs`: Next.js starter app
- `packages/*`: shared UI, ESLint, Tailwind and TypeScript config
