import * as esbuild from "esbuild";

const defines = {
  "process.env.MEDIA_URL": JSON.stringify(
    "https://storage.googleapis.com/rewild-6809/"
  ),
};

let examplePlugin = {
  name: "example",
  setup(build) {
    build.onStart(() => {
      console.log("build started");
    }),
      build.onEnd((result) => {
        console.log(`build ended with ${result.errors.length} errors`);
      });
  },
};

async function build() {
  await esbuild.build({
    entryPoints: ["./lib/client-build.ts"],
    bundle: true,
    tsconfig: "./tsconfig.json",
    outfile: `./build/index_bundle.js`,
    define: defines,
    plugins: [examplePlugin],
  });
}

if (process.argv.join("").includes("watch")) watch();
else build();
