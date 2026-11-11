// Bundles server.ts (custom Next + Socket.IO server) into dist/server.js.
// Dependencies stay external and are resolved from node_modules at runtime.
import { build } from "esbuild";

await build({
  entryPoints: ["server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  packages: "external",
  sourcemap: true,
  tsconfig: "tsconfig.json",
  logLevel: "info",
});
