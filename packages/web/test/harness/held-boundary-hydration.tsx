/**
 * @jsxImportSource @solidjs/web
 *
 * Boundaries the client cannot claim yet — the content's `lazy()` module has
 * not loaded, or the fragment has not arrived — while the page around them
 * moves on: an enclosing boundary resumes, a list reorders, a `<Show>` hides
 * the boundary, a collapsed `<Reveal>` shows the next fallback (which may
 * fail to hydrate), text follows the boundary in its slot, the stream is cut.
 *
 * Compiled with both generates: test/server/held-boundary-hydration.gen.spec.tsx
 * writes the chunks test/hydration/held-boundary-hydration.spec.tsx replays.
 */
import { createMemo, createSignal, For, lazy, Loading, Reveal, Show } from "solid-js";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const SHAPES = [
  "nested",
  "hide",
  "reorder",
  "pending",
  "pending-text",
  "collapsed",
  "tail",
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
  return {
    App,
    /** The server has the module before it renders. */
    preload: () => LateBox.preload(),
    hide: () => setShow(false),
    reverse: () => setOrder(o => [...o].reverse()),
    relabel: () => setLabel("still"),
    arm: () => (armed = true)
  };
}
