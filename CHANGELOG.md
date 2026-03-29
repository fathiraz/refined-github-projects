# Changelog

## [0.3.0](https://github.com/fathiraz/refined-github-projects/compare/v0.2.1...v0.3.0) (2026-03-29)


### Features

* **bulk:** add bulk random assign functionality ([#13](https://github.com/fathiraz/refined-github-projects/issues/13)) ([3026706](https://github.com/fathiraz/refined-github-projects/commit/3026706ab844d54757f4c1d0c37d8a89295b6841))
* **hierarchy:** add issue hierarchy and project context support ([#11](https://github.com/fathiraz/refined-github-projects/issues/11)) ([7266693](https://github.com/fathiraz/refined-github-projects/commit/7266693be4301b589f59acc898185f273c583fae))
* **sprint:** add sprint progress tracking with scope change visibility ([#14](https://github.com/fathiraz/refined-github-projects/issues/14)) ([081d956](https://github.com/fathiraz/refined-github-projects/commit/081d9566a02b3d92c3c064c9eebaaa8dbdcc26d5))

## [0.2.1](https://github.com/fathiraz/refined-github-projects/compare/v0.2.0...v0.2.1) (2026-03-26)


### Bug Fixes

* **app:** permission for firefox and cookies permission ([#7](https://github.com/fathiraz/refined-github-projects/issues/7)) ([c181d50](https://github.com/fathiraz/refined-github-projects/commit/c181d50c905f1326133729a4d8b7d8c588a232ab))

## [0.2.0](https://github.com/fathiraz/refined-github-projects/compare/v0.1.4...v0.2.0) (2026-03-26)


### Features

* **ui:** add bulk issue relationship editing ([#3](https://github.com/fathiraz/refined-github-projects/issues/3)) ([bee5a5c](https://github.com/fathiraz/refined-github-projects/commit/bee5a5cbf2e014b63b6918e32843d70cbbde7f4d))
* **ui:** add guided bulk duplicate plan and relationship copying ([b91ce81](https://github.com/fathiraz/refined-github-projects/commit/b91ce8133ce08ab45e56af9aaa0792c7f0cd44b9))
* **ui:** add guided bulk duplicate plan and relationship copying ([8c07d1d](https://github.com/fathiraz/refined-github-projects/commit/8c07d1d6fa8e6d47cd012acb4e16ca3fe78d8a20))
* **ui:** add issue type selection and consolidate shared components ([8c07267](https://github.com/fathiraz/refined-github-projects/commit/8c072671e1a7704a95602875e6dca71af37d8ef1))

## [0.1.4](https://github.com/fathiraz/refined-github-projects/compare/v0.1.3...v0.1.4) (2026-03-24)

### Features

* **ui:** rebuild bulk-action flows into cleaner modal-based overlays and rework sprint controls into a more focused modal/widget flow ([570af66](https://github.com/fathiraz/refined-github-projects/commit/570af66))
* **sprint:** improve sprint group header loading and error states so active sprint status stays readable during updates ([b7d9c63](https://github.com/fathiraz/refined-github-projects/commit/b7d9c63))

### Improvements

* make tooltip, select-panel, shadow-DOM, and manifest resource handling more reliable as part of the overlay refresh

## [0.1.3](https://github.com/fathiraz/refined-github-projects/compare/v0.1.2...v0.1.3) (2026-03-23)

### CI

* **release:** update artifact upload paths from `.output/` to `dist/` to match WXT's build output directory ([042647f](https://github.com/fathiraz/refined-github-projects/commit/042647f))

## [0.1.2](https://github.com/fathiraz/refined-github-projects/compare/v0.1.1...v0.1.2) (2026-03-23)

### Features

* **sprint:** auto-inject `-is:closed -sprint:@current` when saving sprint settings and standardize sprint panel navigation with a shared step header ([c717184](https://github.com/fathiraz/refined-github-projects/commit/c717184), [17cc484](https://github.com/fathiraz/refined-github-projects/commit/17cc484))

### Refactors

* **project:** move source files into `src/`, move public assets into `static/`, rename `entrypoints/` to `src/entries/`, and normalize filenames to kebab-case ([b79a2ec](https://github.com/fathiraz/refined-github-projects/commit/b79a2ec))
* **ui:** migrate selection controls and setup cards to Primer React components, extract reusable eye icons, and improve driver.js theming ([78d2d1f](https://github.com/fathiraz/refined-github-projects/commit/78d2d1f), [dcd9257](https://github.com/fathiraz/refined-github-projects/commit/dcd9257), [ea4f3a5](https://github.com/fathiraz/refined-github-projects/commit/ea4f3a5))
* **ui:** centralize z-index constants and standardize button transitions/CSS variables across the UI ([120c9f7](https://github.com/fathiraz/refined-github-projects/commit/120c9f7))

### Documentation

* **docs:** add a static GitHub Pages landing page, refreshed screenshots/demo media, and a much more complete README ([0e4d54b](https://github.com/fathiraz/refined-github-projects/commit/0e4d54b), [90b95b5](https://github.com/fathiraz/refined-github-projects/commit/90b95b5), [7714704](https://github.com/fathiraz/refined-github-projects/commit/7714704), [4908129](https://github.com/fathiraz/refined-github-projects/commit/4908129), [6b21078](https://github.com/fathiraz/refined-github-projects/commit/6b21078), [4d7b970](https://github.com/fathiraz/refined-github-projects/commit/4d7b970), [bb40abd](https://github.com/fathiraz/refined-github-projects/commit/bb40abd))

### CI

* **pages:** add GitHub Pages deployment workflow and archive older screenshots ([dc63f3c](https://github.com/fathiraz/refined-github-projects/commit/dc63f3c))

## [0.1.1](https://github.com/fathiraz/refined-github-projects/compare/v0.1.0...v0.1.1) (2026-03-22)

### Bug Fixes

* **drag handles:** fix multi-select drag by using the checkbox cell as the drag source and snapshotting selected IDs at drag start ([76d1813](https://github.com/fathiraz/refined-github-projects/commit/76d1813))

### Features

* **duplicate:** add a WYSIWYG markdown editor for description fields in the bulk duplicate flow ([7f021c9](https://github.com/fathiraz/refined-github-projects/commit/7f021c9))
* **queue:** add richer human-readable detail text for bulk operations in the queue tracker ([1bc5048](https://github.com/fathiraz/refined-github-projects/commit/1bc5048))
* **sprint:** add centered modal layout, exclusion rules for migration, and a visible sprint progress indicator ([25c161c](https://github.com/fathiraz/refined-github-projects/commit/25c161c), [d016280](https://github.com/fathiraz/refined-github-projects/commit/d016280))

### Refactors

* **ui:** migrate tooltips from Primer to Tippy.js and enforce the flat design system ([0ded833](https://github.com/fathiraz/refined-github-projects/commit/0ded833))
* **bulk actions:** migrate the actions bar to Primer `ActionList` and `CounterLabel` ([a0fd4fc](https://github.com/fathiraz/refined-github-projects/commit/a0fd4fc))
* **bulk transfer:** adopt shared modal headers and Primer `Autocomplete` for repository selection ([8a1d4ec](https://github.com/fathiraz/refined-github-projects/commit/8a1d4ec), [daacb8f](https://github.com/fathiraz/refined-github-projects/commit/daacb8f))
* **duplicate:** rename `DeepDuplicateModal` to `BulkDuplicateModal` and reorganize bulk components ([bce736c](https://github.com/fathiraz/refined-github-projects/commit/bce736c), [1b364c1](https://github.com/fathiraz/refined-github-projects/commit/1b364c1))

### Documentation

* **readme:** overhaul installation guidance and refresh screenshots ([b16108d](https://github.com/fathiraz/refined-github-projects/commit/b16108d))

### CI

* **release:** attach browser ZIP assets to every published GitHub release ([0d3c4c8](https://github.com/fathiraz/refined-github-projects/commit/0d3c4c8))

## [0.1.0](https://github.com/fathiraz/refined-github-projects/releases/tag/v0.1.0) (2026-03-20)

> Initial public release of Refined GitHub Projects, a browser extension that adds bulk operations, deep duplication, drag-and-drop reorder, CSV export, and sprint management to GitHub Projects V2.

### Launch Highlights

* **extension:** scaffold the initial browser extension and wire up the first GraphQL-backed bulk-edit/reorder capabilities ([6570664](https://github.com/fathiraz/refined-github-projects/commit/6570664), [65fb0bf](https://github.com/fathiraz/refined-github-projects/commit/65fb0bf))
* inject a keyboard-driven action bar into the GitHub Projects table view so common multi-item workflows are available in place
* queue bulk operations with live progress and rate-limit awareness so GitHub PATs are not spammed during large updates

### Features

* add row and group selection with shortcuts for selecting, clearing, and opening the actions menu
* add a guided bulk edit flow for issue fields and project custom fields, including title, description, comments, assignees, labels, issue type, and common custom field types
* add bulk close, reopen, lock, pin/unpin, transfer, remove-from-project, rename, modal reorder, and drag-and-drop reorder actions
* add deep duplicate with project field cloning, relationship preservation, and automatic project reattachment
* add CSV export for visible project rows without requiring extra API calls
* add sprint management with active sprint tracking, end-sprint rollover, and iteration header badges

### Setup & Security

* support local setup with a GitHub PAT using `repo` and `project` scopes
* keep tokens in browser storage and call `api.github.com` directly, with no telemetry or third-party relay
