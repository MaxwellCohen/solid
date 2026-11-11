// The inline `$df` runtime's two `templateFor` paths: a browser that already
// patched natively (template + scaffold gone) and one without support (the
// range is plain comments the raw swap must clean up).
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";

const src = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
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
      '<p>a</p><!--?start name="X"--><template id="pl-X"></template><i>wait</i><!--pl-X--><!--?end--><p>z</p>' +
      '<template id="X" for="X"><b>done</b></template>';
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
});
