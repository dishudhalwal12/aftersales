import {
  isExtensionInjectedAttribute,
  stripExtensionAttributes,
  type AttributeTarget,
  type AttributeTree,
} from "./extension-attributes.ts";

/**
 * Why this runs as a module side effect instead of an inline `<head>` script:
 *
 * - `next/script` with `strategy="beforeInteractive"` defers through `self.__next_s` until the
 *   client runtime loads, which is later than the point the guard has to have run.
 * - A hand-written `<head>` in the root layout collides with Next's own head entries, and React
 *   19 refuses an inline `<script>` rendered by a component ("Scripts inside React components
 *   are never executed") — both were proven to cause the very mismatch this prevents.
 *
 * A `"use client"` module imported by the root layout evaluates before `hydrateRoot`, so it is
 * the last moment that is still early enough. `npm run verify:hydration` holds this in a real
 * browser.
 *
 * Cleaning up after the extension is not enough on its own: a MutationObserver strip is a
 * microtask, and React hydrates synchronously, so a marker written during that pass can be
 * compared before the strip runs. The guard therefore also *refuses* writes of those
 * attributes, which is the only deterministic ordering.
 */
export type GuardMutationRecord = {
  type: string;
  target?: (AttributeTarget & { nodeType?: number }) | null;
  attributeName?: string | null;
  addedNodes?: ArrayLike<{ nodeType?: number } & AttributeTarget> | null;
};

export type GuardObserver = {
  observe(target: unknown, options: Record<string, boolean>): void;
  disconnect?(): void;
};

/** Builds the observer; injected so this module stays free of DOM types it cannot test. */
export type GuardObserverFactory = (
  callback: (records: GuardMutationRecord[]) => void,
) => GuardObserver;

export type GuardAttributeNode = { name?: string | null };

export type GuardElementPrototype = {
  setAttribute(name: string, value: string): void;
  setAttributeNS?(namespace: string | null, name: string, value: string): void;
  setAttributeNode?(node: GuardAttributeNode): unknown;
};

export type GuardDocument = {
  documentElement: (AttributeTree & { nodeType?: number }) | null;
  addEventListener?(type: string, listener: () => void): void;
  removeEventListener?(type: string, listener: () => void): void;
};

export type GuardScope = {
  document: GuardDocument;
  createObserver?: GuardObserverFactory | undefined;
  elementPrototype?: GuardElementPrototype | undefined;
};

const ELEMENT_NODE = 1;
const guardedDocuments = new WeakSet<object>();
const guardedPrototypes = new WeakSet<object>();

/**
 * Makes the browser silently drop writes of extension markers. Only the attribute names in
 * `EXTENSION_ATTRIBUTE_PATTERNS` are affected; every other attribute behaves normally.
 */
export function blockExtensionAttributeWrites(prototype: GuardElementPrototype): void {
  if (guardedPrototypes.has(prototype)) return;
  guardedPrototypes.add(prototype);

  const setAttribute = prototype.setAttribute;
  prototype.setAttribute = function guardedSetAttribute(name: string, value: string): void {
    if (isExtensionInjectedAttribute(name)) return;
    setAttribute.call(this, name, value);
  };

  const setAttributeNS = prototype.setAttributeNS;
  if (typeof setAttributeNS === "function") {
    prototype.setAttributeNS = function guardedSetAttributeNS(
      namespace: string | null,
      name: string,
      value: string,
    ): void {
      if (isExtensionInjectedAttribute(name)) return;
      setAttributeNS.call(this, namespace, name, value);
    };
  }

  const setAttributeNode = prototype.setAttributeNode;
  if (typeof setAttributeNode === "function") {
    prototype.setAttributeNode = function guardedSetAttributeNode(
      this: GuardElementPrototype,
      node: GuardAttributeNode,
    ): unknown {
      const name = typeof node?.name === "string" ? node.name : "";
      if (isExtensionInjectedAttribute(name)) return node;
      return setAttributeNode.call(this, node);
    };
  }
}

/**
 * Arms the guard: blocks future marker writes, strips the markers the extension already wrote,
 * and keeps watching for markers written through a path the block does not cover.
 *
 * Idempotent — installing twice returns a no-op teardown and never stacks observers.
 */
export function installHydrationGuard(scope: GuardScope): () => void {
  const { document, elementPrototype } = scope;
  if (guardedDocuments.has(document)) return () => {};
  guardedDocuments.add(document);

  if (elementPrototype !== undefined) blockExtensionAttributeWrites(elementPrototype);

  const scrub = () => {
    if (document.documentElement !== null) stripExtensionAttributes(document.documentElement);
  };

  const createObserver = scope.createObserver;
  let observer: GuardObserver | null = null;

  if (createObserver !== undefined && document.documentElement !== null) {
    observer = createObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") {
          const target = record.target;
          if (target && typeof target.removeAttribute === "function") stripExtensionAttributes(target);
          continue;
        }
        const added = record.addedNodes;
        if (!added) continue;
        for (let index = 0; index < added.length; index += 1) {
          const node = added[index];
          if (node && node.nodeType === ELEMENT_NODE) stripExtensionAttributes(node);
        }
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  }

  scrub();

  const onReady = () => scrub();
  document.addEventListener?.("DOMContentLoaded", onReady);

  return () => {
    observer?.disconnect?.();
    document.removeEventListener?.("DOMContentLoaded", onReady);
    guardedDocuments.delete(document);
  };
}
