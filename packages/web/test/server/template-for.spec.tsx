/**
 * @jsxImportSource @solidjs/web
 */
// Disarm PE: streamed placeholders are `<?start>`/`<?end>` ranges and eager
// fragments ship as `<template for>`; `$dpi` blanks names when JS runs so
// `$df` owns scheduling.
import { describe, expect, test } from "vitest";
import { renderToStream, Loading } from "@solidjs/web";
import { createMemo } from "solid-js";

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function render(code: () => any): Promise<string> {
  return new Promise(resolve => {
    const chunks: string[] = [];
    renderToStream(code).pipe({
      write: (c: string) => void chunks.push(c),
      end: () => resolve(chunks.join(""))
    });
  });
}

const App = () => (
  <Loading fallback={<i>wait</i>}>
    {(() => {
      const v = createMemo(() => delay(5).then(() => "done"));
      return <b>{v()}</b>;
    })()}
  </Loading>
);

describe("templateFor disarm PE", () => {
  test("slim range placeholder, eager for, $df task", async () => {
    const html = await render(App);
    expect(html).toMatch(/<\?start name="([^"]+)">/);
    expect(html).not.toMatch(/<\?start name="[^"]+"><template id="pl-/);
    expect(html).toMatch(/<\?end>/);
    expect(html).toMatch(/<template id="([^"]+)" for="\1"><b[^>]*>done<\/b><\/template>/);
    expect(html).toContain("$df(");
    expect(html).toContain("$dpi");
  });
});
