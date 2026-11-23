# Illamhelp platform UI

Web and admin import the shared MUI adapters through their existing local
`components/ui/primitives` modules. Native imports Paper-backed adapters from
`mobile/src/components.tsx`. Keep business logic and API calls in applications.

- Tokens: edit `packages/ui-tokens/tokens.json`, then run
  `corepack pnpm --filter @illamhelp/ui-tokens generate`.
- Theme: MUI and legacy CSS share `data-theme`. Web preference uses
  `illamhelp.theme.preference`; admin follows the system. Do not introduce
  another theme store or a global CssBaseline.
- Navigation: use each app's client `LinkButton` for button-shaped Next links.
  Never nest Button inside Link. Use ActionControl for custom button layouts.
- Forms: Field associates labels, hints and errors with TextInput, TextArea,
  SelectInput, or a direct native file input. Native props, refs and test IDs
  belong to the actual input. Button retains the original submit default;
  explicitly use `type="button"` for non-submit actions inside forms.
- Tables: TanStack owns state, MUI renders the desktop table; existing compact
  cards remain on narrow screens. Paginate large datasets.
- Custom media, gestures, drawers, platform file inputs, full-screen native
  modals and selection rows retain their domain behavior. Layout CSS is still
  part of the design system; these are intentional exceptions.
- Validation: root `test:ui:migration` expects web/admin production builds.
  Select `--project=chromium`, `--project=firefox`, or `--project=webkit`.
  Authenticated workflow suites additionally need the existing local backend.
- Shared source is typechecked by both consuming applications, covered by web
  adapter tests, and linted by this package's lint script using web's config.

Optional web components use explicit entry points: import Dialog from
`@illamhelp/ui-web/dialog` and DataTable from `@illamhelp/ui-web/data-table`.
Keep these out of the basic primitive barrel to avoid unnecessary shared code.

See the [UI release checks](../../docs/UI_STANDARD.md#release-validation) and
[native build notes](../../mobile/README.md#native-build-compatibility).
