import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  EXTENSION_ATTRIBUTE_PATTERNS,
  isExtensionInjectedAttribute,
  stripExtensionAttributes,
  stripExtensionAttributesFrom,
} from "../../src/shared/hydration/extension-attributes.ts";

/**
 * The bug this file pins: a browser extension injected `bis_skin_checked`, `bis_register` and
 * `__processed_<uuid>__` into the DOM before React hydrated, so every element the server and
 * client both rendered was reported as a hydration mismatch on `/auth`. Our own markup was
 * byte-identical across requests; the attributes were never ours.
 *
 * The guard has to recognise the extension markers of every extension family that rewrites the
 * DOM, and leave the application's own attributes alone while doing it.
 */
describe("isExtensionInjectedAttribute — recognises DOM-rewriting extension markers", () => {
  const injected = [
    "bis_skin_checked",
    "bis_register",
    "__processed_bfaa6f26-2235-48a8-b9c5-eb0fea460f8a__",
    "cz-shortcut-listen",
    "data-gr-ext-installed",
    "data-new-gr-c-s-check-loaded",
    "data-lt-installed",
    "data-darkreader-scheme",
    "data-dict-ext-site",
  ];

  for (const name of injected) {
    it(`matches ${name}`, () => {
      assert.equal(isExtensionInjectedAttribute(name), true);
    });
  }

  const ours = ["class", "id", "lang", "href", "aria-selected", "data-testid", "bis", "processed"];
  for (const name of ours) {
    it(`leaves ${name} alone`, () => {
      assert.equal(isExtensionInjectedAttribute(name), false);
    });
  }

  it("is not fooled by a near-miss prefix", () => {
    assert.equal(isExtensionInjectedAttribute("data-darkreaderx"), false);
    assert.equal(isExtensionInjectedAttribute("bis-skin-checked"), false);
  });
});

describe("stripExtensionAttributes — removes only extension markers", () => {
  it("reports how many attributes it removed", () => {
    const element = stubElement({ bis_skin_checked: "1", class: "auth-card", id: "card" });
    assert.equal(stripExtensionAttributesFrom(element), 1);
    assert.deepEqual(element.getAttributeNames().sort(), ["class", "id"]);
  });

  it("is idempotent, so a second pass cannot remove anything else", () => {
    const element = stubElement({ bis_skin_checked: "1", class: "auth-card" });
    stripExtensionAttributesFrom(element);
    assert.equal(stripExtensionAttributesFrom(element), 0);
    assert.deepEqual(element.getAttributeNames(), ["class"]);
  });

  it("walks the whole subtree, because the extension tags every element it sees", () => {
    const deep = stubElement({ bis_skin_checked: "1", "data-lt-installed": "true" });
    const middle = stubElement({ bis_skin_checked: "1" }, [deep]);
    const root = stubElement({ bis_register: "x", lang: "en" }, [middle]);

    assert.equal(stripExtensionAttributes(root), 4);
    assert.deepEqual(root.getAttributeNames().sort(), ["lang"]);
    assert.deepEqual(middle.getAttributeNames(), []);
    assert.deepEqual(deep.getAttributeNames(), []);
  });

  it("tolerates a tree node that cannot be walked", () => {
    assert.equal(stripExtensionAttributes({ getAttributeNames: () => [], removeAttribute: () => {} }), 0);
  });
});

describe("EXTENSION_ATTRIBUTE_PATTERNS — stays a data list, not code", () => {
  it("holds plain regex fragments with no anchors or lookarounds", () => {
    for (const pattern of EXTENSION_ATTRIBUTE_PATTERNS) {
      assert.doesNotMatch(pattern, /^\^|\$$/);
    }
  });
});

type StubElement = {
  getAttributeNames(): string[];
  removeAttribute(name: string): void;
  querySelectorAll(selector: string): StubElement[];
};

function stubElement(
  attributes: Record<string, string>,
  children: readonly StubElement[] = [],
): StubElement {
  const attrs = new Map(Object.entries(attributes));
  const self: StubElement = {
    getAttributeNames: () => [...attrs.keys()],
    removeAttribute: (name: string) => {
      attrs.delete(name);
    },
    querySelectorAll: () => children.flatMap((child) => [child, ...child.querySelectorAll("*")]),
  };
  return self;
}
