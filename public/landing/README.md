# Landing replica (`public/landing`)

A **local, rebranded copy** of the [easyseller.it](https://www.easyseller.it/) home page, saved on
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
| `assets/theme/` | former `wp-content/themes/easyseller_ego55/` — CSS, JS (GSAP, Lenis, Barba, Swiper, three.js), fonts, images, logo video |
| `assets/plugins/` | former `wp-content/plugins/` — contact-form-7 and mailin (newsletter) assets |
| `assets/uploads/` | former `wp-content/uploads/` — photography, client reels, partner logos |
| `assets/wp/` | former `wp-includes/` — jQuery and the WordPress i18n runtime the theme expects |

## What was changed from the mirror

- **Structure** — `wp-content/*` and `wp-includes/*` collapsed into `assets/{theme,plugins,uploads,wp}`
  and every reference in `index.html` rewritten. No JS or CSS referenced those paths, so nothing else
  needed touching.
- **Brand text** — `EASYSELLER` → `AFTERSALES` in `<title>`, `og:*`, JSON-LD, the visual headings and
  the alt text; `info@easyseller.it` → `info@aftersales.ai`.
- **Ownership URLs** — `canonical`, `og:url` and the JSON-LD entity URLs now point at
  `http://localhost:8080/`. This is the one place to change when the page moves to a real domain.
- **Dangling references** — the missing `cropped-favicon-270x270.png` now points at the 192px icon that
  was actually saved, the quality-policy PDF stays linked to the live site, and the WordPress emoji
  loader (a file that was never saved) is switched off instead of 404-ing on every load.
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

## What still says EasySell, on purpose

- `assets/theme/img/logo_header.mp4` — the header wordmark is a **video**, so the letters inside it
  cannot be renamed by text replacement. It still reads EASYSELLER. Swap the mp4, or replace that
  element with a text wordmark, before showing this to anyone as our page.
- Client work and reel imagery (`assets/uploads/…`), the ISO-9001 badge filename, and the
  `_easyseller_` social links are the original brand's proof, not ours. Navigation, social links and
  the quality-policy PDF leave the replica and load the live site.
- The contact form posts to `https://www.easyseller.it/wp-admin/admin-ajax.php`, so submitting it
  locally will fail. It is not wired to anything of ours.
- `wp-theme-easyseller_ego55` remains as a CSS class, and `assets/theme/less_easyseller/style_…css` as
  a stylesheet path — renaming either would mean different files than the ones the saved JS expects.
- The footer address (`Via della Tecnica 34, Matera`) is the original company's office, kept as-is
  rather than inventing one for us; the privacy and quality-policy links still leave the replica.

Copy is English throughout except that address and the original brand's proper nouns.
