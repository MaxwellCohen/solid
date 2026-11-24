/**
 * @jsxImportSource @solidjs/web
 *
 * Server half of test/hydration/reveal-held-hydration.spec.tsx: renders the
 * fixture in each Reveal order and writes its shell plus each later chunk.
 */
import { expect, test } from "vitest";
import { createRevealApp, ORDERS } from "../harness/reveal-held-hydration.jsx";
import { recordStream, writeArtifact } from "./artifact-recorder.js";

for (const order of ORDERS) {
  test(`render reveal-held-hydration (${order}) chunks`, async () => {
    const App = createRevealApp(order);
    const { shell, chunks } = await recordStream(() => <App />);
    const rest = chunks.join("");
    // every fragment ships as a `for` template
    expect(rest.match(/<template id="([^"]+)" for="\1">/g)?.length).toBe(
      order === "all" ? 3 * (ORDERS.length - 2) : 3
    );
    writeArtifact(`reveal-held-hydration-${order}`, { shell, chunks });
  });
}
