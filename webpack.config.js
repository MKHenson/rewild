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
    path: path.resolve(__dirname, "public"),
    filename: "index_bundle.js",
  },
  devServer: {
    historyApiFallback: true,
  },
  plugins: [
    new webpack.DefinePlugin({
      "process.env.MEDIA_URL": JSON.stringify("https://storage.googleapis.com/rewild-6809/"),
    }),
    new ForkTsCheckerWebpackPlugin({
      typescript: { configFile: "src/ts/tsconfig.json" },
    }),
    new CopyPlugin({
      patterns: [
        { from: "style.css", to: "style.css" },
        { from: "index.html", to: "index.html" },
        // { from: "src/media", to: "media" },
        { from: "build/release.wasm.map", to: "" },
      ],
    }),
  ],
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: [".tsx", ".ts", ".js", "glsl", "vs", "fs"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
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
