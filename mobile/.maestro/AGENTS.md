# Agent Rules For Maestro Mobile Tests

These instructions are mandatory for any AI agent editing or creating files under this folder.

This file mirrors the intent and strictness of `/Users/gidhin1/Documents/claude_proj/illamhelp/tests/playwright/AGENTS.md`, adapted for Maestro and native mobile UI flows.

## Hard Rules

1. Use UI-only E2E behavior.
2. Interact only with the running native mobile app through visible UI actions.
3. Do not call backend APIs directly from tests.
4. Do not use API clients in tests (`fetch`, `axios`, direct HTTP helpers, shell curl calls, or similar).
5. Do not mock or intercept network traffic.
6. Do not import code from app source folders or packages to drive assertions or behavior.
7. Do not bypass UI flows by seeding or mutating state from test code.
8. Keep tests end-to-end: state changes must happen via actual user interactions.

## Allowed Exception

1. Admin role setup can use backend/API helper only when strictly required and no UI path exists.

## Authoring Requirements

1. Prefer resilient selectors: `testID` first, visible text second.
2. Avoid brittle selectors tied to implementation internals.
3. Keep waits minimal and deterministic; avoid redundant repeated waits.
4. Fix flaky behavior in flow paths and selectors, not by adding long arbitrary delays.
5. When a flow fails, debug and fix the UI interaction path first.
6. Interact only with elements that are actually visible and on-screen.
7. Use deterministic scrolling to the real target position; do not rely on retry pyramids or blind repeated swipes.
8. Keep helpers and subflows simple, reusable, and feature-scoped.
9. Keep flows independently runnable whenever practical.
