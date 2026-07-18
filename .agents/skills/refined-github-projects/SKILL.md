```markdown
# refined-github-projects Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `refined-github-projects` TypeScript codebase. You'll learn how to structure files, write imports and exports, follow commit conventions, and organize tests. This guide also provides suggested commands for common workflows, making it easy to contribute effectively.

## Coding Conventions

### File Naming
- Use **kebab-case** for all filenames.
  - **Example:**  
    ```
    project-list.ts
    github-api-client.ts
    ```

### Import Style
- Use **alias imports** for modules.
  - **Example:**
    ```typescript
    import { fetchProjects } from '@/api/github-api-client';
    ```

### Export Style
- Use **named exports** for functions, constants, and types.
  - **Example:**
    ```typescript
    export function fetchProjects() { ... }
    export const PROJECT_LIMIT = 10;
    export type Project = { ... };
    ```

### Commit Messages
- Follow the **Conventional Commits** format.
- Use the `feat` prefix for new features.
- Keep commit messages concise (average ~70 characters).
  - **Example:**
    ```
    feat: add filtering by project status
    ```

## Workflows

_No automated workflows detected in this repository._

## Testing Patterns

- Test files are named using the `*.test.*` pattern.
  - **Example:**
    ```
    project-list.test.ts
    ```
- The testing framework is not specified in the repository.
- Place test files alongside the modules they test or in a dedicated test directory.

  **Example test file:**
  ```typescript
  import { fetchProjects } from './project-list';

  describe('fetchProjects', () => {
    it('returns a list of projects', () => {
      // test implementation
    });
  });
  ```

## Commands

| Command | Purpose |
|---------|---------|
| /new-feature | Start a new feature (use `feat` in commit messages) |
| /test        | Run all test files matching `*.test.*`              |
| /lint        | Lint the codebase according to project conventions  |
```