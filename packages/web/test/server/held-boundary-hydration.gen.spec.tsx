/**
 * @jsxImportSource @solidjs/web
 *
 * Server half of test/hydration/held-boundary-hydration.spec.tsx: renders
 * the fixture in each shape and writes its shell plus each later chunk.
 */
import { expect, test } from "vitest";
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
    writeArtifact(`held-boundary-hydration-${shape}`, { shell, chunks });
  });
}
