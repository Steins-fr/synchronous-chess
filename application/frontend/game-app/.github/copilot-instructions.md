# Project Context

This is an Angular TypeScript project with the following characteristics:

## Technology Stack

- Angular 20
- TypeScript
- RxJS
- Angular Material

## Code Conventions

- Inject dependencies using `inject()` function
- Use `takeUntilDestroyed()` for subscription cleanup
- Input/Output uses `input()`, `model()` and `output()` signal function
- Follow Angular style guide naming conventions
- Use protected/private access modifiers appropriately
- Strict typing everywhere

## Project Structure

- Import shortcut `@app/*`for `src/app/*`
- Import shortcut `@testing/*` for `src/testing/*`

## Common Patterns

- Use enum constants for type safety

## Github Repository

- Mono-repo structure, the project is organized into multiple packages
  - Main Repository `synchronous-chess`
  - `application/frontend/game-app`: This Angular project;
  - `application/backend/websocket-api`: The backend WebSocket API project that is used for real-time communication;
- PR target branch: `master`
- To list commit messages, use the command:
  `git log origin/master..HEAD --oneline | head -20`
- Open in draft mode if there is a commit with the message "WIP" or "wip"
- When creating a PR, follow these steps:
    - Target branch: `master`
    - Use current branch as source branch
    - Add a title that summarizes the changes made
    - After creating the PR, output a clickable link to the PR.
    - Write the description with the following format:

```markdown
## Summary

Explain the changes made in this PR, including any new features, bug fixes, or improvements.

## Commits

Explain the 5 most important commits in this PR. They can be found in commit messages using terminal
command:
`git log origin/master..HEAD --oneline | head -20`
```
