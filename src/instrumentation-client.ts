import {
  installHydrationGuard,
  type GuardMutationRecord,
} from "./shared/hydration/guard-install.ts";

/**
 * Arms the extension-attribute guard before React hydrates.
 *
 * Placement is the whole fix, and every other home was tried and rejected:
 *
 * - `next/script` with `strategy="beforeInteractive"` defers through `self.__next_s` until the
 *   client runtime loads — later than hydration.
 * - A hand-written `<head>` in the root layout shifts Next's own head entries and mismatches.
 * - An inline `<script>` rendered by a component is refused by React 19.
 * - A `"use client"` module imported by the layout evaluates *after* Next has hydrated the outer
 *   boundaries (it reports the mismatch on Next's own `<div hidden>`), which is too late.
 *
 * `instrumentation-client` is the one client entry that runs before hydration without adding
 * anything React has to reconcile. See docs/ARCHITECTURE.md — "Hydration across browser
 * extensions" — and `npm run verify:hydration`, which proves this in a real browser.
 */
installHydrationGuard({
  document,
  // The cast is the only browser-specific seam: it keeps the shared module free of DOM types so
  // it can be unit-tested under plain `node --test`.
  createObserver: (callback) =>
    new MutationObserver((records) => callback(records as unknown as GuardMutationRecord[])),
  elementPrototype: Element.prototype,
});
