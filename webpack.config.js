const path = require("path");
const webpack = require("webpack");
const CopyPlugin = require("copy-webpack-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

module.exports = (options) => ({
  entry: ["./src/ts/index.tsx"],
  mode: "development",
  devtool: "source-map",
  output: {
    library: "main",
    libraryTarget: "umd",
    path: path.resolve(__dirname, "dist"),
    filename: "index_bundle.js",
  },
  plugins: [
    new webpack.DefinePlugin({
      "process.env.MEDIA_URL": JSON.stringify(
        options.env === "local" ? "./dist/media/" : "https://storage.googleapis.com/rewild-6809/"
      ),
    }),
    new ForkTsCheckerWebpackPlugin({ typescript: { configFile: "src/ts/tsconfig.json" } }),
    new CopyPlugin({
      patterns: [
        { from: "src/media", to: "media" },
        { from: "build/untouched.wasm.map", to: "" },
      ],
    }),
  ],
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: [".tsx", ".ts", ".js", "glsl", "vs", "fs"],
  },
  module: {
    rules: [
      // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            babelrc: false,
            configFile: false,
            presets: [["@babel/preset-env", { targets: ">0.95%" }], "solid", "@babel/preset-typescript"],
          },
        },
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
});
