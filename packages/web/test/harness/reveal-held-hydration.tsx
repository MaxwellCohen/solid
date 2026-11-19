/**
 * @jsxImportSource @solidjs/web
 *
 * A `<Reveal>` of three boundaries that settle out of order (b at 10 ms, c
 * at 20, a at 30). Every order but `natural` holds b and c until a settles,
 * then releases two or three fragments in one batch. Each one must hydrate
 * its server content in place: the swap put the server's markup in the
 * document, and a fresh client render would throw it away.
 *
 * Compiled with both generates: test/server/reveal-held-hydration.gen.spec.tsx
 * writes the chunks test/hydration/reveal-held-hydration.spec.tsx replays.
 */
import { createMemo, Loading, Reveal } from "solid-js";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const ORDERS = [
  "sequential",
  "collapsed",
  "together",
  "natural",
  "nested",
  "svg",
  "all"
] as const;
export type Order = (typeof ORDERS)[number];

function Read(props: { name: string; ms: number }) {
  const value = createMemo(() => sleep(props.ms).then(() => props.name.toUpperCase()));
  return <b>{value()}</b>;
}

function Slot(props: { name: string; ms: number }) {
  return (
    <Loading fallback={<i>{props.name}</i>}>
      <Read name={props.name} ms={props.ms} />
    </Loading>
  );
}

// Inside <svg> the placeholder parses as an SVG element with no `content`.
function SvgRead(props: { name: string; ms: number }) {
  const value = createMemo(() => sleep(props.ms).then(() => props.name.toUpperCase()));
  return <text>{value()}</text>;
}

function SvgSlot(props: { name: string; ms: number }) {
  return (
    <Loading fallback={<desc>{props.name}</desc>}>
      <SvgRead name={props.name} ms={props.ms} />
    </Loading>
  );
}

export function createRevealApp(order: Order): () => any {
  if (order === "all") {
    // Every group on one page, releasing in the same batch.
    const groups = ORDERS.filter(o => o !== "all" && o !== "svg").map(createRevealApp);
    return () => groups.map(Group => <Group />);
  }
  return function App() {
    const slots = () => [
      <Slot name="a" ms={30} />,
      <Slot name="b" ms={10} />,
      <Slot name="c" ms={20} />
    ];
    if (order === "svg")
      return (
        <main>
          <svg>
            <Reveal>
              <SvgSlot name="a" ms={30} />
              <SvgSlot name="b" ms={10} />
              <SvgSlot name="c" ms={20} />
            </Reveal>
          </svg>
        </main>
      );
    return (
      <main>
        {order === "nested" ? (
          <Reveal>
            <Slot name="a" ms={30} />
            <Reveal order="together">
              <Slot name="b" ms={10} />
              <Slot name="c" ms={20} />
            </Reveal>
          </Reveal>
        ) : order === "collapsed" ? (
          <Reveal collapsed>{slots()}</Reveal>
        ) : (
          <Reveal order={order}>{slots()}</Reveal>
        )}
      </main>
    );
  };
}
