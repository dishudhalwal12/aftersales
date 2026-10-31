# Landing page (`public/landing`)

The front door at `/`. It is a static snapshot of the reference agency page, rebranded and rewritten
for AfterSales AI. No WordPress, no PHP, no database.

```bash
npm run landing          # http://localhost:8080/
LANDING_PORT=9000 npm run landing
```

Open it over **HTTP**, not from the filesystem: the saved asset filenames keep the original query
string (`bootstrap.min_ver%3D7.1.4.css`), which only resolves when the server URL-decodes the path.
`scripts/serve-landing.mjs` does exactly that and nothing else.

## Layout

| Path | Contents |
|---|---|
| `index.html` | the static page |
| `assets/theme/` | CSS, JS (GSAP, Lenis, Barba, Swiper, three.js), fonts, abstract theme images |
| `assets/uploads/` | the hero video that still needs a product demo replacement |
| `assets/product/` | new AfterSales assets, currently the favicon |
| `assets/wp/` | jQuery and the WordPress i18n runtime the theme expects |

## Page sections

| Section | Purpose |
|---|---|
| Hero | fixed video, `Elevate Your Sales`, header, and pinned `Go to Dashboard` CTA |
| Intro | the product promise and three product facts: 4 channels, 24h coverage, 1 view |
| Values | five short promises with the existing animated bar treatment |
| Showreel | after-hours customer story as a large quote |
| Who it's for | six business categories, no borrowed client logos |
| What you get | five product cards with typographic `01` to `05` image panels |
| Languages | India-first language strip |
| Final CTA | `Give every customer an answer.` and a demo link |
| Footer | tagline, section links, copyright |

## What changed from the saved mirror

- **Copy**: rewritten for AfterSales AI. No agency positioning, no borrowed client names, no tech-stack
  vocabulary such as RAG, LLM, confidence score, routing rules, or webhooks.
- **Images**: the old fashion portfolio, agency service photos, Shopify/Meta/Google partner logos, ISO
  badge, old favicon, and `easyseller.it` social preview are removed. The page currently has no content
  images. The service card slots are typographic panels that can be replaced with product screenshots.
- **Newsletter**: removed. The Sendinblue form, its Italian validation strings, and the dead privacy link
  are gone.
- **Footer**: the Italian office address, old email, social links, quality policy, and `Website by EGO55`
  credit are removed.
- **Navigation**: the four menu items now point at the page sections and `/auth`. The old social links are
  gone. The header logo, menu layout, and pinned CTA are unchanged.
- **Metadata**: title, description, canonical URL, Open Graph tags, and JSON-LD now describe AfterSales AI.
- **Language**: `lang="en"` and `og:locale=en_IN`. The old WPML Italian cookie script is removed.

## Call to action

The pinned top-right button is the only entry into the app from this page:

```html
<a class="as-cta" href="/auth">Go to Dashboard</a>
```

`/auth` already handles all cases: a signed-in visitor goes to `/dashboard` or `/onboarding`, and a new
visitor gets the sign-in and judge demo options. The static page never decides the session state.

## Still needs a product asset

- `assets/uploads/2026/03/hero.mp4` is the old hero reel.

The hero video slot stays in place until the product demo recording is ready. Replace the file or update
the `<source>` path in `index.html`. The old showreel was removed because it showed another brand's client
work.

## Replacing the service card panels

The five cards use `<div class="card_picture card_picture--placeholder"><span>01</span></div>` instead of
an image. To use product screenshots, replace each panel with:

```html
<div class="card_picture"><img src="/landing/assets/product/one-inbox.jpg" alt="AfterSales live queue" loading="lazy"></div>
```

Use portrait images at 1000x1500. Update both the desktop card list and the mobile swiper copy.
