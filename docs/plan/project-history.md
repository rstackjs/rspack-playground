# Project history snapshots

> Superseded by [`project-history-single-project.md`](./project-history-single-project.md): the current design keeps one record per project and updates it on subsequent compiles.

## Goal

Add local project history to the Rspack Playground. After the user changes source files, the next compilation should persist a snapshot of the current project. Snapshots are stored in IndexedDB through Dexie, with source files compressed into a ZIP archive through zip.js. A header button opens a right-side drawer where the user can inspect, restore, or remove snapshots.

## Existing flow

- `inputFilesAtom` owns the editable `SourceFile[]`.
- `Editor` updates that atom for content edits, file creation/deletion, and renames, then calls `useBundle` through a 300 ms debounce.
- `bundleActionAtom` is the single compile entry point, including initial compilation, preset reset compilation, and Rspack version changes.
- `Header` owns the global controls and is the natural location for the history drawer trigger.

## Design

### Storage service

Create a small history persistence module under `src/lib/history.ts`:

- Define a Dexie database with a `history` table keyed by an auto-incrementing `id`.
- Store `createdAt`, the selected `rspackVersion`, the source `fileCount`, and an `archive` Blob.
- Build an archive with zip.js `ZipWriter`/`BlobWriter` and `TextReader`, adding each source file by its filename and excluding no editor source files.
- Read an archive with `ZipReader`/`BlobReader` and `TextWriter`, returning the original `SourceFile[]`.
- Expose list, save, restore, and delete operations. List newest snapshots first.
- Notify subscribers after writes/deletes so an already-open drawer refreshes without requiring a reopen.

The persistence module must keep ZIP and IndexedDB failures as rejected promises. Callers should surface failures as a toast and leave the editor state usable.

### Compile integration

Track whether the current editor state has been modified since its last recorded compile. The initial compile must not create a history entry. All editor file mutations, including create/delete/rename and preset reset, should mark the state dirty. A compile captures the dirty state and source array for that request; after the request completes for the current/latest state, it saves that source array with the Rspack version and clears the dirty flag only if the editor still points at that same source array. This prevents an edit made while a compile is running from being lost, and superseded compile requests must not clear the dirty flag.

Normal bundling results that contain compiler errors still represent a compile and should be eligible for history persistence. Persistence errors must not fail the bundle action.

Restoring a snapshot should replace the editor files and Rspack version, compile the restored state, and avoid immediately creating a duplicate snapshot for the restore operation.

### Drawer UI

Add a history icon button beside the existing header actions. The button opens an accessible right-side drawer built from the existing Radix Dialog primitives (or a small reusable sheet wrapper).

The drawer should:

- Load and display the newest records on open and refresh while open.
- Show a useful empty state, loading state, and error state.
- Display the snapshot time, Rspack version, and file count.
- Offer restore and delete actions for each record, with confirmation before deletion if needed.
- Close after a successful restore and use existing `sonner` toasts for success/failure feedback.

Keep the drawer responsive so it remains usable on narrow screens.

## Acceptance criteria

1. The project declares Dexie and `@zip.js/zip.js` dependencies and the lockfile is updated.
2. Loading the playground and its initial compile does not add a history record.
3. Editing, creating, deleting, or renaming a source file and waiting for compilation adds one ZIP-backed record for the compiled source state.
4. A failed IndexedDB/ZIP write does not break compilation and reports an error to the user.
5. The header history button opens a right-side drawer showing records newest-first, including an empty state when there are none.
6. Restoring a record reconstructs all source files, restores its Rspack version, recompiles, and does not create a redundant history entry.
7. Deleting a record removes it from IndexedDB and the open drawer immediately.
8. Existing download, share, reset, version switching, and editor behavior continue to work.

## Verification

Run the repository's available static checks and production build after implementation:

- `pnpm lint:check`
- `pnpm format:check`
- `pnpm build`

If the implementation adds focused tests, run those as well.
