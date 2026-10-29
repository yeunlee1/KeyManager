// config.ts
// API 서버 주소를 한 곳에서 관리한다. 기본은 같은 출처의 /api(개발 서버와 운영 프록시가 백엔드로 넘긴다).
// 세션 쿠키가 SameSite=Strict라 다른 출처의 API 주소로는 로그인이 유지되지 않는다.
export const API_BASE_URL: string = import.meta.env.VITE_API_URL || "/api";
