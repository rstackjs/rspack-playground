# Single-record project history

## Problem correction

The previous implementation treated every compile as a new history record. The required model is one IndexedDB record per project:

- Opening a new playground page starts a new project and creates one history record.
- Every later compile updates that record's ZIP archive and metadata.
- Restoring/selecting a history item switches the active project ID; later compiles update the selected record instead of creating another one.

## Design

### Project identity

Add a `currentProjectIdAtom: number | null` to the Jotai store. It starts as `null` on a fresh page load and is set to the ID returned by the first project save. It is set to the selected record's ID when a history item is restored. Deleting the active record clears the ID so the next compile can create a replacement project.

The initial compile is already triggered automatically when the editor mounts. Its first persistence operation creates the new project record, so the page opens with a history entry even if the user has not edited a file yet. Subsequent compile operations always save through the existing project ID, including compiles caused by source edits or Rspack version changes.

### Dexie and ZIP storage

Keep the existing Dexie database and zip.js archive format, but change the persistence API to accept an optional project ID:

- Create when the ID is `null`.
- Update the existing record when the ID is present, preserving `createdAt` and replacing the archive, `rspackVersion`, and `fileCount`.
- Add `updatedAt` and sort the drawer by it. Bump/migrate the Dexie schema so records created by the earlier implementation use `createdAt` as their initial `updatedAt`.
- If an active record was removed before an update reaches IndexedDB, fall back to creating a new record and return its new ID.

Persistence errors must be caught by the compile action, shown through the existing toast mechanism, and must not fail compilation.

### Compile and switch flow

Remove the dirty-only/new-record-per-compile behavior. The compile action captures the current project ID and, after the latest bundle result is accepted, saves the current source files into that project. It updates the atom with the returned ID only when the current project selection has not changed during the async operation, so a user switching history while a compile is in flight cannot be overwritten by an older request.

Restoring a history item should:

1. Unpack its ZIP and load the stored Rspack version.
2. Set the source files and `currentProjectIdAtom` to the selected record.
3. Compile normally so the selected record remains the persistence target.
4. Close the drawer after the restore succeeds.

Do not pass a `skipHistory` flag for restore; that would leave the project selection disconnected from normal compile persistence.

### Drawer behavior

Keep the existing right-side drawer, list, empty/loading/error states, restore action, and delete confirmation. Display each project's last updated time, Rspack version, and file count. When deleting the active project, clear `currentProjectIdAtom`.

## Acceptance criteria

1. A fresh page load creates exactly one history project when its automatic initial compile completes.
2. Editing and recompiling updates the same record ID; the drawer still contains one project entry rather than one entry per compile.
3. Rspack version changes also update the active project record.
4. Restoring a history item changes the active project ID and subsequent edits update that selected record.
5. Deleting the active project clears the selection; the next compile creates one new project.
6. Existing ZIP source round-tripping, error handling, and drawer UX continue to work.

## Verification

Run:

- `pnpm lint:check`
- `pnpm format:check`
- `pnpm exec tsc --noEmit --ignoreDeprecations 6.0`
- `pnpm build`
