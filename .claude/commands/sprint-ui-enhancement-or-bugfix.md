---
name: sprint-ui-enhancement-or-bugfix
description: Workflow command scaffold for sprint-ui-enhancement-or-bugfix in refined-github-projects.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /sprint-ui-enhancement-or-bugfix

Use this workflow when working on **sprint-ui-enhancement-or-bugfix** in `refined-github-projects`.

## Goal

Making enhancements or bugfixes to sprint-related UI components and utilities, often in conjunction with modal changes.

## Common Files

- `src/features/sprint-injections.tsx`
- `src/features/sprint-modal.tsx`
- `src/features/sprint-progress-view.tsx`
- `src/features/sprint-settings-utils.ts`
- `src/features/sprint-settings-utils.test.ts`
- `src/features/sprint-settings-view.tsx`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Modify sprint UI components (src/features/sprint-*.tsx)
- Update sprint utility files and add/modify their tests (src/features/sprint-settings-utils.ts, src/features/sprint-settings-utils.test.ts)
- Update injection points or widgets (src/features/sprint-injections.tsx, src/features/sprint-table-widget.tsx)

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.