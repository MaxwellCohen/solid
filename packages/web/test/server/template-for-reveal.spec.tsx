/**
 * @jsxImportSource @solidjs/web
 */
// `<Reveal>` with scripts off, patched natively: what a browser with
// declarative patching (`<template for>`) shows at every point of the
// stream. The stream is replayed chunk by chunk; after each chunk the
// document so far is parsed and every `for` template applied in order, the
// way the parser applies them (the start marker through its balancing end
// marker is replaced by the template's content). The timeline of visible
// states is what each Reveal order promises.
import { describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { renderToStream, Loading, Reveal } from "@solidjs/web";
import { createMemo } from "solid-js";

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function chunks(code: () => any, options?: { noScripts?: boolean }): Promise<string[]> {
  return new Promise(resolve => {
    const out: string[] = [];
    renderToStream(code, options).pipe({
      write: (c: string) => void out.push(c),
      end: () => resolve(out)
    });
  });
}

// Apply every `<template for>` in document order, as a parser with
// declarative patching does when it reaches each one.
function patch(doc: Document) {
  for (const t of [...doc.querySelectorAll("template[for]")] as HTMLTemplateElement[]) {
    const name = t.getAttribute("for")!;
    const walk = doc.createTreeWalker(doc.body, 128);
    let start: Node | null = null;
    for (let n = walk.nextNode(); n; n = walk.nextNode())
      if ((n as Comment).data === `?start name="${name}"`) {
        start = n;
        break;
      }
    if (!start) continue;
    let depth = 0;
    let n = start.nextSibling;
    while (n) {
      const next = n.nextSibling;
      const data = n.nodeType === 8 ? (n as Comment).data : "";
      if (data.startsWith("?start")) depth++;
      else if (data.startsWith("?end") && depth-- === 0) {
        n.remove();
        break;
      }
      n.remove();
      n = next;
    }
    start.parentNode!.replaceChild(t.content.cloneNode(true), start);
    t.remove();
  }
}

// What the user sees after each chunk: the text outside templates/scripts,
// deduplicated across chunks that change nothing.
async function timeline(code: () => any): Promise<string[]> {
  const parts = await chunks(code, { noScripts: true });
  const states: string[] = [];
  let html = "";
  for (const part of parts) {
    html += part;
    // these apps render no document shell: give their markup a body
    const doc = new JSDOM("<body>" + html).window.document;
    patch(doc);
    for (const el of doc.querySelectorAll("template, script, style")) el.remove();
    const text = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
    if (states[states.length - 1] !== text) states.push(text);
  }
  return states;
}

const Item = (p: { name: string; ms: number }) => {
  const v = createMemo(() => delay(p.ms).then(() => p.name.toUpperCase()));
  return <b>{v()} </b>;
};

const Slot = (p: { name: string; ms: number }) => (
  <Loading fallback={<i>{p.name}… </i>}>
    <Item name={p.name} ms={p.ms} />
  </Loading>
);

// Settles before the shell flushes, `turns` microtask turns in.
const Ready = (p: { name: string; turns?: number }) => {
  const settle = (n: number): Promise<string> =>
    n ? Promise.resolve().then(() => settle(n - 1)) : Promise.resolve(p.name.toUpperCase());
  const v = createMemo(() => settle(p.turns || 0));
  return <b>{v()} </b>;
};

// a settles last, b first, c second
const slots = () => [
  <Slot name="a" ms={60} />,
  <Slot name="b" ms={20} />,
  <Slot name="c" ms={40} />
];

describe("templateFor: <Reveal> patched natively with scripts off", () => {
  test("no Reveal: each boundary patches as it settles", async () => {
    expect(await timeline(() => <div>{slots()}</div>)).toEqual([
      "a… b… c…",
      "a… B c…",
      "a… B C",
      "A B C"
    ]);
  });

  test("sequential: nothing passes the frontier", async () => {
    expect(await timeline(() => <Reveal>{slots()}</Reveal>)).toEqual(["a… b… c…", "A B C"]);
  });

  test("together: the group lands at once", async () => {
    expect(await timeline(() => <Reveal order="together">{slots()}</Reveal>)).toEqual([
      "a… b… c…",
      "A B C"
    ]);
  });

  test("natural: each slot as it settles", async () => {
    expect(await timeline(() => <Reveal order="natural">{slots()}</Reveal>)).toEqual([
      "a… b… c…",
      "a… B c…",
      "a… B C",
      "A B C"
    ]);
  });

  test("sequential, in order of settling: one slot at a time", async () => {
    expect(
      await timeline(() => (
        <Reveal>
          <Slot name="a" ms={20} />
          <Slot name="b" ms={40} />
          <Slot name="c" ms={60} />
        </Reveal>
      ))
    ).toEqual(["a… b… c…", "A b… c…", "A B c…", "A B C"]);
  });

  test("collapsed: only the frontier's fallback shows, and it advances", async () => {
    expect(
      await timeline(() => (
        <Reveal collapsed>
          <Slot name="a" ms={20} />
          <Slot name="b" ms={60} />
          <Slot name="c" ms={40} />
        </Reveal>
      ))
    ).toEqual(["a…", "A b…", "A B C"]);
  });

  test("a boundary nested in held content lands after it", async () => {
    const Outer = () => {
      const v = createMemo(() => delay(20).then(() => "OUTER"));
      return (
        <section>
          {v()}{" "}
          <Loading fallback={<i>inner… </i>}>
            <Item name="inner" ms={30} />
          </Loading>
        </section>
      );
    };
    expect(
      await timeline(() => (
        <Reveal>
          <Slot name="a" ms={60} />
          <Loading fallback={<i>outer… </i>}>
            <Outer />
          </Loading>
        </Reveal>
      ))
    ).toEqual(["a… outer…", "A OUTER INNER"]);
  });

  test("nested Reveal is held by its parent's frontier", async () => {
    expect(
      await timeline(() => (
        <Reveal>
          <Slot name="a" ms={60} />
          <Reveal order="natural">
            <Slot name="b" ms={20} />
            <Slot name="c" ms={40} />
          </Reveal>
        </Reveal>
      ))
    ).toEqual(["a… b… c…", "A B C"]);
  });

  test("every held fragment goes out as a `for` template, before its activation", async () => {
    const html = (await chunks(() => <Reveal>{slots()}</Reveal>)).join("");
    const fors = [...html.matchAll(/<template id="(\d+)" for="\1">/g)].map(m => m.index!);
    expect(fors.length).toBe(3);
    const activation = html.indexOf('$dfj(["');
    expect(activation).toBeGreaterThan(fors[0]);
    // the runtime (and its disarm pass) still precedes the first `for` template
    expect(html.indexOf("$dpi(document)")).toBeLessThan(fors[0]);
  });

  // Slot a settles while the enclosing boundary is still pending, so slot
  // b's fallback patch waits on that boundary, which then inlines.
  test("collapsed in a boundary that settles with the shell: the frontier's fallback shows", async () => {
    const states = await timeline(() => (
      <Loading fallback={<i>outer… </i>}>
        <Ready name="o" turns={6} />
        <Reveal collapsed>
          <Loading fallback={<i>a… </i>}>
            <Ready name="a" />
          </Loading>
          <Slot name="b" ms={20} />
          <Slot name="c" ms={40} />
        </Reveal>
      </Loading>
    ));
    expect(states).toContain("O A b…");
    expect(states[states.length - 1]).toBe("O A B C");
  });
});
