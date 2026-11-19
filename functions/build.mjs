// Bundles functions/src + ../shared into lib/index.js. Firebase SDKs stay external.
import * as esbuild from "esbuild";

const options = {
  entryPoints: ["src/index.ts"],
  outfile: "lib/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external: ["firebase-functions", "firebase-functions/*", "firebase-admin", "firebase-admin/*"],
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
