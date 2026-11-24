/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 *
 * Fragments a `<Reveal>` held and then released together hydrate the
 * server's markup in place. The group's release swaps two or three
 * fragments into the document in one batch; each boundary resumes when its
 * `_fr` settles. A boundary must claim the content its swap put there, not
 * render it fresh and discard the server's nodes.
 *
 * Replays the chunks test/server/reveal-held-hydration.gen.spec.tsx renders.
 */
import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { flush } from "solid-js";
import { hydrate } from "@solidjs/web";
import { createRevealApp, ORDERS } from "../harness/reveal-held-hydration.jsx";
import { bootstrapHydrationGlobal } from "../harness/hydration-bootstrap.js";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function settle() {
  for (let i = 0; i < 3; i++) {
    await sleep(5);
    flush();
  }
}

// The stream as the parser meets it: markup, then each inline script in
// turn. Content swapped in by the runtime is the server's: tag it.
function steps(container: HTMLElement, chunk: string, first: boolean): (() => void)[] {
  const scriptRe = /<script(?:[^>]*)>([\s\S]*?)<\/script>/g;
  const scripts = [...chunk.matchAll(scriptRe)].map(m => m[1]);
  const markup = () => {
    const stripped = chunk.replace(scriptRe, "");
    if (first) container.innerHTML = stripped;
    else container.insertAdjacentHTML("beforeend", stripped);
    for (const t of container.querySelectorAll("template"))
      for (const b of (t as HTMLTemplateElement).content?.querySelectorAll("b") ?? [])
        (b as any).$server = true;
  };
  return [markup, ...scripts.map(s => () => (0, eval)(s))];
}

describe("held reveal fragments hydrate in place", () => {
  for (const order of ORDERS) {
    const { shell, chunks } = JSON.parse(
      readFileSync(
        resolve(
          dirname(fileURLToPath(import.meta.url)),
          `../harness/__artifacts__/reveal-held-hydration-${order}.json`
        ),
        "utf-8"
      )
    ) as { shell: string; chunks: string[] };
    // Hydration can start anywhere in the stream — the entry module runs
    // whenever it has loaded: before any chunk, between a reveal's script
    // and the one that settles it, or after the whole response.
    const stepsOf = (c: string) => 1 + [...c.matchAll(/<script/g)].length;
    const count = [shell, ...chunks].reduce((n, c) => n + stepsOf(c), 0);
    // (The entry module follows the shell's own scripts, which declare what
    // the stream will settle.)
    for (let startAt = stepsOf(shell); startAt <= count; startAt++) {
      test(`${order}, hydrating after step ${startAt}/${count}`, async () => {
        bootstrapHydrationGlobal();
        delete (globalThis as any).$R;
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const container = document.createElement("div");
        document.body.appendChild(container);
        const App = createRevealApp(order);
        let dispose: (() => void) | undefined;
        try {
          let step = 0;
          for (const [i, chunk] of [shell, ...chunks].entries()) {
            for (const run of steps(container, chunk, i === 0)) {
              run();
              if (++step === startAt) dispose = hydrate(() => <App />, container);
              // A `together` group shows all of its content or none, at every
              // step: a swap does not wait for the settlement that follows it.
              if (order === "together")
                expect([0, 3]).toContain(container.querySelectorAll("main > b").length);
            }
            await settle();
          }
          const svg = order === "svg";
          const shown = [...container.querySelectorAll(svg ? "text" : "b")];
          const groups = order === "all" ? ORDERS.length - 2 : 1;
          expect(shown.map(b => b.textContent)).toEqual(
            Array.from({ length: groups }, () => ["A", "B", "C"]).flat()
          );
          // The swapped-in server nodes, claimed in place. (The SVG swap
          // reparses its payload into the SVG namespace: new nodes.)
          if (!svg) expect(shown.every(b => (b as any).$server)).toBe(true);
          expect(container.querySelectorAll(svg ? "desc" : "i").length).toBe(0);
          const diagnostics = [...warn.mock.calls, ...error.mock.calls].map(c => String(c[0]));
          expect(diagnostics).toEqual([]);
        } finally {
          dispose?.();
          container.remove();
          warn.mockRestore();
          error.mockRestore();
        }
      });
    }
  }
});
