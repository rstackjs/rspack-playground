# shadcn history drawer controls

## Goal

Replace the hand-positioned Dialog used by project history with the project's shadcn/Radix Drawer component. Replace the delete AlertDialog with a contextual shadcn/Radix Popover anchored to the delete button, so confirmation stays close to the user's pointer.

## Existing UI conventions

The project already uses shadcn-style components backed by Radix primitives (`dialog.tsx`, `select.tsx`, `alert-dialog.tsx`) and Tailwind CSS variables. Keep the same Radix component family and visual conventions rather than introducing Base UI primitives into only this feature.

## Design

### Shared UI components

- Add the standard shadcn `src/components/ui/drawer.tsx` wrapper around the Radix-compatible Drawer dependency, exporting `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerTitle`, `DrawerDescription`, `DrawerFooter`, `DrawerClose`, `DrawerOverlay`, `DrawerPortal`, and `DrawerTrigger` as appropriate.
- Add the standard shadcn `src/components/ui/popover.tsx` wrapper around `@radix-ui/react-popover`, exporting the root, trigger, content, anchor, header/title/description helpers needed by the feature.
- Add only the dependencies required by those standard components and update `pnpm-lock.yaml`.

### History drawer

- Use a controlled `<Drawer open={open} onOpenChange={onOpenChange}>`.
- Set the drawer swipe direction to `right` and keep the current full-height, right-side, responsive width behavior through `DrawerContent` classes.
- Move the current history header and scrollable list into `DrawerHeader` and the drawer content body. Keep the existing loading, empty, error, restore, and real-time refresh behavior.
- Preserve accessible `DrawerTitle` and `DrawerDescription`.

### Delete confirmation

- Remove `AlertDialog` and its modal confirmation state.
- For each history row, wrap the delete icon button in a controlled or row-local `Popover` with `PopoverTrigger asChild` and `PopoverContent` aligned to the end of the button.
- Put a concise confirmation message and Cancel/Delete actions in the Popover. Delete should call the existing async handler, close the popover, and preserve busy-state disabling/toasts.
- Keep the popover small and close to the delete control; it must not require moving the pointer to a centered modal.

## Acceptance criteria

1. `HistoryDrawer` imports and renders the shadcn Drawer component, not the existing Dialog for the side panel.
2. The drawer remains right-sided, full-height, accessible, and scrollable.
3. Delete confirmation uses a shadcn Popover anchored to each row's delete button and no AlertDialog remains in this flow.
4. Restore, delete, loading/error/empty states, active project selection, and history refresh behavior remain unchanged.
5. `pnpm lint:check`, `pnpm format:check`, `pnpm exec tsc --noEmit --ignoreDeprecations 6.0`, and `pnpm build` pass.

## Follow-up: reactive history updates

The history list must observe the Dexie table through its built-in `liveQuery()` API. The Drawer subscribes while open, so inserts, updates, and deletes update the list from the database without manually reloading or maintaining a separate change-notification set. The delete handler only performs the database mutation; the live query owns the UI refresh.

## Follow-up: manually start a new project

Set the history Drawer width to `30rem`. Add a compact plus button in the Drawer header for starting a new project. Clicking it clears `currentProjectIdAtom`, starts a bundle for the current source files so the existing save path creates a new history record, and closes the Drawer. The previous project remains in history; subsequent compiles update the newly created project. Starting the bundle also invalidates an older in-flight bundle request through the existing request-id mechanism.

## Follow-up: editable project titles

Add a persisted `title` field to each history record. Upgrade the Dexie schema and give existing/new records the default title `Untitled project`; subsequent source compiles preserve the title. Add `renameHistory()` to update only the title. In each Drawer row, display the title and place a pencil edit button immediately to its right. Editing is inline with a text input and save/cancel controls, rejects blank titles, and relies on the existing live query to update the row.

Acceptance criteria for this follow-up:

1. `HistoryDrawer` receives list updates from a Dexie live query rather than calling `listHistory()` in mutation callbacks.
2. The custom history subscriber/notification mechanism is removed.
3. Deleting an entry removes it from IndexedDB and the open Drawer automatically.

Acceptance criteria for this follow-up:

1. The right-side history Drawer is `30rem` wide while remaining responsive on small screens.
2. The header has an accessible plus button that starts a new project without deleting or overwriting the current history entry.
3. After starting a new project, the current source is saved as a new project and later compiles update that new project.

Acceptance criteria for this follow-up:

1. Existing records receive a default title through a Dexie schema migration, and new records persist the same default.
2. Each history item shows its title with an accessible edit button immediately beside it.
3. Saving a non-empty edited title persists it; canceling or submitting an empty title does not change the stored title.
