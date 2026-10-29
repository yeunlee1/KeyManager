import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 빌드한 화면에 넣는 보안 정책(설계서 11절). 스크립트는 우리 파일과 Argon2 WebAssembly만 허용한다.
// 개발 서버는 HMR이 인라인 스크립트를 쓰므로 빌드에만 넣는다. 운영 서버는 같은 정책에 frame-ancestors를 더해 응답 머리글로 보낸다.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

function securityMetaForBuild(): Plugin {
  return {
    name: "km-security-meta",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
        injectTo: "head-prepend",
      },
    ],
  };
}

// 화면과 API를 같은 출처(/api)로 쓴다. 세션 쿠키가 SameSite=Strict라 다른 출처로 보내지 않는다.
const apiProxy = {
  "/api": {
    target: "http://localhost:5000",
    rewrite: (path: string) => path.replace(/^\/api/, ""),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), securityMetaForBuild()],
  resolve: {
    // coss ui(shadcn 레지스트리) 소스가 쓰는 @/ 경로를 src로 연결한다.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
});
