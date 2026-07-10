import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // Next.js resolves "server-only" via an internal bundler alias with no real
    // node_modules package behind it; stub it out so files that import it (as a
    // guard against client bundling) can still be imported under Vitest/Node.
    alias: {
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
