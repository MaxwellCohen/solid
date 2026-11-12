// @vitest-environment jsdom
// The inline `$df` runtime over `templateFor` ranges. With scripts on it owns
// every swap: `$dpi` blanks the start markers a native parser would patch
// (processing instructions), and `$dfr` swaps the range itself — comments
// where the parser has no processing instructions, which need no blanking.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";

const src = readFileSync("src/server.ts", "utf8");
const SCRIPT = src.match(/const REPLACE_SCRIPT = `([^`]+)`/)![1];

function boot() {
  const fe = vi.fn();
  (globalThis as any)._$HY = { fe };
  new Function(SCRIPT + ";globalThis.$df=$df;globalThis.$dfl=$dfl")();
  return fe;
}

describe("$df with templateFor ranges", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("no native support: comment range + scaffold are swapped out", () => {
    document.body.innerHTML =
      '<p>a</p><!--?start name="X"--><template id="pl-X"></template><i>wait</i><!--pl-X--><!--?end--><p>z</p>' +
      '<template id="X" for="X"><b>done</b></template>';
    const fe = boot();
    (globalThis as any).$df("X");
    expect(document.body.innerHTML).toBe("<p>a</p><b>done</b><p>z</p>");
    expect(fe).toHaveBeenCalledOnce();
    expect((globalThis as any)._$HY.v.X).toBe(1);
  });

  // What a parser with processing instructions leaves: the markers as nodes
  // of type 7 around the scaffold jsdom parsed.
  function nativeRange(id: string, host: ParentNode = document.body) {
    const pl = host.querySelector(`template[id="pl-${id}"]`)!;
    let end: ChildNode = pl;
    while (end.nodeType !== 8 || end.nodeValue !== "pl-" + id) end = end.nextSibling!;
    const start = document.createProcessingInstruction("start", `name="${id}"`);
    pl.before(start);
    end.after(document.createProcessingInstruction("end", ""));
    return start;
  }

  test("native markers: loading the runtime blanks the start, $df swaps the range", () => {
    document.body.innerHTML =
      '<p>a</p><template id="pl-X"></template><i>wait</i><!--pl-X--><p>z</p>' +
      '<template id="X" for="X"><b>done</b></template>';
    const start = nativeRange("X");
    const fe = boot();
    // nameless: a `<template for="X">` parsed from here on has no target
    expect(start.data).toBe("");
    (globalThis as any).$df("X");
    expect(document.body.innerHTML).toBe("<p>a</p><b>done</b><p>z</p>");
    expect(fe).toHaveBeenCalledWith("X", document.body);
    expect((globalThis as any)._$HY.v.X).toBe(1);
  });

  test("a nested range is blanked before its content joins the document", () => {
    document.body.innerHTML =
      '<template id="pl-A"></template><i>wait</i><!--pl-A-->' +
      '<template id="A" for="A"><section><template id="pl-B"></template><i>inner</i><!--pl-B--></section></template>';
    nativeRange("A");
    const inner = nativeRange("B", (document.getElementById("A") as HTMLTemplateElement).content);
    boot();
    // inert template content is not the document's: still named
    expect(inner.data).toBe('name="B"');
    let live: string | undefined;
    (globalThis as any)._$HY.fe = () => (live = inner.data);
    (globalThis as any).$df("A");
    expect(inner.isConnected).toBe(true);
    expect(live).toBe("");
  });

  test("a collapsed fallback's nested range is blanked as $dfl materializes it", () => {
    document.body.innerHTML =
      '<template id="pl-C"><section><template id="pl-D"></template><i>inner</i><!--pl-D--></section></template><!--pl-C-->';
    nativeRange("C");
    nativeRange("D", (document.getElementById("pl-C") as HTMLTemplateElement).content);
    boot();
    (globalThis as any).$dfl("C");
    const inner = document.querySelector("section")!.firstChild as ProcessingInstruction;
    expect(inner.nodeType).toBe(7);
    expect(inner.data).toBe("");
  });

  test("patched natively all the same: $df records the reveal", () => {
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
