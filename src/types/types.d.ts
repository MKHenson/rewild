/// <reference path="../../types.d.ts" />

declare module '*.wasm' {
  const content: string;
  export default content;
}

declare module '*.html' {
  const content: string;
  export default content;
}
