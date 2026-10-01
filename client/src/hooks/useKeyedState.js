import { useState } from "react";

export default function useKeyedState(key, getInitialValue) {
  const [stored, setStored] = useState(() => ({ key, value: getInitialValue() }));
  const value = Object.is(stored.key, key) ? stored.value : getInitialValue();

  function setValue(nextValue) {
    const currentValue = Object.is(stored.key, key) ? stored.value : value;
    setStored({
      key,
      value: typeof nextValue === "function" ? nextValue(currentValue) : nextValue,
    });
  }

  return [value, setValue];
}