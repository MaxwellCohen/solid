/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 *
 * Two hydration roots: each lists the `<!--ph-ID-->` spans in its own
 * element, and the swap hook that lists a swap's spans is installed once.
 */
import { afterEach, expect, test } from "vitest";
import { hydrate, useHead } from "@solidjs/web";
import { bootstrapHydrationGlobal } from "../harness/hydration-bootstrap.js";

afterEach(() => {
  document.body.innerHTML = "";
  delete (globalThis as any)._$HY;
});

test("each root lists its own spans; the swap hook wraps once", () => {
  const hy = bootstrapHydrationGlobal();
  document.body.innerHTML =
    '<div id="r1"><!--ph-1--><b _hk="1001">one</b><!--/ph-1--></div>' +
    '<div id="r2"><!--ph-r2-2--><b _hk="r2-2001">two</b><!--/ph-r2-2--></div>';
  const r1 = document.getElementById("r1")!;
  const r2 = document.getElementById("r2")!;
  const one = hydrate(() => null, r1);
  expect(Object.keys(hy.hs)).toEqual(["1"]);
  expect(r2.innerHTML).toContain("<!--ph-r2-2-->");
  const fe = hy.fe;
  const two = hydrate(() => null, r2, { renderId: "r2-" });
  expect(Object.keys(hy.hs).sort()).toEqual(["1", "r2-2"]);
  expect(hy.hs["r2-2"].map((n: Element) => n.textContent)).toEqual(["two"]);
  expect(r2.innerHTML).not.toContain("ph-");
  expect(hy.fe).toBe(fe);
  one();
  two();
});

// The head registry takes `_$HY.h` once a head tag registers: the span lists
// live elsewhere.
test("a head tag registering leaves the span lists", () => {
  const hy = bootstrapHydrationGlobal();
  document.body.innerHTML = '<div id="r"><!--ph-1--><b _hk="1001">one</b><!--/ph-1--></div>';
  const dispose = hydrate(() => {
    useHead({ tag: "title", props: { children: "t" } });
    return null;
  }, document.getElementById("r")!);
  expect(typeof hy.h).toBe("function");
  expect(hy.hs["1"].map((n: Element) => n.textContent)).toEqual(["one"]);
  dispose();
});
