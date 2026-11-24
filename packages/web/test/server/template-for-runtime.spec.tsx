// @vitest-environment jsdom
// The inline `$df` runtime over `templateFor` ranges. With scripts on it owns
// every swap: `$dpi` turns the markers a native parser would patch
// (processing instructions) into comments, and `$dfr` swaps the range itself
// — already comments where the parser has no processing instructions.
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

  test("no native support: the comment range is swapped out with its scaffold", () => {
    document.body.innerHTML =
      '<p>a</p><!--?start name="X"--><template id="pl-X"></template><i>wait</i><!--?end--><p>z</p>' +
      '<template id="X" for="X"><b>done</b></template>';
    const fe = boot();
    (globalThis as any).$df("X");
    expect(document.body.innerHTML).toBe("<p>a</p><b>done</b><p>z</p>");
    expect(fe).toHaveBeenCalledOnce();
    // the reveal record lists what the swap inserted
    expect([...(globalThis as any)._$HY.v.X]).toEqual([document.querySelector("b")]);
  });

  test("a nested swap keeps every node list that held its range current", () => {
    document.body.innerHTML =
      '<!--?start name="O"--><template id="pl-O"></template><i>o</i><!--?end-->' +
      '<template id="O" for="O"><b>outer</b><!--?start name="I"--><template id="pl-I"></template>' +
      "<i>wait</i><!--?end--><u>tail</u></template>" +
      '<template id="I" for="I"><b>inner</b></template>';
    boot();
    const hy = (globalThis as any)._$HY;
    (globalThis as any).$df("O");
    const outer = hy.v.O;
    hy.hs = { S: [...outer] };
    (globalThis as any).$df("I");
    const names = (l: Node[]) => l.map(n => n.textContent);
    expect(names(outer)).toEqual(["outer", "inner", "tail"]);
    expect(names(hy.hs.S)).toEqual(["outer", "inner", "tail"]);
    expect(outer.every((n: Node) => n.isConnected)).toBe(true);
  });

  test("a rejected fragment's record lists the server's outcome", () => {
    document.body.innerHTML =
      '<!--?start name="X"--><template id="pl-X"></template><i>wait</i><!--?end-->' +
      '<template id="X" for="X" e><p>failed</p></template>';
    boot();
    (globalThis as any).$df("X");
    const record = (globalThis as any)._$HY.v.X;
    expect([...record]).toEqual([document.querySelector("p")]);
  });

  test("a range nested in the fallback does not close the outer one", () => {
    document.body.innerHTML =
      '<!--?start name="A"--><template id="pl-A"></template><i>a</i>' +
      '<!--?start name="B"--><template id="pl-B"></template><i>b</i><!--?end-->' +
      "<u>tail</u><!--?end--><p>z</p>" +
      '<template id="A" for="A"><b>done</b></template>';
    boot();
    (globalThis as any).$df("A");
    expect(document.body.innerHTML).toBe("<b>done</b><p>z</p>");
  });

  // What a parser with processing instructions leaves: every marker comment
  // under `root` (template contents included) as a node of type 7.
  function native(root: ParentNode, out: Record<string, ProcessingInstruction> = {}) {
    const walk = document.createTreeWalker(root, 128 | 1);
    const comments: Comment[] = [];
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.nodeType === 8) comments.push(n as Comment);
      else if ((n as Element).localName === "template")
        native((n as HTMLTemplateElement).content, out);
    }
    for (const c of comments) {
      const m = /^\?(start|end)(?: name="([^"]+)")?$/.exec(c.data);
      if (!m) continue;
      const pi = document.createProcessingInstruction(m[1], m[2] ? `name="${m[2]}"` : "");
      c.replaceWith(pi);
      if (m[2]) out[m[2]] = pi;
    }
    return out;
  }

  test("native markers: loading the runtime blanks the start, $df swaps the range", () => {
    document.body.innerHTML =
      '<p>a</p><!--?start name="X"--><template id="pl-X"></template><i>wait</i><!--?end--><p>z</p>' +
      '<template id="X" for="X"><b>done</b></template>';
    const start = native(document.body).X;
    const fe = boot();
    // a comment now: a `<template for="X">` parsed from here on has no target
    expect(start.isConnected).toBe(false);
    expect(document.body.innerHTML).toContain('<!--?start--><template id="pl-X">');
    (globalThis as any).$df("X");
    expect(document.body.innerHTML).toBe("<p>a</p><b>done</b><p>z</p>");
    expect(fe).toHaveBeenCalledWith("X", document.body);
    // the reveal record lists what the swap inserted
    expect([...(globalThis as any)._$HY.v.X]).toEqual([document.querySelector("b")]);
  });

  test("a nested range is blanked before its content joins the document", () => {
    document.body.innerHTML =
      '<!--?start name="A"--><template id="pl-A"></template><i>wait</i><!--?end-->' +
      '<template id="A" for="A"><section><!--?start name="B"--><template id="pl-B"></template><i>inner</i><!--?end--></section></template>';
    const inner = native(document.body).B;
    boot();
    // inert template content is not the document's: still a named marker
    expect(inner.parentNode).not.toBe(null);
    let piInserted = false;
    (globalThis as any)._$HY.fe = () =>
      (piInserted = !!document.createTreeWalker(document.body, 64).nextNode());
    (globalThis as any).$df("A");
    // converted before the payload joined the document, never inserted as one
    expect(piInserted).toBe(false);
    expect(inner.parentNode).toBe(null);
    expect(document.querySelector("section")!.innerHTML).toBe(
      '<!--?start--><template id="pl-B"></template><i>inner</i><!--?end-->'
    );
  });

  test("a collapsed fallback materializes inside its range, nested ranges blanked", () => {
    document.body.innerHTML =
      '<!--?start name="C"--><template id="pl-C"><section><!--?start name="D"--><template id="pl-D"></template><i>inner</i><!--?end--></section></template><!--?end-->';
    native(document.body);
    boot();
    (globalThis as any).$dfl("C");
    const section = document.querySelector("section")!;
    expect(section.nextSibling!.nodeValue).toBe("?end");
    expect(section.firstChild!.nodeType).toBe(8);
    expect(section.firstChild!.nodeValue).toBe("?start");
  });

  test("a shown fallback drops the patch that shows it with scripts off", () => {
    document.body.innerHTML =
      '<!--?start name="C"--><template id="pl-C"><i>wait</i></template><!--?end-->' +
      '<template for="C"><!--?start name="C"--><i>wait</i><!--?end--></template>' +
      '<template id="C" for="C"><b>done</b></template>';
    boot();
    (globalThis as any).$dfl("C");
    expect(document.querySelectorAll("i").length).toBe(1);
    // the content template (it has an id) stays for its swap
    expect([...document.querySelectorAll("template[for]")].map(t => t.id)).toEqual(["C"]);
  });

  test("a shown fallback calls the client's hook for its id", () => {
    document.body.innerHTML =
      '<!--?start name="C"--><template id="pl-C"><i>wait</i></template><!--?end-->';
    boot();
    const shown = vi.fn(() => expect(document.querySelector("body > i")).not.toBe(null));
    (globalThis as any)._$HY.fl = { C: shown };
    (globalThis as any).$dfl("C");
    expect(shown).toHaveBeenCalledOnce();
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

  test("SVG placeholder: where Trusted Types block the reparse, the content still goes in", () => {
    document.body.innerHTML =
      '<svg id="t"><template id="pl-T"></template><!--pl-T--></svg>' +
      '<template id="T"><circle r="2"></circle></template>';
    const fe = boot();
    const create = document.createElementNS;
    document.createElementNS = function (this: Document, ns: string, name: string) {
      const el = create.call(this, ns, name);
      Object.defineProperty(el, "innerHTML", {
        set() {
          throw new TypeError("This document requires 'TrustedHTML' assignment.");
        }
      });
      return el;
    } as typeof document.createElementNS;
    try {
      expect((globalThis as any).$df("T")).toBe(1);
    } finally {
      document.createElementNS = create;
    }
    expect([...document.getElementById("t")!.children].map(k => k.localName)).toEqual(["circle"]);
    expect(fe).toHaveBeenCalledWith("T", document.getElementById("t"));
  });

  test("SVG placeholder: an <image> the HTML parser read as <img> is an SVG image", () => {
    document.body.innerHTML =
      '<svg id="i"><template id="pl-I"></template><!--pl-I--></svg>' +
      '<template id="I"><image href="a.png" width="3"></image>' +
      '<foreignObject><img src="b.png"></foreignObject></template>';
    boot();
    (globalThis as any).$df("I");
    const [image, foreign] = [...document.getElementById("i")!.children];
    expect(image.localName).toBe("image");
    expect(image.namespaceURI).toBe(SVG);
    expect(image.getAttribute("href")).toBe("a.png");
    // HTML content of the fragment keeps its <img>
    const img = foreign.firstElementChild!;
    expect(img.localName).toBe("img");
    expect(img.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
  });

  test("SVG placeholder: a collapsed fallback is the placeholder's children", () => {
    // Inside <svg> `<template>` is a foreign element: no `content`.
    document.body.innerHTML =
      '<svg id="c"><template id="pl-V"><desc>wait</desc></template><!--pl-V--></svg>';
    boot();
    (globalThis as any).$dfl("V");
    const shown = document.getElementById("pl-V")!.nextSibling as Element;
    expect(shown.localName).toBe("desc");
    expect(shown.namespaceURI).toBe(SVG);
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
