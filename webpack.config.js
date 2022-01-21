const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: ["./src/ts/index.ts"],
  mode: "development",
  devtool: "source-map",
  output: {
    library: "main",
    libraryTarget: "umd",
    path: path.resolve(__dirname, "dist"),
    filename: "index_bundle.js",
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "src/media", to: "media" },
        { from: "build/untouched.wasm.map", to: "" },
      ],
    }),
  ],
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: [".ts", ".tsx", ".js", "glsl", "vs", "fs"],
  },
  module: {
    rules: [
      // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
      },
      {
        test: /\.(png|jpe?g|gif)$/i,
        use: [
          {
            loader: "file-loader",
          },
        ],
      },
      {
        test: /\.(glsl|vs|fs|html)$/i,
        loader: "raw-loader",
      },
      {
        test: /\.(wasm)$/i,
        use: [
          {
            loader: "file-loader",
            options: {
              name: () => `[name].[ext]`,
            },
          },
        ],
      },
      {
        test: /\.(wasm.map)$/i,
        use: [
          {
            loader: "file-loader",
            options: {
              name: () => `[name].[ext]`,
            },
          },
        ],
      },
    ],
  },
};
