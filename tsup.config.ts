import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  sourcemap: true,
  clean: true,
  dts: false,
  external: ["httpyac", "httpyac/store", "@rezi-ui/core", "@rezi-ui/node"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
