import { Component, createSignal, For } from "solid-js";

interface Props {}

const items = ["knife", "sword", "axe"];

export const SolidApplication: Component<Props> = ({}) => {
  const [count, setCount] = createSignal<number>(0);

  return (
    <>
      <div>The Count is: {count()}</div>
      <button onClick={() => setCount(count() + 1)}>Increment</button>
      <For each={items}>{(item) => <div>{item}</div>}</For>
    </>
  );
};
