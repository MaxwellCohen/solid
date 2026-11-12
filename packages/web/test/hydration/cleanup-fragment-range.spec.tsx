/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
// `cleanupFragment` over a document stream's placeholder: the range runs from
// `<?start>` to the `<?end>` that balances it, past a range nested in the
// fallback — as processing instructions (a parser that has them, before the
// inline runtime ran), as comments, and in the plain `pl-*` shape.
import { afterEach, describe, expect, test } from "vitest";
import { hydrate } from "@solidjs/web";
import { sharedConfig } from "solid-js/internal";

const RANGE =
  '<p>a</p><!--?start name="A"--><template id="pl-A"></template><i>a</i>' +
  '<!--?start name="B"--><template id="pl-B"></template><i>b</i><!--?end-->' +
  "<u>tail ?end pl-A</u>?end<!--?end--><p>z</p>";

/** Turn every marker comment into the processing instruction a native parser leaves. */
function native(root: Node) {
  const walk = document.createTreeWalker(root, 128);
  const comments: Comment[] = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) comments.push(n as Comment);
  for (const c of comments) {
    const m = /^\?(start|end)(?: (.*))?$/.exec(c.data);
    if (m) c.replaceWith(document.createProcessingInstruction(m[1], m[2] || ""));
  }
}

function boot(html: string) {
  (globalThis as any)._$HY = { r: {}, events: [], completed: new WeakSet(), fe() {} };
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  const dispose = hydrate(() => undefined, document.createElement("div"));
  return { root, dispose };
}

describe("cleanupFragment", () => {
  let dispose: (() => void) | undefined;
  afterEach(() => {
    dispose?.();
    document.body.innerHTML = "";
  });

  test("comment range: removes through the balancing end, nested range included", () => {
    const b = boot(RANGE);
    dispose = b.dispose;
    sharedConfig.cleanupFragment!("A");
    expect(b.root.innerHTML).toBe("<p>a</p><p>z</p>");
  });

  test("processing-instruction range", () => {
    const b = boot(RANGE);
    dispose = b.dispose;
    native(b.root);
    expect(b.root.childNodes[1].nodeType).toBe(7);
    sharedConfig.cleanupFragment!("A");
    expect(b.root.innerHTML).toBe("<p>a</p><p>z</p>");
  });

  test("the nested range alone leaves the outer one standing", () => {
    const b = boot(RANGE);
    dispose = b.dispose;
    sharedConfig.cleanupFragment!("B");
    expect(b.root.innerHTML).toBe(
      '<p>a</p><!--?start name="A"--><template id="pl-A"></template><i>a</i>' +
        "<u>tail ?end pl-A</u>?end<!--?end--><p>z</p>"
    );
  });

  test("plain `pl-*` scaffold (frame streams)", () => {
    const b = boot('<p>a</p><template id="pl-L"></template><i>l</i>pl-L<!--pl-L--><p>z</p>');
    dispose = b.dispose;
    sharedConfig.cleanupFragment!("L");
    expect(b.root.innerHTML).toBe("<p>a</p><p>z</p>");
  });
});
