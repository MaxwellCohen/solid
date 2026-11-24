/**
 * @jsxImportSource @solidjs/web
 */
// `templateFor`: streamed placeholders are `<?start>`/`<?end>` patching
// ranges and eager fragments ship as `<template for>`, which a browser with
// scripts off patches natively. With scripts on the `$df` runtime owns the
// swap, so it has to reach the parser ahead of the first `for` template.
import { describe, expect, test } from "vitest";
import { renderToStream, Errored, Loading, Reveal } from "@solidjs/web";
import { createMemo } from "solid-js";

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function render(
  code: () => any,
  options?: { noScripts?: boolean; onError?: () => void }
): Promise<string> {
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

const Reject = () => {
  const v = createMemo(() =>
    delay(5).then(() => {
      throw new Error("boom");
    })
  );
  return <b>{v()}</b>;
};
const Slow = () => {
  const v = createMemo(() => delay(15).then(() => "slow"));
  return <b>{v()}</b>;
};

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

  test("a collapsed slot's fallback patch follows the runtime too", async () => {
    // The first slot rejects with no outcome, so its fragment is a plain
    // template: the next slot's fallback patch is the first `for` template.
    const html = await render(
      () => (
        <Reveal collapsed>
          <Loading fallback={<i>a</i>}>
            <Reject />
          </Loading>
          <Loading fallback={<i>b</i>}>
            <Slow />
          </Loading>
        </Reveal>
      ),
      { onError() {} }
    );
    const runtime = html.indexOf("function $dpi(");
    expect(runtime).toBeGreaterThan(-1);
    expect(runtime).toBeLessThan(html.search(/<template[^>]* for=/));
  });

  test("an <Errored> draws its outcome only into a range that is all of its content", async () => {
    const alone = await render(
      () => (
        <Errored fallback={<p>caught</p>}>
          <Loading fallback={<i>a</i>}>
            <Reject />
          </Loading>
        </Errored>
      ),
      { onError() {} }
    );
    expect(alone).toMatch(/<template id="([^"]+)" for="\1" e><p[^>]*>caught<\/p><\/template>/);
    // Beside other content the failed boundary's range is not the Errored's
    // whole content (a later range closes with `<?end>` too): the client
    // renders the failure.
    const beside = await render(
      () => (
        <Errored fallback={<p>caught</p>}>
          <Loading fallback={<i>a</i>}>
            <Reject />
          </Loading>
          <u>middle</u>
          <Loading fallback={<i>b</i>}>
            <Slow />
          </Loading>
        </Errored>
      ),
      { onError() {} }
    );
    expect(beside).not.toContain("caught");
  });

  test("a marker in an attribute value, a comment or a raw-text element does not close a range", async () => {
    const text = "<?end><u>LEAK</u>";
    const Quick = () => {
      const v = createMemo(() => Promise.resolve("quick"));
      return <b>{v()}</b>;
    };
    // Settled before the shell is out: the server takes the scaffold out.
    const inlined = await render(() => (
      <Loading
        fallback={
          <i title={text}>
            <style>{"i::after{content:'<?end>'}"}</style>
            <span innerHTML={"<!--<?end>-->"} />
            wait
          </i>
        }
      >
        <Quick />
      </Loading>
    ));
    expect(inlined).toContain("quick");
    expect(inlined).not.toContain("LEAK");
    expect(inlined).not.toContain("<?end>");
    const caught = await render(
      () => (
        <Errored fallback={<p>caught</p>}>
          <Loading fallback={<i title={text}>a</i>}>
            <Reject />
          </Loading>
        </Errored>
      ),
      { onError() {} }
    );
    expect(caught).toMatch(/<template id="([^"]+)" for="\1" e><p[^>]*>caught<\/p><\/template>/);
  });

  test("a boundary in a held fragment's fallback is released with its group, not behind the content", async () => {
    // Its placeholder is in the document (the fallback), not in the held
    // content, though it shares the held fragment's id prefix.
    const Settle = (p: { ms: number }) => {
      const v = createMemo(() => delay(p.ms).then(() => "ok"));
      return <b>{v()}</b>;
    };
    const html = await render(() => (
      <Reveal order="together">
        <Loading
          fallback={
            <section>
              <Loading fallback={<i>inner</i>}>
                <Settle ms={10} />
              </Loading>
            </section>
          }
        >
          <Settle ms={5} />
        </Loading>
        <Loading fallback={<i>b</i>}>
          <Settle ms={15} />
        </Loading>
      </Reveal>
    ));
    // one group activation naming all three, in registration order
    expect(html).toMatch(/\$dfj\(\["(\w+)","\1\w+","\w+"\]\)/);
    expect(html).not.toContain('$df("');
  });

  test("noScripts: the ranges and `for` templates ship without the runtime", async () => {
    const html = await render(App, { noScripts: true });
    expect(html).toMatch(/<template id="([^"]+)" for="\1"><b[^>]*>done<\/b><\/template>/);
    expect(html).not.toContain("<script");
  });
});
