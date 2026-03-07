# Agent Rules For Playwright Tests

These instructions are mandatory for any AI agent editing or creating files under this folder.

## Hard Rules

1. Use UI-only E2E behavior.
2. Interact only with the hosted app URLs through browser actions.
3. Do not call backend APIs directly from tests.
4. Do not use API clients in tests (`request`, `APIRequestContext`, `fetch`, `axios`, `supertest`, etc.).
5. Do not mock or intercept network traffic (`page.route`, `context.route`, request stubbing, response rewriting).
6. Do not import code from app UI packages or source folders to drive assertions or behavior.
7. Do not bypass UI flows by seeding or mutating state from test code.
8. Keep tests end-to-end: state changes must happen via actual user interactions.

## Allowed Exception

1. Admin role setup can use backend/API helper only when strictly required and no UI path exists.

## Authoring Requirements

1. Prefer resilient selectors: role, label, placeholder, test id, visible text.
2. Avoid brittle selectors tied to implementation internals.
3. Keep waits minimal and deterministic; avoid redundant repeated waits.
4. Fix flaky behavior in page flows/selectors, not by adding long arbitrary timeouts.
5. When a flow fails, debug and fix the UI interaction path first.
