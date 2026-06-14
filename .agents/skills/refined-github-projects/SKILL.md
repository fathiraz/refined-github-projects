```markdown
# refined-github-projects Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches you the core development patterns and workflows used in the `refined-github-projects` TypeScript codebase. You'll learn the project's coding conventions, how to approach common UI refactorings and enhancements (especially for modals and sprint features), and how to write and organize tests. This guide is ideal for contributors aiming to maintain consistency and efficiency in this repository.

## Coding Conventions

- **Language:** TypeScript
- **Framework:** None (vanilla React/TS)
- **File Naming:** Use kebab-case for all file names.
  - Example: `bulk-actions-bar.tsx`, `modal-shell.tsx`
- **Import Style:** Use alias imports for modules.
  ```typescript
  import { ModalShell } from '@/ui/modal-shell'
  ```
- **Export Style:** Use named exports (avoid default exports).
  ```typescript
  // Good
  export function BulkCloseModal() { ... }

  // Avoid
  // export default BulkCloseModal;
  ```
- **Commit Messages:** Follow conventional commits with type prefixes such as `fix` or `refactor`.
  - Example: `fix: correct modal closing behavior on escape key`
  - Example: `refactor: consolidate sprint modal logic`

## Workflows

### Modal Shell Refactor or Bugfix
**Trigger:** When you need to refactor, consolidate, or fix modal UI logic and behavior.  
**Command:** `/refactor-modal-shell`

1. **Update or Refactor Shared Modal Shell**
   - Edit `src/ui/modal-shell.tsx` to improve or fix modal logic.
2. **Update Individual Modal Components**
   - Modify files like `src/features/bulk-actions-modals.tsx`, `src/features/bulk-close-modal.tsx`, or any `src/features/bulk-*-modal.tsx` as needed.
3. **Update or Add Tests**
   - Ensure modal logic is covered in tests such as `src/ui/__tests__/modal-shell.test.tsx` and `src/features/__tests__/*.test.tsx`.
4. **Update Related UI or Utility Files**
   - Adjust supporting files like `src/lib/modal-factory.tsx` or `src/features/bulk-actions-bar.tsx` if modal usage changes.

**Example:**
```typescript
// src/ui/modal-shell.tsx
export function ModalShell({ isOpen, onClose, children }) {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content">{children}</div>
    </div>
  );
}
```

### Sprint UI Enhancement or Bugfix
**Trigger:** When you want to update, fix, or enhance sprint UI features or their underlying utilities.  
**Command:** `/update-sprint-ui`

1. **Modify Sprint UI Components**
   - Edit files like `src/features/sprint-modal.tsx`, `src/features/sprint-progress-view.tsx`, or any `src/features/sprint-*.tsx`.
2. **Update Sprint Utility Files and Tests**
   - Change logic in `src/features/sprint-settings-utils.ts` and ensure coverage in `src/features/sprint-settings-utils.test.ts`.
3. **Update Injection Points or Widgets**
   - Adjust files such as `src/features/sprint-injections.tsx` and `src/features/sprint-table-widget.tsx` to reflect UI or logic changes.

**Example:**
```typescript
// src/features/sprint-settings-utils.ts
export function calculateSprintProgress(issues: Issue[]) {
  const completed = issues.filter(i => i.closed).length;
  return completed / issues.length;
}
```

## Testing Patterns

- **Framework:** [Vitest](https://vitest.dev/)
- **Test File Pattern:** Name test files as `*.test.tsx` and place them alongside or within a `__tests__` directory.
- **Test Example:**
  ```typescript
  // src/ui/__tests__/modal-shell.test.tsx
  import { render } from '@testing-library/react'
  import { ModalShell } from '../modal-shell'

  test('renders children when open', () => {
    const { getByText } = render(
      <ModalShell isOpen={true} onClose={() => {}}>Hello</ModalShell>
    )
    expect(getByText('Hello')).toBeInTheDocument()
  })
  ```

## Commands

| Command                | Purpose                                                      |
|------------------------|--------------------------------------------------------------|
| /refactor-modal-shell  | Start a modal shell refactor or bugfix workflow              |
| /update-sprint-ui      | Begin a sprint UI enhancement or bugfix workflow             |
```
