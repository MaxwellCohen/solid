/**
 * @jsxImportSource @solidjs/web
 *
 * Boundaries the client cannot claim yet — the content's `lazy()` module has
 * not loaded, or the fragment has not arrived — while the page around them
 * moves on: an enclosing boundary resumes, a list reorders, a `<Show>` hides
 * the boundary, a collapsed `<Reveal>` shows the next fallback (which may
 * fail to hydrate), text follows the boundary in its slot, a nested fragment
 * or a nested collapsed fallback lands inside content a boundary has not
 * claimed yet, the stream is cut.
 *
 * Compiled with both generates: test/server/held-boundary-hydration.gen.spec.tsx
 * writes the chunks test/hydration/held-boundary-hydration.spec.tsx replays.
 */
import { createMemo, createSignal, For, lazy, Loading, Reveal, Show } from "solid-js";
import { NoHydration } from "@solidjs/web";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const SHAPES = [
  "nested",
  "hide",
  "reorder",
  "reorder-claimed",
  "pending",
  "pending-text",
  "collapsed",
  "tail",
  "tails",
  "same-tail",
  "beside",
  "no-hydration",
  "between",
  "root",
  "preload-retry",
  "fresh-over-span",
  "under-held",
  "under-held-collapsed",
  "throws",
  "cut"
] as const;
export type Shape = (typeof SHAPES)[number];

/** The module every `lazy()` here loads; `manifest` names its client entry. */
export const Late = (props: { children: any }) => props.children;
const LATE = "late.js";
export const manifest = { [LATE]: { file: LATE } };

/** Settles after `ms` on the server; the client adopts the answer. */
function Wait(props: { ms: number; children: any }) {
  const ready = createMemo(() => sleep(props.ms).then(() => true));
  return <>{(ready(), props.children)}</>;
}

function Item(props: { name: string }) {
  const [n, setN] = createSignal(0);
  return (
    <b id={props.name} onClick={() => setN(n() + 1)}>
      {props.name}:{n()}
    </b>
  );
}

/** A boundary whose own read settles after `ms`; its children are boundaries inside it. */
function Part(props: { name: string; ms: number; children?: any }) {
  const Read = () => {
    const value = createMemo(() => sleep(props.ms).then(() => props.name.toUpperCase()));
    return <b>{value()}</b>;
  };
  return (
    <Loading fallback={<i>{props.name}</i>}>
      <Read />
      {props.children}
    </Loading>
  );
}

export function createHeldApp(shape: Shape) {
  const LateBox = lazy(() => Promise.resolve({ default: Late }), undefined, LATE);
  const [show, setShow] = createSignal(true);
  const [order, setOrder] = createSignal(["a", "b", "c"]);
  const [label, setLabel] = createSignal("wait");
  const ms = (k: string) => 10 * (1 + "abc".indexOf(k));
  // A fallback that fails where it hydrates, once armed (the client).
  let armed = false;
  const Boom = () => {
    if (armed) throw new Error("boom");
    return <i>wait b</i>;
  };
  const [flag, setFlag] = createSignal(false);
  // No wrapping element: the boundary sits at the hydration root, beside
  // whatever else the container holds.
  if (shape === "root")
    return {
      App: () => (
        <>
          <em>z</em>
          <Loading fallback={<i>f</i>}>
            <LateBox>
              <Item name="a" />
            </LateBox>
          </Loading>
        </>
      ),
      ...controls()
    };
  const App = () => (
    <main>
      {shape === "nested" ? (
        <Loading fallback={<i>outer</i>}>
          <Wait ms={10}>
            <Loading fallback={<i>inner</i>}>
              <LateBox>
                <Item name="a" />
              </LateBox>
            </Loading>
            <Item name="b" />
          </Wait>
        </Loading>
      ) : shape === "hide" ? (
        <>
          <Show when={show()}>
            <Loading fallback={<i>f</i>}>
              <Wait ms={10}>
                <LateBox>
                  <Item name="a" />
                </LateBox>
              </Wait>
            </Loading>
          </Show>
          <Item name="z" />
        </>
      ) : shape === "reorder" ? (
        <For each={order()}>
          {k => (
            <Loading fallback={<i>{k}</i>}>
              {k === "c" ? (
                <Item name={k} />
              ) : (
                <LateBox>
                  <Item name={k} />
                </LateBox>
              )}
            </Loading>
          )}
        </For>
      ) : shape === "reorder-claimed" ? (
        // Only `a` waits on the module: `b` and `c` have claimed when the
        // list reverses.
        <For each={order()}>
          {k => (
            <Loading fallback={<i>{k}</i>}>
              {k === "a" ? (
                <LateBox>
                  <Item name={k} />
                </LateBox>
              ) : (
                <Item name={k} />
              )}
            </Loading>
          )}
        </For>
      ) : shape === "pending" || shape === "pending-text" ? (
        <For each={order()}>
          {k => (
            <Loading fallback={shape === "pending" ? <i>{k}</i> : "wait " + k}>
              <Wait ms={ms(k)}>
                <Item name={k} />
              </Wait>
            </Loading>
          )}
        </For>
      ) : shape === "tail" ? (
        <>
          <Loading fallback={<i>f</i>}>
            <Wait ms={10}>
              <Item name="a" />
              <u>u</u>
              {"more"}
            </Wait>
          </Loading>
          {"tail"}
        </>
      ) : shape === "no-hydration" ? (
        // Markup the client never claims, in a boundary that waits on its
        // module.
        <Loading fallback={<i>f</i>}>
          <LateBox>
            <NoHydration>
              <p id="st">static</p>
            </NoHydration>
            <Item name="a" />
          </LateBox>
        </Loading>
      ) : shape === "beside" ? (
        // The shell carries the content; a sibling in the slot changes while
        // the module loads.
        <>
          <Show when={flag()}>
            <u>s</u>
          </Show>
          <Loading fallback={<i>f</i>}>
            <LateBox>
              <Item name="a" />
            </LateBox>
          </Loading>
          <em>e</em>
        </>
      ) : shape === "between" ? (
        // Two boundaries wait on the module with text between them while a
        // third resumes.
        <>
          <Loading fallback={<i>fa</i>}>
            <LateBox>
              <Item name="a" />
            </LateBox>
          </Loading>
          {"~"}
          <Loading fallback={<i>fb</i>}>
            <LateBox>
              <Item name="b" />
              <Item name="b2" />
            </LateBox>
          </Loading>
          <Loading fallback={<i>fc</i>}>
            <Wait ms={10}>
              <Item name="c" />
            </Wait>
          </Loading>
        </>
      ) : shape === "fresh-over-span" ? (
        // A boundary waiting on its module holds another one that does.
        <Loading fallback={<i>f</i>}>
          <LateBox>
            <Item name="a" />
            <Loading fallback={<i>g</i>}>
              <LateBox>
                <Item name="b" />
              </LateBox>
            </Loading>
          </LateBox>
        </Loading>
      ) : shape === "preload-retry" ? (
        <Loading fallback={<i>f</i>}>
          <LateBox>
            <Wait ms={10}>
              <Item name="a" />
            </Wait>
          </LateBox>
        </Loading>
      ) : shape === "tails" ? (
        // n2 and n4 are released in one batch: two boundaries wait in the
        // slot, each followed by text.
        <Reveal>
          <Part name="n1" ms={0}>
            <Part name="n0" ms={30} />
          </Part>
          {"~"}
          <Part name="n2" ms={20} />
          {"~"}
          <Part name="n4" ms={5}>
            <Part name="n3" ms={0} />
          </Part>
        </Reveal>
      ) : shape === "same-tail" ? (
        // n4's content ends in the same text that follows n4 in the slot.
        <Reveal>
          <Reveal order="together" collapsed>
            <Part name="n0" ms={20} />
          </Reveal>
          <Reveal collapsed>
            <Part name="n1" ms={15} />
            <Part name="n2" ms={0} />
            <Part name="n4" ms={0}>
              <Part name="n3" ms={0} />
              {"~"}
            </Part>
            {"~"}
          </Reveal>
        </Reveal>
      ) : shape === "under-held" ? (
        // n3 and n4 are released together; n1's fragment follows n3's in the
        // same chunk, ahead of the settlement n3 claims at.
        <Reveal order="together">
          <Part name="n3" ms={5}>
            <Reveal order="natural">
              <Part name="n0" ms={0} />
              <Part name="n1" ms={5} />
              <Part name="n2" ms={20} />
            </Reveal>
          </Part>
          {"~"}
          <Part name="n4" ms={0} />
        </Reveal>
      ) : shape === "under-held-collapsed" ? (
        // The collapsed group inside n3 reaches n2 before n3's content is in
        // the document: n2's fallback is shown when that content lands.
        <Reveal order="together">
          <Part name="n3" ms={15}>
            <Reveal collapsed>
              <Part name="n0" ms={0} />
              {"~"}
              <Part name="n1" ms={0} />
              <Part name="n2" ms={20} />
            </Reveal>
          </Part>
          <Reveal collapsed>
            <Reveal collapsed>
              <Part name="n4" ms={10} />
              <Part name="n5" ms={0} />
            </Reveal>
            <Reveal order="natural">
              <Part name="n6" ms={10} />
              {"~"}
            </Reveal>
          </Reveal>
        </Reveal>
      ) : shape === "throws" ? (
        <Reveal collapsed>
          <Loading fallback={<i>wait a</i>}>
            <Wait ms={10}>
              <Item name="a" />
            </Wait>
          </Loading>
          <Loading fallback={<Boom />}>
            <Wait ms={30}>
              <Item name="b" />
            </Wait>
          </Loading>
        </Reveal>
      ) : shape === "collapsed" ? (
        <Reveal collapsed>
          <Loading fallback={<i>{label()} a</i>}>
            <Wait ms={10}>
              <Item name="a" />
            </Wait>
          </Loading>
          <Loading fallback={<i>{label()} b</i>}>
            <Wait ms={30}>
              <Item name="b" />
            </Wait>
          </Loading>
        </Reveal>
      ) : (
        <Loading fallback={<i>f</i>}>
          <Wait ms={10}>
            <LateBox>
              <Item name="a" />
            </LateBox>
          </Wait>
        </Loading>
      )}
    </main>
  );
  return { App, ...controls() };
  function controls() {
    return {
      /** The server has the module before it renders. */
      preload: () => LateBox.preload(),
      hide: () => setShow(false),
      reverse: () => setOrder(o => [...o].reverse()),
      relabel: () => setLabel("still"),
      arm: () => (armed = true),
      flag: () => setFlag(true)
    };
  }
}
