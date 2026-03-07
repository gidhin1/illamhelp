# Agent Rules For Detox Tests

These instructions are mandatory for any AI agent editing or creating files under this folder.

## Hard Rules

1. Use UI-only E2E behavior.
2. Drive all flows through the running mobile app UI.
3. Do not call backend APIs directly from Detox tests.
4. Do not use API clients in tests (`fetch`, `axios`, direct HTTP helpers, etc.).
5. Do not mock or bypass app networking for flow completion.
6. Do not import app source code into Detox tests to control runtime behavior.
7. Do not seed or mutate backend state from Detox test code.
8. Keep end-to-end realism: actions and transitions must happen from user interactions.

## Allowed Exception

1. Admin role setup can use backend/API helper only when strictly required and no UI path exists.

## Authoring Requirements

1. Interact with visible elements only after ensuring they are on-screen.
2. Use deterministic scrolling to the target element; do not rely on random retries.
3. Remove redundant wait/retry loops that duplicate the same check.
4. Keep helper logic simple and reusable; avoid nested retry-in-catch structures.
5. Improve reliability by fixing flow and selectors, not by stacking delays.
