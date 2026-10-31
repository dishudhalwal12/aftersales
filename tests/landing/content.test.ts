import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HTML_PATH = join(ROOT, "public/landing/index.html");
const html = readFileSync(HTML_PATH, "utf8");

const visibleText = html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ");

const oldCopy = [
  "DIGITAL SALES AGENCY",
  "Sales Digital Agency",
  "Selected Brands",
  "Some of the brands we have helped reach new results",
  "Partners & certifications",
  "Grow your store's sales",
  "Book a free call",
  "Newsletter",
  "Via della Tecnica 34",
  "Matera",
  "info@aftersales.ai",
  "Website by EGO55",
  "Quality Policy",
];

const oldAssets = [
  "f__k.jpg",
  "mefui.jpg",
  "barrow-kids.jpg",
  "4-giveness.jpg",
  "mvp.jpg",
  "nanan.jpg",
  "hinnominate.jpg",
  "gaelle.jpg",
  "shopify-1000x1500.jpg",
  "digital-1000x1500.jpg",
  "manager-1000x1500.jpg",
  "supporto-1000x1500.jpg",
  "social-1000x1500.jpg",
  "shoppingfeed.png",
  "iubenda.png",
  "truspilot.png",
  "/landing/assets/uploads/2026/04/shopify.png",
  "/landing/assets/uploads/2026/04/meta.png",
  "/landing/assets/uploads/2026/04/Google.png",
  "iso-9001-aftersales.png",
  "aftersales-reel02.mp4",
  "anteprima-social.png",
  "cropped-favicon",
  "easyseller",
];

const newCopy = [
  "AI CUSTOMER SUPPORT THAT KEEPS UP",
  "Answers,<br>day or night.",
  "Open when | you're closed.",
  "At 11pm, a customer asks if you deliver to their area.",
  "Six kinds of businesses run on messages.",
  "Everything you need to answer customers, without adding headcount.",
  "Made for the way India talks",
  "On a call, AfterSales speaks Hindi, English, and Hinglish. Text replies are in English.",
  "Give every customer an answer.",
  "Customer support that answers, even when you can't.",
];

const aiTells = [
  "not just",
  "not only",
  "seamless",
  "effortless",
  "empower",
  "revolutionize",
  "game-changing",
  "cutting-edge",
  "leverage",
  "ecosystem",
  "journey",
  "in today's",
  "delve",
  "robust",
  "pivotal",
  "testament",
  "landscape",
  "showcase",
  "underscore",
];

test("new landing copy is present", () => {
  for (const line of newCopy) {
    assert.ok(html.includes(line), `missing copy: ${line}`);
  }
});

test("old agency copy and proof are gone", () => {
  for (const line of oldCopy) {
    assert.equal(html.includes(line), false, `old copy remains: ${line}`);
  }
});

test("old brand, partner, and certification assets are not referenced", () => {
  for (const line of oldAssets) {
    assert.equal(html.includes(line), false, `old asset referenced: ${line}`);
  }
});

test("no dead hash links remain", () => {
  assert.equal(html.includes('href="#"'), false);
});

test("the old footer logo is gone", () => {
  assert.equal(html.includes('id="logo_footer"'), false);
});

test("only the hero video slot remains", () => {
  assert.equal((html.match(/<video/g) ?? []).length, 1);
});

test("every local asset reference resolves on disk", () => {
  const refs = new Set(
    [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)]
      .map((match) => match[1])
      .filter((ref): ref is string => ref !== undefined),
  );

  for (const ref of refs) {
    if (ref === "/" || ref.startsWith("/auth")) continue;
    const decoded = decodeURIComponent(ref).replace(/^\//, "");
    const file = join(ROOT, "public", decoded);
    assert.ok(existsSync(file), `missing local asset: ${ref}`);
  }
});

test("the demo calls to action point at auth", () => {
  assert.ok((html.match(/href="\/auth"[^>]*>See it live</g) ?? []).length >= 10);
  assert.ok((html.match(/href="\/auth"[^>]*>Start the demo</g) ?? []).length >= 1);
  assert.ok((html.match(/href="\/auth"[^>]*>Try the demo</g) ?? []).length >= 2);
});

test("service cards use typographic placeholders, not stock photos", () => {
  const panels = html.match(/<div class="card_picture card_picture--placeholder"/g) ?? [];
  assert.equal(panels.length, 10);
});

test("metadata describes AfterSales AI", () => {
  assert.ok(html.includes("<title>AfterSales AI | Every customer gets an answer</title>"));
  assert.ok(html.includes("AfterSales answers customer questions"));
  assert.ok(html.includes('rel="canonical" href="https://aftersales-sphinx.vercel.app/"'));
  assert.ok(html.includes('<html lang="en-IN">'));
  assert.equal(html.includes("user-scalable=no"), false);
});

test("visible copy has no em dash, en dash, or AI tells", () => {
  assert.equal(/[—–]/.test(visibleText), false, "em or en dash found");
  for (const phrase of aiTells) {
    assert.equal(
      visibleText.toLowerCase().includes(phrase),
      false,
      `AI tell remains: ${phrase}`,
    );
  }
});
