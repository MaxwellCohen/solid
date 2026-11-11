/**
 * @jsxImportSource @solidjs/web
 */
// `templateFor`: streamed placeholders are `<?start>`/`<?end>` patching
// ranges and eager fragments ship as `<template for>`; the `$df` script stays
// as the fallback for browsers without native support.
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

describe("templateFor", () => {
  test("range placeholder, native template, $df fallback", async () => {
    const html = await render(App);
    expect(html).toMatch(/<\?start name=([^>\s]+)><template id="pl-\1">/);
    expect(html).toMatch(/<!--pl-([^>]+)--><\?end>/);
    expect(html).toMatch(/<template id="([^"]+)" for=\1><b[^>]*>done<\/b><\/template>/);
    expect(html).toContain("$df(");
  });
});
