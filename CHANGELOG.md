# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-06-12

- `pobo widget copyable [id]` — manage which element CSS classes are duplicatable in the editor (the per-element "+"/trash overlay). Supports `--list`, `--add`, `--remove`, `--set`, `--clear`, or an interactive checkbox built from the classes found in the widget's own HTML. Edits `widget.json` and syncs the server in one step.
- `widget.json` now carries an optional `copyable_class` array (defaults to `[]` for new scaffolds; existing manifests are read back-compatibly). `pobo widget push` ships it alongside the HTML/CSS.
- `pobo asset` command group (`list`, `create [file]`, `push`, `proxy [url]`, `delete [id]`) — manage an e-shop's global JS/CSS assets from local sources. SCSS compiles locally (same compiler as widget push); the compiled artifact is uploaded, sources stay in your git repository.
- `pobo asset create` without arguments runs an interactive wizard (e-shop → type → name) and scaffolds `assets/<eshop_id>/<slug>.scss|js`; with a file argument it registers an existing source. Creating is local-only — `pobo asset push` is the single deploy step.
- `pobo.json` manifest maps local source files to e-shop assets (one file can target multiple e-shops). `pobo asset push` updates every listed target and creates the ones without an `asset_id`, writing the new id back. Sources that compile to an empty artifact are rejected locally before any upload.
- CLI assets and admin-created assets are strictly separated — each side sees and manages only its own, while both end up in the same CDN bundle.
- `pobo asset proxy [url]` — live preview of the e-shop with your local assets injected in place of the deployed ones. CSS edits hot-swap without a reload (including `@use` partials), JS edits reload the page; `--no-open` skips the browser. Internal links are rewritten so you can browse the whole e-shop through the proxy with your local assets on every page.

## [2.0.0] - 2026-05-15

- `pobo widget ai <id> --image <path>` — generate widget HTML/SCSS from a design image (PNG/JPG/WebP, up to 5 MB).
- `pobo widget create` — interactive scaffold of a new widget on the server + local files. Creates a starter HTML widget and two stylesheets: `<slug>-<id>-core.scss` (production SCSS using CSS custom properties for every design token) and `<slug>-<id>-preview.css` (plain CSS mirror of those custom properties — edit values to retheme the widget inside the Pobo admin preview canvas).
- `pobo widget push` — compiles core SCSS to CSS and ships it with the preview CSS file (verbatim) in one call (production stylesheet + editor preview stylesheet).
- `pobo widget connect` / `disconnect` — connect/disconnect a widget to/from multiple e-shops at once.
- `pobo widget proxy` — live preview, auto-opens the URL in your browser (`--no-open` to skip).
- `pobo widget preview [id]` — opens the widget's preview page on Pobo in your browser. Override the host via `POBO_FRONTEND_URL` (defaults to `https://client.pobo.space`).
- `pobo auth login` — writes a `CLAUDE.md` to your current directory with widget rules + workflow for Claude Code.
- `pobo init` — re-create `CLAUDE.md` without logging in again.
- Interactive REPL — run `pobo` with no arguments to enter a shell with Tab autocomplete.

## [1.0.4] - 2026-05-09

### Fixed

- **Baked default API URL** corrected from `api.pbo.space` to `api.pobo.space`. Fresh installs now point at the correct production host out of the box. Existing installs that have an explicit `api_url` in `~/.pobo/config.json` are unaffected.

## [1.0.3] - 2026-05-09

### Changed

- **Public README** (`pobo-builder/pobo-cli` mirror) expanded with full command reference, quickstart, widget folder layout, HTML/CSS rules, troubleshooting table, and verify-this-build instructions. Drops the env-var configuration section since the production API URL is baked at build time.

## [1.0.2] - 2026-05-09

### Added

- `RELEASE.md` — internal release flow documentation (private to source repo, not shipped to npm tarball or public dist mirror).

## [1.0.1] - 2026-05-09

### Fixed

- **`pobo --version` and any version-aware code path** crashed with `ENOENT: no such file or directory ... @pobo/package.json` after a global install. Cause: CLI resolved `package.json` via a relative path that assumed the source `dist/<file>.js` layout, but the published tarball uses a flatten layout. The version is now baked at build time into `src/constants.generated.ts` (alongside the API URL), so no runtime filesystem lookup is needed.

## [1.0.0] - 2026-05-09

First public stable release.

### Added

- **Auth:** `pobo auth login` / `logout` / `me` (user info + connected eshops).
- **Widget management:**
  - `widget list` — table of your widgets (id, name, root_class, has_component).
  - `widget create` — interactive scaffold (API + local `widgets/<id>/`).
  - `widget show [id]` — server-side widget detail.
  - `widget push [id] [-y]` — compile SCSS, parse HTML, push to server.
  - `widget validate [id]` — server-side HTML validator with element tree output.
  - `widget connect [id]` — connect widget to an eshop (grouped picker by platform).
  - `widget disconnect [id] [-y]` — remove widget from an eshop.
  - `widget connections` — bulk overview matrix of widget × eshop.
  - `widget flush [id] [-y]` — delete widget elements (widget stays).
  - `widget delete [id] [-y]` — delete widget from server.
  - `widget proxy [url]` — live preview server with file watcher + SSE auto-reload (wizard mode if no URL; auto-fallback to next free port if 3001 is busy).
- **System:** `pobo doctor` — health check (env / config / connectivity / local widgets).
- **UX:**
  - Interactive widget pickers for both local (`push`/`validate`/`proxy`) and server (`delete`/`flush`/`connect`/`disconnect`/`show`) commands.
  - Eshop picker grouped by platform (Shopify / Shoptet / PrestaShop / Upgates / WordPress / Other).
  - All destructive `y/N` prompts replaced with explicit `select` ("No, cancel" / "Yes, …") to prevent muscle-memory accidents.
  - `cli-table3` rendering for `auth me`, `widget list`, `widget connections`, `doctor`, recursive help.
  - `ora` spinners during `widget push` pipeline.
- **Config:** `~/.pobo/config.json` (mode 0600 on POSIX), `POBO_API_URL` / `POBO_DEFAULT_API_URL` env, `.env` autoload via `dotenv/config` in the bin entrypoint.
- **Build:** TypeScript strict + NodeNext + `@/` path alias via `tsc-alias`. ESM-only.
- **Tests:** Vitest + MSW + `@inquirer/prompts` mocks. 157 tests, coverage 94 / 81.65 / 97.19 / 96.08 (statements / branches / functions / lines).
- **CI:** GitHub Actions matrix `{ubuntu, macos, windows} × Node {20, 22, 25}`.

### Requirements

- Node.js ≥ 20.12 (ESLint 10 needs `util.styleText`).
- A reachable Pobo Laravel API serving `/api/v3/cli/*`.

[1.0.0]: https://github.com/pobo-builder/pobo-cli/releases/tag/v1.0.0
