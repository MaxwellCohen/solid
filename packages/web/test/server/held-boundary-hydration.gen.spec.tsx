/**
 * @jsxImportSource @solidjs/web
 *
 * Server half of test/hydration/held-boundary-hydration.spec.tsx: renders
 * the fixture in each shape and writes its shell plus each later chunk.
 */
import { expect, test } from "vitest";
import { createHeldApp, manifest, SHAPES } from "../harness/held-boundary-hydration.jsx";
import { recordStream, writeArtifact } from "./artifact-recorder.js";

const LAZY = ["nested", "hide", "reorder", "cut"];

for (const shape of SHAPES) {
  test(`render held-boundary-hydration (${shape}) chunks`, async () => {
    const { App, preload } = createHeldApp(shape);
    await preload();
    const { shell, chunks, rest } = await recordStream(() => <App />, { manifest });
    // a boundary with lazy content names the module's client entry
    expect((shell + rest).includes('_assets"]=')).toBe(LAZY.includes(shape));
    // `reorder` settles in the shell; every other shape streams
    expect(chunks.length > 0).toBe(shape !== "reorder");
    writeArtifact(`held-boundary-hydration-${shape}`, { shell, chunks });
  });
}
