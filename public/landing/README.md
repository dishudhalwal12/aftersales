# Landing replica (`public/landing`)

A **local, rebranded copy** of the reference agency home page that was saved on
2026-10-30 from `landingpage.it/` and kept as a visual reference until our own landing page replaces
it. It is a static snapshot — no WordPress, no PHP, no database.

```bash
npm run landing          # http://localhost:8080/
LANDING_PORT=9000 npm run landing
```

Open it over **HTTP**, not from the filesystem: the saved asset filenames keep the original query
string (`bootstrap.min_ver%3D7.1.4.css`), which only resolves when the server URL-decodes the path.
`scripts/serve-landing.mjs` does exactly that and nothing else.

## Layout

| Path | Source |
|---|---|
| `index.html` | the saved page, with asset paths and brand text rewritten |
| `assets/theme/` | former `wp-content/themes/<theme>/` — CSS, JS (GSAP, Lenis, Barba, Swiper, three.js), fonts, images |
| `assets/plugins/` | former `wp-content/plugins/` — contact-form-7 and mailin (newsletter) assets |
| `assets/uploads/` | former `wp-content/uploads/` — photography, client reels, partner logos |
| `assets/wp/` | former `wp-includes/` — jQuery and the WordPress i18n runtime the theme expects |

## What was changed from the mirror

- **Structure** — `wp-content/*` and `wp-includes/*` collapsed into `assets/{theme,plugins,uploads,wp}`
  and every reference in `index.html` rewritten. No JS or CSS referenced those paths, so nothing else
  needed touching.
- **Brand text** — `the original brand` → `AFTERSALES` in `<title>`, `og:*`, JSON-LD, the visual headings and
  the alt text; `info@reference.it` → `info@aftersales.ai`.
- **Ownership URLs** — `canonical`, `og:url` and the JSON-LD entity URLs now point at
  `http://localhost:8080/`. This is the one place to change when the page moves to a real domain.
- **Dangling references** — the missing `cropped-favicon-270x270.png` now points at the 192px icon that
  was actually saved, and the WordPress emoji loader (a file that was never saved) is switched off
  instead of 404-ing on every load.
- **External links** — every URL that pointed at the original site or its social accounts is now `#`.
  Nothing in this folder can navigate to, or contact, the original brand.
- **Language** — all visible copy translated from Italian to English (headings, service cards, tags,
  newsletter consent, footer, meta description, `lang="en"`, JSON-LD `inLanguage`).

## Call to action

The original page's menu button is gone. In its place, pinned top-right where that control lived, is a
single **Go to Dashboard** button:

```html
<a class="button" href="http://localhost:3000/auth" …>Go to Dashboard</a>
```

It points at the app's `/auth` page, which is the flow that already handles all three cases: a signed-in
visitor is redirected straight to `/dashboard` (or `/onboarding` if they have no business yet), while a
new visitor gets the sign-in / create-account tabs. Nothing about the session is decided by this static
page, so an expired cookie can never leave it showing the wrong button.

The menu overlay still exists in the markup but its toggle is hidden (`display:none`, kept because the
theme's JS looks the element up by class). To change host or port, edit that one `href` — it is the only
absolute link to the app.

## What is still the original brand's

- Client work imagery and reels in `assets/uploads/` — those are the agency's portfolio, not our work.
  They carry no brand name, but they are not ours to claim.
- The footer address (`Via della Tecnica 34, Matera`) is the original company's office, kept rather than
  inventing one for us.

Copy is English throughout except that address and the original brand's proper nouns.
