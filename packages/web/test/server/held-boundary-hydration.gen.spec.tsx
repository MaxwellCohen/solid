/**
 * @jsxImportSource @solidjs/web
 *
 * Server half of test/hydration/held-boundary-hydration.spec.tsx: renders
 * the fixture in each shape and writes its shell plus each later chunk.
 */
import { expect, test } from "vitest";
import { NoHydration, renderToString } from "@solidjs/web";
import { createHeldApp, manifest, SHAPES } from "../harness/held-boundary-hydration.jsx";
import { recordStream, writeArtifact } from "./artifact-recorder.js";

const LAZY = [
  "nested",
  "hide",
  "reorder",
  "reorder-claimed",
  "cut",
  "beside",
  "no-hydration",
  "between",
  "root",
  "preload-retry"
];
// settled in the shell: nothing streams
const SHELL = ["reorder", "reorder-claimed", "beside", "no-hydration", "root"];

for (const shape of SHAPES) {
  test(`render held-boundary-hydration (${shape}) chunks`, async () => {
    const { App, preload } = createHeldApp(shape);
    await preload();
    const { shell, chunks, rest } = await recordStream(() => <App />, { manifest });
    // a boundary with lazy content names the module's client entry
    expect((shell + rest).includes('_assets"]=')).toBe(LAZY.includes(shape));
    expect(chunks.length > 0).toBe(!SHELL.includes(shape));
    // A boundary whose content loads a module marks the markup it holds.
    expect(/<!--ph-(\w+)-->[\s\S]*<!--\/ph-\1-->/.test(shell + chunks.join(""))).toBe(
      LAZY.includes(shape)
    );
    writeArtifact(`held-boundary-hydration-${shape}`, { shell, chunks });
  });
}

test("every render mode marks a module-loading boundary's markup; <NoHydration> does not", async () => {
  const { App, preload } = createHeldApp("beside");
  await preload();
  const html = renderToString(() => <App />, { manifest } as any);
  expect(html).toMatch(/<!--ph-(\w+)--><b[^>]*id="a"[\s\S]*?<\/b><!--\/ph-\1-->/);
  const plain = renderToString(() => (
    <NoHydration>
      <App />
    </NoHydration>
  ));
  expect(plain).toContain('id="a"');
  expect(plain).not.toContain("<!--ph-");
});
