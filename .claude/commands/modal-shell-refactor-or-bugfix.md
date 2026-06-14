---
name: modal-shell-refactor-or-bugfix
description: Workflow command scaffold for modal-shell-refactor-or-bugfix in refined-github-projects.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /modal-shell-refactor-or-bugfix

Use this workflow when working on **modal-shell-refactor-or-bugfix** in `refined-github-projects`.

## Goal

Refactoring or fixing modal-related UI components by updating shared modal shells, related modal components, and their tests.

## Common Files

- `src/ui/modal-shell.tsx`
- `src/features/bulk-actions-modals.tsx`
- `src/features/bulk-close-modal.tsx`
- `src/features/bulk-actions-bar.tsx`
- `src/features/bulk-*-modal.tsx`
- `src/ui/__tests__/modal-shell.test.tsx`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Update or refactor shared modal shell (src/ui/modal-shell.tsx)
- Update individual modal components (src/features/bulk-*-modal.tsx, src/features/bulk-actions-modals.tsx)
- Update or add tests for modal shell or modal logic (src/ui/__tests__/modal-shell.test.tsx, src/features/__tests__/*.test.tsx)
- Update related UI or utility files as needed (e.g., src/lib/modal-factory.tsx, src/features/bulk-actions-bar.tsx)

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.