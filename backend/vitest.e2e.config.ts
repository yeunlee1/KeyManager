// 실제 PostgreSQL 시험 DB(keymanager_test)에 붙는 e2e 시험(test/**/*.e2e-spec.ts) 실행 설정
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.e2e-spec.ts"],
    globalSetup: ["test/setup/global-setup.ts"],
    setupFiles: ["test/setup/env.ts"],
    // 시험 파일들이 같은 DB를 비우고 채우므로 한 번에 한 파일씩 돈다.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
