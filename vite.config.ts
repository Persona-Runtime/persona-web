import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const localApiTarget = env.VITE_LOCAL_API_TARGET;

  return {
    plugins: [react()],
    server: localApiTarget
      ? {
          proxy: {
            "/v1": {
              target: localApiTarget,
              changeOrigin: true,
            },
          },
        }
      : undefined,
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      globals: true,
    },
  };
});
