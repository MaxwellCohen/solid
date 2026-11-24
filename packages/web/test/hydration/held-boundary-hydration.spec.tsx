/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 *
 * A boundary that cannot claim its server markup yet still holds its place
 * on the page. The slot it renders into tracks the nodes the server put
 * there, so:
 *
 * - `nested`: an enclosing boundary's resume leaves them alone, and the
 *   boundary claims them when its module lands;
 * - `hide`: a `<Show>` that hides the boundary takes them out;
 * - `reorder`: a reorder moves the boundary, which then renders fresh;
 * - `no-hydration`: markup the client never claims stays when the waiting
 *   boundary resumes;
 * - `reorder-claimed`: a reorder that puts claimed rows ahead of a waiting
 *   one leaves each row its own nodes;
 * - `pending`, `pending-text`: a reorder moves a pending boundary with its
 *   whole placeholder range, and each fragment lands at its row;
 * - `collapsed`: the fallback the inline runtime shows for the next slot of
 *   a collapsed `<Reveal>` is hydrated;
 * - `tail`: text after the boundary in the same slot keeps its own node;
 * - `tails`: several boundaries wait in one slot with text between them, and
 *   each still claims its server markup;
 * - `same-tail`: text that ends a waiting boundary's content and the same
 *   text after the boundary each keep their node;
 * - `beside`, `between`: a sibling that changes, or a third boundary that
 *   resumes, leaves the waiting boundaries' server markup where it is;
 * - `root`: at the hydration root, what else the container holds stays;
 * - `preload-retry`: a module load that fails before the fragment arrives
 *   does not take the swapped-in content out;
 * - `under-held`, `under-held-collapsed`: a fragment, or a collapsed slot's
 *   fallback, that lands inside content its enclosing boundary has not
 *   claimed yet waits for its own boundary, and is claimed with the rest;
 * - `throws`: an error in the resume the inline runtime starts does not stop
 *   the runtime;
 * - `cut`: a stream cut before the fragment renders the content fresh, its
 *   `lazy()` loading through its own import.
 *
 * Replays the chunks test/server/held-boundary-hydration.gen.spec.tsx renders.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { flush, resetErrorHalt } from "solid-js";
import { hydrate } from "@solidjs/web";
import { createHeldApp, Late, type Shape } from "../harness/held-boundary-hydration.jsx";
import { bootstrapHydrationGlobal } from "../harness/hydration-bootstrap.js";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function settle() {
  for (let i = 0; i < 3; i++) {
    await sleep(5);
    flush();
  }
}

const recording = (shape: Shape) =>
  JSON.parse(
    readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        `../harness/__artifacts__/held-boundary-hydration-${shape}.json`
      ),
      "utf-8"
    )
  ) as { shell: string; chunks: string[] };

// The stream as the parser meets it: markup, then each inline script in
// turn. Every <b> the response carries is the server's: tag it.
function steps(container: HTMLElement, chunk: string, first: boolean): (() => void)[] {
  const scriptRe = /<script(?:[^>]*)>([\s\S]*?)<\/script>/g;
  const scripts = [...chunk.matchAll(scriptRe)].map(m => m[1]);
  const markup = () => {
    const stripped = chunk.replace(scriptRe, "");
    if (first) container.innerHTML = stripped;
    else container.insertAdjacentHTML("beforeend", stripped);
    for (const b of container.querySelectorAll("b")) (b as any).$server = true;
    for (const t of container.querySelectorAll("template"))
      for (const b of t.content.querySelectorAll("b")) (b as any).$server = true;
  };
  return [markup, ...scripts.map(s => () => (0, eval)(s))];
}

type Page = {
  container: HTMLElement;
  main: () => HTMLElement;
  app: ReturnType<typeof createHeldApp>;
  hy: any;
  /** The late module arrives. */
  land: () => void;
  /** The next load of the late module fails when the returned function is called. */
  failNextLoad: () => () => void;
  /** Starts hydration (once). */
  start: () => void;
  hydrated: () => boolean;
};

async function withPage(shape: Shape, body: (page: Page) => Promise<void>, expected?: RegExp) {
  const hy = bootstrapHydrationGlobal();
  delete (globalThis as any).$R;
  // Every module the client is asked to load is the late one, held at `land`.
  // A failed load leaves no entry, as `loadModuleAssets` leaves none.
  let land!: () => void;
  const landed = new Promise<void>(r => (land = r));
  let failNext = false;
  let fail = () => {};
  hy.modules = {};
  hy.loading = new Proxy({} as Record<string, Promise<void>>, {
    get: (loading, key: string) => {
      if (!loading[key] && failNext) {
        failNext = false;
        const failed = new Promise<void>(
          (_, reject) => (fail = () => reject(new Error("offline")))
        );
        failed.catch(() => delete loading[key]);
        return (loading[key] = failed);
      }
      return (loading[key] ??= landed.then(() => void (hy.modules[key] = { default: Late })));
    }
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const container = document.createElement("div");
  document.body.appendChild(container);
  const app = createHeldApp(shape);
  let dispose: (() => void) | undefined;
  try {
    await body({
      container,
      main: () => container.querySelector("main")!,
      app,
      hy,
      land,
      failNextLoad: () => ((failNext = true), () => fail()),
      start: () => (dispose ??= hydrate(() => <app.App />, container)),
      hydrated: () => !!dispose
    });
    const diagnostics = [...warn.mock.calls, ...error.mock.calls].map(c => String(c[0]));
    expect(diagnostics.filter(d => !expected?.test(d))).toEqual([]);
  } finally {
    dispose?.();
    container.remove();
    warn.mockRestore();
    error.mockRestore();
  }
}

/**
 * Replays the whole response, starting hydration after step `startAt`.
 * `act` runs once, as soon as the page is hydrated and chunk `at` has been
 * parsed; `between` runs after each later chunk has settled.
 */
async function replay(
  page: Page,
  shape: Shape,
  startAt: number,
  at = 0,
  act?: () => void,
  between?: (chunk: number, acted: boolean) => void
) {
  const { shell, chunks } = recording(shape);
  let step = 0,
    acted = false;
  for (const [i, chunk] of [shell, ...chunks].entries()) {
    for (const run of steps(page.container, chunk, i === 0)) {
      run();
      if (++step === startAt) page.start();
    }
    await settle();
    if (act && !acted && page.hydrated() && i >= at) {
      acted = true;
      act();
      await settle();
    }
    between?.(i, acted);
  }
}

const ids = (root: ParentNode) => [...root.querySelectorAll("b")].map(b => b.id);
const scaffolding = (main: HTMLElement) =>
  [...main.childNodes].filter(
    n =>
      (n as Element).localName === "template" ||
      n.nodeType === 7 ||
      (n.nodeType === 8 && /^(pl-|\?start|\?end)/.test(n.nodeValue!))
  ).length;

afterEach(async () => {
  await sleep(0);
  delete (globalThis as any)._$HY;
});

// Hydration can start anywhere in the stream: the entry module runs
// whenever it has loaded. (It follows the shell's own scripts, which declare
// what the stream will settle.)
function everyStart(shape: Shape, run: (startAt: number, count: number) => Promise<void>) {
  const { shell, chunks } = recording(shape);
  const stepsOf = (c: string) => 1 + [...c.matchAll(/<script/g)].length;
  const count = [shell, ...chunks].reduce((n, c) => n + stepsOf(c), 0);
  for (let startAt = stepsOf(shell); startAt <= count; startAt++)
    test(`${shape}, hydrating after step ${startAt}/${count}`, () => run(startAt, count));
}

describe("a boundary that cannot claim yet holds its place", () => {
  everyStart("nested", startAt =>
    withPage("nested", async page => {
      await replay(page, "nested", startAt);
      // The enclosing boundary has resumed; the inner one waits on its module.
      const a = page.container.querySelector("#a") as any;
      expect(page.main().textContent).toBe("a:0b:0");
      page.land();
      await settle();
      expect(page.main().textContent).toBe("a:0b:0");
      expect(page.container.querySelector("#a")).toBe(a);
      expect(a.$server).toBe(true);
      expect(page.container.querySelectorAll("i").length).toBe(0);
      a.click();
      flush();
      expect(a.textContent).toBe("a:1");
      expect(page.hy.done).toBe(true);
      // The swap's node list is let go once every boundary has claimed.
      expect(Object.values(page.hy.v)).toEqual([1]);
    })
  );

  everyStart("hide", startAt =>
    withPage("hide", async page => {
      // Hidden once the fragment is in: the content waits on its module.
      await replay(page, "hide", startAt, 1, page.app.hide);
      expect(page.main().textContent).toBe("z:0");
      expect(scaffolding(page.main())).toBe(0);
      page.land();
      await settle();
      expect(page.main().textContent).toBe("z:0");
      expect(page.hy.done).toBe(true);
    })
  );

  everyStart("reorder", startAt =>
    withPage("reorder", async page => {
      await replay(page, "reorder", startAt, 0, page.app.reverse);
      page.land();
      await settle();
      expect(ids(page.main())).toEqual(["c", "b", "a"]);
      expect(page.main().textContent).toBe("c:0b:0a:0");
      const b = page.container.querySelector("#b") as HTMLElement;
      b.click();
      flush();
      expect(b.textContent).toBe("b:1");
      expect(page.hy.done).toBe(true);
    })
  );

  for (const shape of ["pending", "pending-text"] as const)
    everyStart(shape, startAt =>
      withPage(shape, async page => {
        await replay(page, shape, startAt, 0, page.app.reverse);
        expect(ids(page.main())).toEqual(["c", "b", "a"]);
        expect(page.main().textContent).toBe("c:0b:0a:0");
        expect(scaffolding(page.main())).toBe(0);
        const a = page.container.querySelector("#a") as any;
        a.click();
        flush();
        expect(a.textContent).toBe("a:1");
        expect(page.hy.done).toBe(true);
      })
    );

  everyStart("no-hydration", startAt =>
    withPage("no-hydration", async page => {
      await replay(page, "no-hydration", startAt);
      page.land();
      await settle();
      expect(page.main().textContent).toBe("statica:0");
      expect((page.container.querySelector("#a") as any).$server).toBe(true);
      expect(page.hy.done).toBe(true);
    })
  );

  everyStart("reorder-claimed", startAt =>
    withPage("reorder-claimed", async page => {
      await replay(page, "reorder-claimed", startAt, 0, page.app.reverse);
      expect(ids(page.main())).toEqual(["c", "b", "a"]);
      page.land();
      await settle();
      expect(ids(page.main())).toEqual(["c", "b", "a"]);
      expect(page.main().textContent).toBe("c:0b:0a:0");
      const [c, b] = [...page.main().querySelectorAll("b")] as any[];
      expect(c.$server && b.$server).toBe(true);
      b.click();
      flush();
      expect(b.textContent).toBe("b:1");
      expect(page.hy.done).toBe(true);
    })
  );

  // A fragment that lands after the reorder is claimed where it landed.
  test("pending: fragments that follow the reorder are claimed in place", () =>
    withPage("pending", async page => {
      const { shell } = recording("pending");
      const shellSteps = 1 + [...shell.matchAll(/<script/g)].length;
      await replay(page, "pending", shellSteps, 0, page.app.reverse);
      expect([...page.main().querySelectorAll("b")].every(b => (b as any).$server)).toBe(true);
    }));

  everyStart("collapsed", startAt =>
    withPage("collapsed", async page => {
      const { chunks } = recording("collapsed");
      // Relabelled once slot a is in: the runtime has shown slot b's fallback.
      await replay(page, "collapsed", startAt, 1, page.app.relabel, (chunk, acted) => {
        if (acted && chunk < chunks.length)
          expect([...page.main().querySelectorAll("i")].map(i => i.textContent)).toEqual(
            chunk === 1 ? ["still b"] : []
          );
      });
      expect(page.main().textContent).toBe("a:0b:0");
      expect(scaffolding(page.main())).toBe(0);
      expect(page.hy.done).toBe(true);
    })
  );

  everyStart("tail", startAt =>
    withPage("tail", async page => {
      const { chunks } = recording("tail");
      await replay(page, "tail", startAt, 0, undefined, chunk => {
        if (chunk) expect(page.main().textContent).toBe("a:0umoretail");
      });
      expect(chunks.length).toBeGreaterThan(0);
      const a = page.container.querySelector("#a") as any;
      expect(a.$server).toBe(true);
      expect(page.container.querySelectorAll("i").length).toBe(0);
      a.click();
      flush();
      expect(page.main().textContent).toBe("a:1umoretail");
      expect(page.hy.done).toBe(true);
    })
  );

  everyStart("beside", startAt =>
    withPage("beside", async page => {
      await replay(page, "beside", startAt, 0, page.app.flag);
      // The sibling is in, and the boundary's server markup did not move.
      const a = page.container.querySelector("#a") as any;
      expect(page.main().innerHTML.replace(/<!--.*?-->| _hk="[^"]*"/g, "")).toBe(
        '<u>s</u><b id="a">a:0</b><em>e</em>'
      );
      expect(a.$server).toBe(true);
      page.land();
      await settle();
      expect(page.container.querySelector("#a")).toBe(a);
      expect(page.main().textContent).toBe("sa:0e");
      a.click();
      flush();
      expect(a.textContent).toBe("a:1");
      expect(page.hy.done).toBe(true);
    })
  );

  everyStart("between", startAt =>
    withPage("between", async page => {
      await replay(page, "between", startAt);
      // c has resumed; a and b still wait on the module.
      expect(page.main().textContent).toBe("a:0~b:0b2:0c:0");
      page.land();
      await settle();
      expect(page.main().textContent).toBe("a:0~b:0b2:0c:0");
      expect([...page.main().querySelectorAll("b")].every(b => (b as any).$server)).toBe(true);
      expect(page.hy.done).toBe(true);
    })
  );

  test("root: what else the container holds stays when the boundary resumes", () =>
    withPage("root", async page => {
      const { shell } = recording("root");
      for (const run of steps(page.container, shell, true)) run();
      // what a stream leaves in the container beside the app's markup
      page.container.insertAdjacentHTML(
        "beforeend",
        '<link rel="stylesheet" href="data:text/css,"><script type="text/plain">x</script>'
      );
      page.start();
      await settle();
      page.land();
      await settle();
      expect(page.container.querySelector("link")).not.toBe(null);
      expect(page.container.querySelector("script")).not.toBe(null);
      const a = page.container.querySelector("#a") as any;
      expect(a.$server).toBe(true);
      a.click();
      flush();
      expect(a.textContent).toBe("a:1");
      expect(page.hy.done).toBe(true);
    }));

  test("preload-retry: a load that failed before the fragment arrived leaves the swapped-in content", () =>
    withPage(
      "preload-retry",
      async page => {
        const { shell, chunks } = recording("preload-retry");
        for (const run of steps(page.container, shell, true)) run();
        const fail = page.failNextLoad();
        page.start();
        await settle();
        fail();
        await settle();
        for (const chunk of chunks) {
          for (const run of steps(page.container, chunk, false)) run();
          await settle();
        }
        page.land();
        await settle();
        expect(page.main().textContent).toBe("a:0");
        expect((page.container.querySelector("#a") as any).$server).toBe(true);
        expect(page.hy.done).toBe(true);
      },
      /module preload failed/
    ));

  for (const [shape, text] of [
    ["tails", "N1N0~N2~N4N3"],
    ["same-tail", "N0N1N2N4N3~~"],
    ["under-held", "N3N0N1N2~N4"],
    ["under-held-collapsed", "N3N0~N1N2N4N5N6~"]
  ] as const)
    everyStart(shape, startAt =>
      withPage(shape, async page => {
        await replay(page, shape, startAt);
        expect(page.main().textContent).toBe(text);
        expect([...page.main().querySelectorAll("b")].every(b => (b as any).$server)).toBe(true);
        expect(page.container.querySelectorAll("main i").length).toBe(0);
        expect(scaffolding(page.main())).toBe(0);
        expect(page.hy.done).toBe(true);
      })
    );

  test("throws: an error in a resume the inline runtime starts does not stop the runtime", () =>
    withPage(
      "throws",
      async page => {
        const { shell, chunks } = recording("throws");
        // The resume rethrows from a microtask: collect it there.
        const thrown: unknown[] = [];
        const queue = globalThis.queueMicrotask;
        globalThis.queueMicrotask = fn =>
          queue(() => {
            try {
              fn();
            } catch (err) {
              thrown.push(err);
            }
          });
        try {
          for (const run of steps(page.container, shell, true)) run();
          page.start();
          await settle();
          page.app.arm();
          // Slot a is swapped in and slot b's fallback shown: hydrating it throws.
          for (const chunk of chunks) {
            for (const run of steps(page.container, chunk, false)) run();
            await settle();
          }
          expect(thrown.map(e => (e as Error).message)).toContain("boom");
          // The stream still landed: both slots show the server's content
          // (unclaimed: the client halted).
          expect(page.main().textContent).toBe("a:0b:0");
        } finally {
          globalThis.queueMicrotask = queue;
          resetErrorHalt();
        }
      },
      /REACTIVITY_HALTED|boom|unclaimed server-rendered/
    ));

  // Last: the ledger's truncation record is module state, and a boundary id
  // it marks stays marked for the rest of the file.
  test("cut: the content renders fresh and its lazy() loads through its import", () =>
    withPage("cut", async page => {
      Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
      try {
        const { shell } = recording("cut");
        for (const run of steps(page.container, shell, true)) run();
        page.start();
        await settle();
        expect(page.main().textContent).toBe("f");
        // The parser finishing: the document transport's close.
        Object.defineProperty(document, "readyState", { value: "interactive", configurable: true });
        document.dispatchEvent(new Event("DOMContentLoaded"));
        await sleep(30);
        await settle();
        expect(page.main().textContent).toBe("a:0");
        expect(page.hy.done).toBe(true);
      } finally {
        delete (document as any).readyState;
      }
    }));
});
