// DB 없이 도는 단위 시험(src/**/*.spec.ts) 실행 설정
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
  },
  // Nest의 데코레이터 메타데이터(emitDecoratorMetadata)를 시험에서도 만들기 위해 SWC로 변환한다.
  plugins: [swc.vite({ module: { type: "es6" } })],
});
