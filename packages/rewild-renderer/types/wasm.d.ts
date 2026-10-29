// esbuild's `file` loader turns a `.wasm` import into the URL it emits the file
// at. Mirrors the root files.d.ts for code type-checked in this package.
declare module '*.wasm' {
  const url: string;
  export default url;
}
