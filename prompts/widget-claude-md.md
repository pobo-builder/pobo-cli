# Pobo Widget Project

This directory uses [@pobo/cli](https://www.npmjs.com/package/@pobo/cli) to build widgets for [Pobo Page Builder](https://pobo.cz/). When the user asks you to create or modify a widget, follow the workflow below and respect the server-enforced rules — Pobo rejects widgets that don't comply.

There are two ways to author a widget. Pick the one that fits the request:

- **Path A — author locally.** You (Claude Code) write the HTML/SCSS into the scaffolded files based on the user's description or attached design. Best when the user wants full control, has a precise design in mind, or wants you to iterate on the markup interactively.
- **Path B — let the backend generate it.** The user runs `pobo widget ai <id> --image design.png`, which sends the image to Pobo's backend, which calls Claude API server-side and returns ready HTML/SCSS that the CLI writes into the scaffold. Best when the user has a flat design image and wants a one-shot generation. The backend uses the same rules as in this file, so the output is interchangeable with Path A.

Either path produces files in `widgets/<id>/` that the user then `push`es to the server.

---

## Path A — local authoring workflow

When the user attaches a design image (PNG, JPG) or describes a widget verbally and asks you to build it:

1. **Create the widget on the server.**
   - Run `pobo widget create` in a terminal. It asks for the widget name (use what the user provided or something descriptive) and whether to enable global typography (default: yes — accept unless the user specified otherwise).
   - The command prints the **widget ID**, **name**, and **root_class** (something like `pb-cli-2073-hero-banner`). Remember all three — they're needed everywhere below.
   - It also scaffolds `widgets/<id>/` with a starter `widget.json`, `<slug>-<id>.html`, `<slug>-<id>-core.scss`, and `<slug>-<id>-preview.css`. Core is the production SCSS (compiled to CSS for real e-shop pages); preview is a plain CSS file that holds editor-only CSS custom property overrides rendered in the Pobo admin canvas. Almost always you only edit core — the preview file is a theming hook you touch only when you specifically want a different look inside the admin editor.

2. **Write HTML and SCSS into the scaffold.**
   - Replace the placeholder content in `widgets/<id>/<slug>-<id>.html` and `<slug>-<id>-core.scss` with the actual widget markup. Leave `<slug>-<id>-preview.css` untouched unless the user specifically asks for editor-canvas overrides.
   - Use the **root_class** from step 1 as the single root element's class. Never invent your own root class.
   - Follow the rules in the "Server-enforced rules" section below — they are not negotiable.

3. **Validate locally before pushing.**
   - Run `pobo widget validate <id>` (or just `pobo widget validate` from inside `widgets/<id>/`). The server returns a list of allowed elements and any errors.
   - If the server returns errors, fix the HTML and validate again. Do not push markup the validator rejected.

4. **Push to the server.**
   - Run `pobo widget push <id>` (or `pobo widget push` from inside `widgets/<id>/`). This compiles core SCSS to CSS, reads the preview CSS file as-is, parses HTML, uploads elements, and uploads both CSS variants together (core compiled, preview verbatim).
   - For every e-shop the widget is already connected to, the server regenerates the consolidated CSS bundle on BunnyCDN automatically — the widget is live on those e-shop pages within seconds of push.
   - The push prints a success summary and offers a follow-up: connect to an e-shop.

5. **(Optional) Connect to one or more e-shops.**
   - Run `pobo widget connect <id>`. Uses a multi-select checkbox — Space to toggle, Enter to confirm.
   - On every connect, disconnect, and delete, the server regenerates the affected e-shop's CSS bundle on BunnyCDN. No manual cache busting needed.

---

## Path B — backend AI generation (`pobo widget ai`)

The CLI command `pobo widget ai <id> --image <path>` posts the image to Pobo's backend, which calls Claude API server-side using the same rules in this file and returns HTML/SCSS that the CLI writes into the scaffold. After that, the flow is identical to Path A from step 3 onwards (validate → push → connect).

### CLI command

```bash
pobo widget ai <id> --image design.png
```

- `<id>` — widget ID from a prior `pobo widget create`. Resolves automatically when run from inside `widgets/<id>/`.
- `--image <path>` — local file. Must be PNG, JPG, or WebP, ≤ 5 MB.
- After success the CLI writes HTML to `widgets/<id>/<slug>-<id>.html` and SCSS to `widgets/<id>/<slug>-<id>-core.scss`, overwriting the placeholder content. The preview file (`<slug>-<id>-preview.scss`) is never touched by `widget ai` — Claude only returns one stylesheet. If the html / core scss files have non-placeholder content, the CLI asks the user to confirm overwrite.

### Backend API contract

The CLI calls a single POST endpoint:

```
POST /api/v3/cli/widget/{id}/ai
Host:           api.pobo.space  (production) / api.pobo.dev (develop)
Authorization:  Bearer <cli_token>     // same CLI token used by all /widget/* endpoints
Content-Type:   multipart/form-data
```

**Request body (multipart fields):**

| Field   | Type   | Required | Notes                                              |
|---------|--------|----------|----------------------------------------------------|
| `image` | file   | yes      | PNG / JPG / WebP, ≤ 5 MB. Magic-byte checked.      |

There is no `brief` or `prompt` field — the system prompt + user-message template are fixed server-side. The widget's existing `root_class` (already in the DB from `pobo widget create`) is injected into the prompt by the backend.

**Success response — 200 OK:**

```json
{
  "html": "<div class=\"pb-cli-2073-hero-banner\">…</div>",
  "scss": ".pb-cli-2073-hero-banner { … }",
  "ai": {
    "model": "claude-opus-4-7",
    "tokens_in": 1850,
    "tokens_out": 1200,
    "tokens_cached_read": 1500,
    "tokens_cached_write": 0,
    "duration_ms": 18500
  }
}
```

The CLI writes `html` and `scss` verbatim into the scaffold files. The `ai` block is informational — display tokens and duration to the user, do not persist.

**Error responses (Pobo error envelope):**

| Status | Body shape                                              | Meaning                                                                                                                              |
|--------|---------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `400`  | `{"message": "Image file is required."}`                                            | The `image` form field was missing from the request.                                                                                |
| `401`  | `{"message": "Unauthorized"}`                                                       | Invalid or missing CLI token (standard `cli.token` middleware).                                                                     |
| `404`  | `{"message": "Widget not found"}`                                                   | Widget ID doesn't exist or is not owned by the current user.                                                                        |
| `422`  | `{"message": "Image must be PNG, JPG, or WebP.", "errors": {"image": [...]}}`       | Laravel validation: wrong mime, >5 MB, missing/corrupt file. `errors.image[]` contains the per-rule message.                        |
| `422`  | `{"message": "Claude failed to generate valid output. Please retry."}`              | Claude API responded but did not call the `widget_generator` tool, or the tool call lacked `html`/`scss`. CLI should suggest retry. |
| `503`  | `{"message": "Claude API is currently unavailable. Please retry later."}`           | Anthropic returned 5xx, network failure, or server-side timeout (60s). CLI should suggest retry.                                    |

Typical end-to-end duration is **15–25 seconds** (vision + structured tool output). Display a spinner; do not time out client-side under 60s.

### When to suggest Path B to the user

- The user attaches a design image and explicitly asks "generate this widget" or similar.
- The user wants a one-shot draft they can then refine manually (call Path B, edit files, then `pobo widget validate` + `push`).

When the user describes a widget in words (no image), prefer Path A — image is required for Path B.

---

## Pobo CLI commands you'll use

```
pobo widget create               Create a widget on the server + local scaffold
pobo widget ai <id> --image …    Generate widget HTML/SCSS server-side via Claude (Path B)
pobo widget list                 List your widgets
pobo widget show <id>            Server-side widget detail (JSON)
pobo widget validate <id>        Validate HTML against server rules
pobo widget push <id>            Compile SCSS + upload HTML/CSS
pobo widget connect <id>         Connect widget to e-shops (multi-select)
pobo widget disconnect <id>      Disconnect from e-shops (multi-select)
pobo widget connections          Show all widget × e-shop connections
pobo widget preview <id>         Open the widget's preview page on Pobo in your browser
pobo widget proxy                Live preview a widget on a real e-shop page (browser auto-opens)
pobo widget delete <id> -y       Delete from server
pobo doctor                      Health check (env / config / connectivity / local widgets)
pobo auth me                     Current user info + e-shop list
```

All commands accept `--help`. Commands with `<id>` resolve automatically when run from inside `widgets/<id>/`.

## E-shop assets (`pobo asset`) — global JS/CSS

Besides widgets, the CLI manages an e-shop's global stylesheets and scripts (served on every page of the e-shop). Sources live in this repository; the mapping to e-shops is in `pobo.json` (plain JSON, no comments). SCSS compiles locally on push — multi-file `@use` partials are fine.

```
pobo asset create                Scaffold a new asset (wizard: e-shop → type → name) into assets/<eshop_id>/
pobo asset create <file>         Register an existing SCSS/CSS/JS file in pobo.json
pobo asset push                  Deploy: compile + upload every target listed in pobo.json
pobo asset proxy                 Live preview the e-shop with local assets (CSS hot reload, browse-through)
pobo asset list                  List CLI-managed assets of an e-shop
pobo asset delete [id] -y        Delete from server + remove the manifest target
```

Asset workflow: `pobo asset create` (or edit `pobo.json` by hand — a target with only `eshop_id` is created on the next push) → write styles/code → `pobo asset push`. `create` never deploys; `push` is the single deploy step. The compiled artifact must stay under 256 KB, and a source that compiles to empty output is rejected locally. Widget rules below do NOT apply to assets — assets are your own custom code.

---

<!--
  The "Server-enforced rules" + "Output format" + "Example" sections below are a
  verbatim mirror of prompts/widget-rules.md, which is the canonical ruleset.
  Claude Code cannot follow file references, so the rules are inlined here.
  When editing one, edit the other — same rules, two consumers.
-->

# Server-enforced rules

## Allowed HTML tags

`div`, `a`, `h1`, `h2`, `h3`, `h4`, `p`, `ul`, `li`, `span`, `img`, `textarea`, `aside`

**Anything else** (`section`, `button`, `header`, `footer`, `nav`, `article`, `figure`, `picture`, `svg`, `video`, `input`, `form`, `table`, `b`, `strong`, `em`, `i`, `br`, `hr`, …) is rejected. Use `<div>` with semantic class names instead.

### `<li>` content restriction

A `<li>` element may only contain **plain text** — no nested tags (no `<span>`, `<a>`, `<img>`, no nested `<ul>` or `<li>` inside).

**Why:** the Pobo Page Builder UI replaces every `<ul>` block with a single `<textarea>` where each line becomes one `<li>`. Any markup nested inside `<li>` is lost on the first edit. If you need styled, linked, or media-rich list items, build them as `<div>` siblings with a class like `__item` instead of using `<ul>`/`<li>`.

### `<span>` and heading content restriction

`<span>`, `<h2>`, `<h3>`, and `<h4>` may only contain **plain text** — no nested tags.

In particular:

- A `<span>` must NOT contain another `<span>` (no `<span><span>…</span></span>`).
- An `<h2>`, `<h3>`, or `<h4>` must NOT contain a `<span>` (no `<h2>Foo <span>bar</span></h2>`).

**Why:** all four are leaf text containers in the Pobo Page Builder (direct text edit, no rich-text controls). Nesting another text element inside breaks the editor — the merchant sees overlapping edit handles and the nested element is silently dropped on first save.

**Avoid:**

```html
<span class="...__outer">Lorem <span class="...__inner">ipsum</span> dolor</span>
<h2 class="...__title">Foo <span class="...__highlight">bar</span></h2>
<h3 class="...__subtitle"><span>Wrap</span></h3>
```

**Good — flatten to a single text element:**

```html
<span class="...__outer">Lorem ipsum dolor</span>
<h2 class="...__title">Foo bar</h2>
<h3 class="...__subtitle">Wrap</h3>
```

If the design highlights a fragment of a heading (e.g., a colored last word, an inline counter badge), use a single style on the whole heading or move the fragment to a sibling element with its own class. The Pobo Page Builder doesn't support per-fragment styling on leaf text elements.

### `<a>` is a button, not a wrapper

`<a>` represents a **button CTA** in the Pobo Page Builder UI — a styled clickable element with a short button label.

**Hard rules:**

- `<a>` may only contain **plain text** — no nested tags whatsoever (no `<span>`, no `<img>`, no `<div>`, no headings). The Pobo Page Builder strips any nested markup inside `<a>` on the merchant's first edit, leaving only the text.
- `<a>` must NOT wrap images, headings, paragraphs, or multi-element composites — that responsibility belongs to the merchant via the Page Builder UI.
- `<a>` is the only allowed clickable element — there is no `<button>` tag.
- Style `<a>` in SCSS as a button (padding, background, border-radius, hover state).
- Only emit an `<a>` when the design shows an actual button. Do not invent CTAs the design doesn't have.
- For navigation without a destination, use `href="#"` as a placeholder — never invent fake URLs.

**Why:** the Pobo Page Builder gives the merchant separate UI controls to make an image a link (the photo picker has a "linked URL" option) and to link text fragments (text editor link tool). Wrapping a card or image in `<a>` removes the merchant's ability to manage those links independently. Additionally, the builder normalizes `<a>` content to plain text on edit; any nested `<span>`, `<img>`, or `<div>` is silently discarded.

**Good — plain-text CTA button:**

```html
<a class="pb-cli-320-card__cta" href="/category/headphones">Shop now</a>
```

**Good — card with separate photo + heading + button siblings:**

```html
<div class="pb-cli-320-card">
    <div class="pb-cli-320-card__photo">
        <img class="pb-cli-320-card__image" src="/headphones.jpg" alt="Headphones">
    </div>
    <h3 class="pb-cli-320-card__title">Headphones</h3>
    <a class="pb-cli-320-card__cta" href="/category/headphones">Shop now</a>
</div>
```

**Good — card without a button (design shows none):**

```html
<div class="pb-cli-320-card">
    <div class="pb-cli-320-card__photo">
        <img class="pb-cli-320-card__image" src="/headphones.jpg" alt="Headphones">
    </div>
    <h3 class="pb-cli-320-card__title">Headphones</h3>
</div>
```

**Avoid — `<a>` containing any markup (all stripped to plain text on edit):**

```html
<a href="/x">Shop <span class="highlight">now</span></a>
<a href="/x"><img src="..."> Shop</a>
<a class="card" href="/x"><div class="photo"><img ...></div><h3>…</h3></a>
```

### `<img>` wrapping requirement

Every `<img>` element must be a child of a `<div>` whose class declares `position: relative` in the SCSS.

**Why:** the Pobo Page Builder overlays a "select photo" picker button on top of every image. That overlay is absolutely positioned and needs a `position: relative` ancestor to anchor against. Without the wrapper, the picker drifts to the nearest positioned element (often the page body), breaking the click target.

The wrapper can be the widget root `<div>` itself when the widget is essentially just an image. For widgets that mix images with other content, use a dedicated `__photo` (or similar) wrapper:

```html
<div class="pb-cli-320-hero">
    <div class="pb-cli-320-hero__photo">
        <img class="pb-cli-320-hero__image" src="https://picsum.photos/800/600" alt="Spring collection">
    </div>
    <h2 class="pb-cli-320-hero__title">…</h2>
</div>
```

```scss
.pb-cli-320-hero {
    &__photo {
        position: relative;   // required — anchors the photo picker overlay
    }
    &__image {
        width: 100%;
        height: auto;
    }
}
```

### Placeholder image URLs

Always use **Lorem Picsum** as the `src` for every `<img>` so the widget renders with realistic visuals during the merchant's preview before they upload their own assets:

```html
<img class="..." src="https://picsum.photos/800/600" alt="Spring collection lifestyle photo">
```

Pick dimensions that match the slot in the design — e.g. `https://picsum.photos/1200/600` for a wide hero, `https://picsum.photos/400/400` for a square card thumbnail, `https://picsum.photos/600/800` for a portrait. The merchant replaces these via the Pobo Page Builder photo picker once they have real assets.

**Never** use paths like `/images/headphones.jpg` or `/hero.png` — those don't resolve on the merchant's e-shop and the preview shows broken images.

Write a descriptive `alt` that names the intended subject (product type, scene, mood) — the merchant uses it both for accessibility and as a hint for what to upload.

## Text container choice

Each text-bearing tag renders a different editor in the Pobo Page Builder UI. Pick the lightest container that fits the content.

| Tag | Editor | Use for |
|---|---|---|
| `<h2>`, `<h3>`, `<h4>` | direct text edit, no formatting controls | Actual headings (section titles, card titles, callout labels) |
| `<span>` | direct text edit, no formatting controls | Short standalone text — captions, taglines, subtitles, single-sentence callouts |
| `<p>` | heavyweight WYSIWYG (toolbar, lists, nested headings) | Multi-sentence body prose |
| `<aside>` | rich-text WYSIWYG (lists, multiple paragraphs, nested headings) | Editorial content blocks |

**Decision rule:**

- One short line or sentence of text → `<span>` (apply `display: block` in SCSS if you need block-level layout, plus margin/text-align as needed). Use `<h2>`/`<h3>`/`<h4>` if the text is semantically a heading.
- Multi-sentence body prose with potential formatting → `<p>`.
- Rich editorial block with multiple paragraphs, lists, nested headings → `<aside>`.

**Critical — `<p>` and `<aside>` must NOT have a `class` attribute:**

`<p>` and `<aside>` are WYSIWYG editors. The merchant can freely re-format their content — convert `<p>` to `<h2>`, split into multiple paragraphs, add lists, nest headings. A class on `<p>` or `<aside>` itself is unreliable (it doesn't survive those transformations), and the merchant cannot assign classes to the nested elements either.

**Pattern: wrap the WYSIWYG editor element in a classed `<div>` and style via descendant selectors.**

**Avoid:**

```html
<p class="...__lead">Sed ut perspiciatis…</p>
<aside class="...__editorial">Rich content with multiple paragraphs…</aside>
```

**Good:**

```html
<div class="...__lead">
    <p>Sed ut perspiciatis…</p>
</div>

<div class="...__editorial">
    <aside>Rich editorial content with lists and nested headings…</aside>
</div>
```

```scss
.pb-cli-{ID}-{SLUG} {
    &__lead {
        max-width: 60ch;
        margin: 0 auto;
        p { line-height: 1.6; font-size: 1.125rem; }
    }

    &__editorial {
        h2 { font-size: 1.5rem; margin: 0 0 0.5rem; }
        p  { line-height: 1.5; margin: 0 0 0.75rem; }
        ul { padding-left: 1.2rem; }
        a  { color: var(--primary); text-decoration: underline; }
    }
}
```

Descendant selectors (`&__lead p`, `&__editorial h2`, etc.) survive the merchant's edits because the wrapping `<div>` and its class are untouched by the WYSIWYG controls.

**Avoid using `<p>` or `<aside>` for one-line text.** They trigger a disproportionate WYSIWYG editor AND require an extra wrapping `<div>` for styling. For one-line text, `<span>` (or a heading tag) gives the merchant a direct edit field with no overhead and one classable element you can style cleanly via `&__name`.

## Allowed attributes

| Tag      | Attributes (case-sensitive)                       |
|----------|---------------------------------------------------|
| (any)    | `class`                                           |
| `<a>`    | `class`, `href`                                   |
| `<img>`  | `class`, `src`, `alt`, `title`, `width`, `height` |

Any other attribute (`id`, `style`, `data-*`, `role`, `aria-*`, `target`, `rel`, `name`, `type`, `value`, `placeholder`, `loading`, …) is rejected.

## Allowed URL schemes

For `<a href="...">`:

- `http://...`
- `https://...`
- `mailto:...`
- absolute path starting with `/` (e.g. `/contact`)

For `<img src="...">`:

- `http://...`
- `https://...`
- absolute path starting with `/` (e.g. `/images/hero.png`)

`mailto:` is valid **only for `href`**, never for `src`. `javascript:`, `data:`, `file:`, `vbscript:`, relative paths without a leading slash, and protocol-relative `//foo` are rejected for both attributes.

## Forbidden HTML constructs

- `<script>`, `<style>` — anywhere, even self-closing
- HTML comments `<!-- ... -->`
- CDATA `<![CDATA[ ... ]]>`
- Inline event handlers — `onclick=`, `onload=`, `onerror=`, anything `on*`
- Inline `style="..."` attribute (style belongs in SCSS)
- Conditional comments `<!--[if IE]>...`

## Size and count limits

| Limit                      | Maximum         |
|----------------------------|-----------------|
| HTML byte size             | 65,535 B        |
| Element count              | 500             |
| Text content (per node)    | 5,000 chars     |
| URL length (`href`/`src`)  | 2,048 chars     |

Most widgets have 5–30 elements. Keep them small.

## SCSS rules

- The SCSS file is real Sass — nested selectors, `&__element`, `&--modifier`, `$variables`, and basic functions (`darken`, `lighten`, `rgba`) all work.
- The CLI compiles it with `sass` to compressed CSS during push. The compiled CSS is what the validator checks.

**Forbidden in the compiled CSS:**
- `@import` in any form — including CSS escape sequences like `\@import` or `@\69mport`. Inline all rules into this one widget.
- `expression(` (legacy IE)
- `javascript:`, `vbscript:` URLs
- `behavior:` property
- `-moz-binding` property
- Top-level universal selectors — `*`, `*::before`, `*::after`, `*:hover`, etc. They match every element on the host e-shop page (header, products, cart, footer), not just the widget. Common offenders to avoid:
  ```scss
  *, *::before, *::after { box-sizing: border-box; }   // BAD — resets entire host page
  * { margin: 0; padding: 0; }                          // BAD
  ```
  If you genuinely need such a reset, scope it under the widget root: `.<root_class> *, .<root_class> *::before, .<root_class> *::after { ... }`. In practice, almost no widget needs a universal reset — set `box-sizing`, margins, and paddings explicitly on the elements that need them.

**CSS `url()` constraint — only relative or absolute-path URLs:**

- ✓ `url("/local/icon.png")` — absolute path on the host e-shop
- ✓ `url("./icon.png")`, `url("icon.png")` — relative path
- ✗ `url("https://cdn.example.com/img.png")` — absolute URL with scheme
- ✗ `url("//evil.tld/img.png")` — protocol-relative
- ✗ `url("data:image/svg+xml,...")` — data URI

The widget CSS ships to BunnyCDN and loads on customer e-shop pages. External URLs would enable CSS-based exfiltration (visitor tracking, attribute-selector keyloggers against form fields). Use paths that resolve on the host e-shop, or upload assets through the e-shop's own asset system before referencing them by absolute path.

## Style conventions

- Root selector: `.<root_class> { ... }` — everything else nests inside.
- BEM-style: `&__element` for sub-parts, `&--modifier` for variants.
- Mobile-first: write base styles for narrow viewports, scale up with `@media (min-width: …)`.
- Prefer `rem` / `em` over `px` for typography; `px` is fine for borders/shadows.
- Don't reset every browser default. The host page already has its CSS — set only what the widget needs.

---

# Output format

The **HTML must have exactly one root element** — a `<div class="<root_class>">` — and the **SCSS must scope every rule under that root class** (`.<root_class> { ... }`). No global selectors.

When you generate output that fails `pobo widget validate`, read the error list carefully and fix only what's flagged — keep the rest of the structure intact.

---

# Example: small hero banner

For a widget with `id=320`, `name=Hero banner`, `root_class=pb-cli-320-hero-banner`:

`widgets/320/hero-banner-320.html`:

```html
<div class="pb-cli-320-hero-banner">
    <h2 class="pb-cli-320-hero-banner__title">Discover our new collection</h2>
    <span class="pb-cli-320-hero-banner__text">Hand-picked pieces for the season ahead.</span>
    <a class="pb-cli-320-hero-banner__cta" href="/collections/new">Shop now</a>

    <h2 class="pb-cli-320-hero-banner__feature-title">Made to last</h2>
    <p class="pb-cli-320-hero-banner__feature-text">Every piece is cut from sustainable materials and finished by hand, so it stays in your wardrobe for seasons — not weeks.</p>
</div>
```

`widgets/320/hero-banner-320-core.scss`:

```scss
.pb-cli-320-hero-banner {
    // Design tokens — scoped to the root so they never leak into the host page.
    // Override these in -preview.css to retheme the widget inside the Pobo admin canvas.
    --hero-bg: linear-gradient(135deg, #f8f4ee, #ece2d0);
    --hero-padding: 2rem 1.5rem;
    --hero-radius: 6px;
    --hero-color-fg: #2a2520;
    --hero-color-muted: #5a4f44;
    --hero-color-cta-bg: #2a2520;
    --hero-color-cta-bg-hover: #1a1510;
    --hero-color-cta-fg: #ffffff;
    --hero-title-size: 1.75rem;
    --hero-text-size: 1rem;
    --hero-feature-title-size: 1.25rem;
    --hero-feature-divider: 1px solid rgba(42, 37, 32, 0.12);

    padding: var(--hero-padding);
    text-align: center;
    background: var(--hero-bg);
    border-radius: var(--hero-radius);

    &__title {
        font-size: var(--hero-title-size);
        font-weight: 700;
        color: var(--hero-color-fg);
        margin: 0 0 0.75rem;
        line-height: 1.2;
    }

    &__text {
        display: block;
        font-size: var(--hero-text-size);
        color: var(--hero-color-muted);
        margin: 0 0 1.5rem;
        line-height: 1.5;
    }

    &__cta {
        display: inline-block;
        padding: 0.875rem 2rem;
        background: var(--hero-color-cta-bg);
        color: var(--hero-color-cta-fg);
        text-decoration: none;
        font-weight: 600;
        border-radius: calc(var(--hero-radius) - 2px);

        &:hover {
            background: var(--hero-color-cta-bg-hover);
        }
    }

    &__feature-title {
        font-size: var(--hero-feature-title-size);
        font-weight: 600;
        color: var(--hero-color-fg);
        margin: 2rem 0 0.5rem;
        padding-top: 1.5rem;
        border-top: var(--hero-feature-divider);
        line-height: 1.3;
    }

    &__feature-text {
        font-size: var(--hero-text-size);
        color: var(--hero-color-muted);
        margin: 0;
        line-height: 1.6;
    }

    @media (min-width: 768px) {
        --hero-padding: 4rem 2rem;
        --hero-title-size: 2.5rem;
        --hero-feature-title-size: 1.5rem;
    }
}
```

`widgets/320/hero-banner-320-preview.css` (plain CSS — no SCSS syntax, no compile step):

```css
/* Editor preview overrides. Selector is scoped under .widget-preview-panel
   so these rules only match inside the Pobo admin preview canvas (the wrapper
   is absent on production e-shop pages) AND win over the widget's own root
   declarations by specificity (2 classes vs 1). */
.widget-preview-panel .pb-cli-320-hero-banner {
    /* Tighten layout so the widget fits cleanly inside the editor iframe. */
    --hero-padding: 1rem 1.25rem;
    --hero-title-size: 1.25rem;

    /* Soft outline to make the widget boundaries visible while editing. */
    outline: 1px dashed rgba(0, 0, 0, 0.15);
    outline-offset: 4px;
}
```

Notice: single root `<div>`, only allowed tags, only allowed attributes (`class`, `href`), no inline styles, BEM under root class, mobile-first media query overrides design tokens instead of duplicating rules, no `@import`. The `--hero-*` custom properties are scoped to the root selector — they never leak into the host page's CSS even though they look global. The preview file is plain CSS (no nesting, no `//` line comments — those are SCSS-only); it ships verbatim to the server as `css_preview` and only renders inside the admin editor canvas, never on production e-shop pages. Production stays self-contained because core declares the same tokens with default values.

---

**This file was created automatically by `pobo auth login`. To regenerate it, delete this file and run `pobo init` (or log in again).**
