/**
 * @jsxImportSource @solidjs/web
 */
// `templateFor`: streamed placeholders are `<?start>`/`<?end>` patching
// ranges and eager fragments ship as `<template for>`, which a browser with
// scripts off patches natively. With scripts on the `$df` runtime owns the
// swap, so it has to reach the parser ahead of the first `for` template.
import { describe, expect, test } from "vitest";
import { renderToStream, Loading } from "@solidjs/web";
import { createMemo } from "solid-js";

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function render(code: () => any, options?: { noScripts?: boolean }): Promise<string> {
  return new Promise(resolve => {
    const chunks: string[] = [];
    renderToStream(code, options).pipe({
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
    // the range closes at `<?end>`: no `<!--pl-X-->` comment beside it
    expect(html).toMatch(
      /<\?start name="([^"]+)"><template id="pl-\1"><\/template><i[^>]*>wait<\/i><\?end>/
    );
    expect(html).not.toContain("<!--pl-");
    expect(html).toMatch(/<template id="([^"]+)" for="\1"><b[^>]*>done<\/b><\/template>/);
    expect(html).toContain("$df(");
  });

  test("the runtime (and its disarm pass) precedes the first `for` template", async () => {
    const html = await render(App);
    const runtime = html.indexOf("function $dpi(");
    expect(runtime).toBeGreaterThan(-1);
    expect(html.indexOf("$dpi(document)")).toBeGreaterThan(runtime);
    expect(html.indexOf("$dpi(document)")).toBeLessThan(html.search(/<template id="[^"]+" for=/));
    // once per document
    expect(html.split("function $dpi(").length - 1).toBe(1);
  });

  test("noScripts: the ranges and `for` templates ship without the runtime", async () => {
    const html = await render(App, { noScripts: true });
    expect(html).toMatch(/<template id="([^"]+)" for="\1"><b[^>]*>done<\/b><\/template>/);
    expect(html).not.toContain("<script");
  });
});
