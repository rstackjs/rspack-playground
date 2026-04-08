import type { JSX } from "react";

export default function Rspack(props: JSX.IntrinsicElements["img"]) {
  return <img src="/rspack-logo.svg" alt="Rspack" width={40} height={40} {...props} />;
}
