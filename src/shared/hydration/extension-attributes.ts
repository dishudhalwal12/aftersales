/**
 * Browser extensions rewrite our DOM before React hydrates, and React then reports every
 * element they touched as a hydration mismatch — even though our own markup is identical on
 * both sides. The reported case was Bitdefender (`bis_skin_checked`, `bis_register`,
 * `__processed_<uuid>__`), but the same class of breakage comes from Grammarly,
 * LanguageTool, ColorZilla and Dark Reader.
 *
 * These patterns are data, not code: `guard-script.ts` compiles them into the inline script
 * that runs in the browser, so the list checked here is exactly the list that ships.
 */
export const EXTENSION_ATTRIBUTE_PATTERNS: readonly string[] = [
  // Bitdefender Total Security / Safepay web protection.
  "bis_[a-z_]+",
  "__processed_[0-9a-fA-F-]+__",
  // ColorZilla.
  "cz-shortcut-listen",
  // Grammarly.
  "data-gr-ext-installed",
  "data-new-gr-c-s-check-loaded",
  // LanguageTool.
  "data-lt-installed",
  // Dark Reader.
  "data-darkreader-[a-z-]+",
  // Dictionary/translate extensions.
  "data-dict-ext-[a-z-]+",
];

const EXTENSION_ATTRIBUTE_MATCHER = new RegExp(`^(?:${EXTENSION_ATTRIBUTE_PATTERNS.join("|")})$`);

/** Anything an element can carry attributes on. */
export type AttributeTarget = {
  getAttributeNames(): string[];
  removeAttribute(name: string): void;
};

/** An element plus the subtree below it. */
export type AttributeTree = AttributeTarget & {
  querySelectorAll(selector: string): ArrayLike<AttributeTarget>;
};

export function isExtensionInjectedAttribute(name: string): boolean {
  return EXTENSION_ATTRIBUTE_MATCHER.test(name);
}

/** Removes extension markers from one element. Returns how many it dropped. */
export function stripExtensionAttributesFrom(target: AttributeTarget): number {
  let removed = 0;
  for (const name of target.getAttributeNames()) {
    if (!isExtensionInjectedAttribute(name)) continue;
    target.removeAttribute(name);
    removed += 1;
  }
  return removed;
}

/** Removes extension markers from an element and everything under it. */
export function stripExtensionAttributes(tree: AttributeTree | AttributeTarget): number {
  let removed = stripExtensionAttributesFrom(tree);
  if (!("querySelectorAll" in tree) || typeof tree.querySelectorAll !== "function") return removed;
  const descendants = tree.querySelectorAll("*");
  for (let index = 0; index < descendants.length; index += 1) {
    const element = descendants[index];
    if (element === undefined) continue;
    removed += stripExtensionAttributesFrom(element);
  }
  return removed;
}
