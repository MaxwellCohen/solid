// @vitest-environment jsdom
// `$dpi` blanks `<?start name>` so native DPU cannot race; `$dfr` always
// does a direct replace from the map (classic `pl-*` still works for frames).
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

describe("$df disarm PE runtime", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("disarm blanks names then $df swaps the range", () => {
    document.body.innerHTML =
      '<p>a</p><!--?start name="X"--><i>wait</i><!--?end--><p>z</p>' +
      '<template id="X" for="X"><b>done</b></template>';
    const fe = boot();
    expect((globalThis as any)._$HY.m.X).toBeTruthy();
    expect(document.body.innerHTML).toContain('?start name=""');
    (globalThis as any).$df("X");
    expect(document.body.innerHTML).toBe("<p>a</p><b>done</b><p>z</p>");
    expect(fe).toHaveBeenCalledOnce();
    expect((globalThis as any)._$HY.v.X).toBe(1);
  });

  test("idempotent when template already gone", () => {
    document.body.innerHTML = "<p>a</p><b>done</b><p>z</p>";
    const fe = boot();
    (globalThis as any)._$HY.v = { X: 1 };
    expect((globalThis as any).$df("X")).toBe(1);
    expect(document.body.innerHTML).toBe("<p>a</p><b>done</b><p>z</p>");
    expect(fe).not.toHaveBeenCalled();
  });

  test("classic pl-* swap still works", () => {
    document.body.innerHTML =
      '<template id="pl-Y"></template><i>wait</i><!--pl-Y--><template id="Y"><b>ok</b></template>';
    boot();
    (globalThis as any).$df("Y");
    expect(document.body.innerHTML).toBe("<b>ok</b>");
  });

  test("collapsed fallback materializes via $dfl", () => {
    document.body.innerHTML = '<!--?start name="C"--><template><i>fb</i></template><!--?end-->';
    boot();
    (globalThis as any).$dfl("C");
    expect(document.body.innerHTML).toContain("<i>fb</i>");
    expect(document.body.innerHTML).not.toContain("<template>");
  });

  const SVG = "http://www.w3.org/2000/svg";
  const MATH = "http://www.w3.org/1998/Math/MathML";

  test("SVG placeholder: content is reparsed into the SVG namespace", () => {
    document.body.innerHTML =
      '<svg id="s"><!--?start name="S"--><!--?end--></svg>' +
      '<template id="S"><circle r="2"></circle><text>hi</text></template>';
    boot();
    (globalThis as any).$df("S");
    const kids = [...document.getElementById("s")!.children];
    expect(kids.map(k => k.localName)).toEqual(["circle", "text"]);
    expect(kids.every(k => k.namespaceURI === SVG)).toBe(true);
  });

  test("MathML placeholder: content is reparsed into the MathML namespace", () => {
    document.body.innerHTML =
      '<math id="m"><!--?start name="M"--><!--?end--></math>' +
      '<template id="M"><mi>x</mi><mo>+</mo></template>';
    boot();
    (globalThis as any).$df("M");
    const kids = [...document.getElementById("m")!.children];
    expect(kids.map(k => k.localName)).toEqual(["mi", "mo"]);
    expect(kids.every(k => k.namespaceURI === MATH)).toBe(true);
  });

  test("foreignObject placeholder keeps HTML content", () => {
    document.body.innerHTML =
      '<svg><foreignObject id="f"><!--?start name="F"--><!--?end--></foreignObject></svg>' +
      '<template id="F"><div>ok</div></template>';
    boot();
    (globalThis as any).$df("F");
    const d = document.getElementById("f")!.firstElementChild!;
    expect(d.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
  });
});
