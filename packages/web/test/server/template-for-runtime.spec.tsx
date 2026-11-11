// @vitest-environment jsdom
// The inline `$df` runtime's two `templateFor` paths: a browser that already
// patched natively (template + scaffold gone) and one without support (the
// range is plain comments the raw swap must clean up).
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";

const src = readFileSync("src/server.ts", "utf8");
const SCRIPT = src.match(/const REPLACE_SCRIPT = `([^`]+)`/)![1];

function boot() {
  const fe = vi.fn();
  (globalThis as any)._$HY = { fe };
  new Function(SCRIPT + ";globalThis.$df=$df")();
  return fe;
}

describe("$df with templateFor ranges", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("no native support: comment range + scaffold are swapped out", () => {
    document.body.innerHTML =
      '<p>a</p><!--?start name=X--><template id="pl-X"></template><i>wait</i><!--pl-X--><!--?end--><p>z</p>' +
      '<template id="X" for=X><b>done</b></template>';
    const fe = boot();
    (globalThis as any).$df("X");
    expect(document.body.innerHTML).toBe("<p>a</p><b>done</b><p>z</p>");
    expect(fe).toHaveBeenCalledOnce();
    expect((globalThis as any)._$HY.v.X).toBe(1);
  });

  test("native support already patched: $df only records the reveal", () => {
    document.body.innerHTML = "<p>a</p><b>done</b><p>z</p>";
    const fe = boot();
    (globalThis as any).$df("X");
    expect(document.body.innerHTML).toBe("<p>a</p><b>done</b><p>z</p>");
    expect(fe).toHaveBeenCalledWith("X");
    // idempotent
    (globalThis as any).$df("X");
    expect(fe).toHaveBeenCalledOnce();
  });

  test("legacy swap without a range still works", () => {
    document.body.innerHTML =
      '<template id="pl-Y"></template><i>wait</i><!--pl-Y--><template id="Y"><b>ok</b></template>';
    boot();
    (globalThis as any).$df("Y");
    expect(document.body.innerHTML).toBe("<b>ok</b>");
  });

  const SVG = "http://www.w3.org/2000/svg";
  const MATH = "http://www.w3.org/1998/Math/MathML";

  test("SVG placeholder: content is reparsed into the SVG namespace", () => {
    document.body.innerHTML =
      '<svg id="s"><template id="pl-S"></template><!--pl-S--></svg>' +
      '<template id="S"><circle r="2"></circle><text>hi</text></template>';
    boot();
    (globalThis as any).$df("S");
    const kids = [...document.getElementById("s")!.children];
    expect(kids.map(k => k.localName)).toEqual(["circle", "text"]);
    expect(kids.every(k => k.namespaceURI === SVG)).toBe(true);
  });

  test("MathML placeholder: content is reparsed into the MathML namespace", () => {
    document.body.innerHTML =
      '<math id="m"><template id="pl-M"></template><!--pl-M--></math>' +
      '<template id="M"><mi>x</mi><mo>+</mo></template>';
    boot();
    (globalThis as any).$df("M");
    const kids = [...document.getElementById("m")!.children];
    expect(kids.map(k => k.localName)).toEqual(["mi", "mo"]);
    expect(kids.every(k => k.namespaceURI === MATH)).toBe(true);
  });

  test("foreignObject placeholder keeps HTML content", () => {
    document.body.innerHTML =
      '<svg><foreignObject id="f"><template id="pl-F"></template><!--pl-F--></foreignObject></svg>' +
      '<template id="F"><div>ok</div></template>';
    boot();
    (globalThis as any).$df("F");
    const d = document.getElementById("f")!.firstElementChild!;
    expect(d.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
  });
});
