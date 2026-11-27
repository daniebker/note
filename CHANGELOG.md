# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0-rc.1] - 2026-11-27

### Added

- Offline use with a WebDAV server. A copy of notes and attachments is kept on
  the device and synced in both directions, transferring only what changed.
  Conflicting edits are merged or kept as a second note.
- A sync button showing whether the device is up to date.
- Attach images and files, up to 25 MB each, to new or existing notes. They're
  saved in an `attachments` folder inside the notes folder and listed in each
  note's frontmatter.
- Images show on notes. Other attachments are listed by name. Opening one saves
  a copy on Linux and opens it in another app on Android.
- Deleting an attachment, or the note it's on, deletes the file, unless another
  note also lists it.
- Keep notes in a folder on this device, as an alternative to a WebDAV server.
  On Linux you can choose the folder; on Android it's in the app's own storage.
- Switching where notes are kept copies them, and their attachments, to the new
  location without overwriting anything. They can be moved instead.
- The project is licensed under the GNU Affero General Public License, version 3
  or later.

### Changed

- With a WebDAV server, the app reads and writes its copy on the device instead
  of the server directly.
- New installs suggest keeping notes on this device. Existing WebDAV settings
  carry over.

## [0.1.0-rc.1] - 2026-11-26

### Added

- Linux (AppImage) and Android apps.
- Notes stored as markdown files in a folder on a WebDAV server.
- A script to export notes from the old web app's database.
- Releases built and published from version tags.

### Removed

- **Breaking:** the web app, its accounts, public notes and server deployment.

[Unreleased]: https://github.com/daniebker/note/compare/v0.2.0-rc.1...HEAD
[0.2.0-rc.1]: https://github.com/daniebker/note/compare/v0.1.0-rc.1...v0.2.0-rc.1
[0.1.0-rc.1]: https://github.com/daniebker/note/releases/tag/v0.1.0-rc.1
