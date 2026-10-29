import axios, { AxiosError } from "axios";
import { API_BASE_URL } from "../config";

// timeout: 백엔드가 응답 없이 멈춘 경우(DB 커넥션 행 등) 요청이 무한정 대기하지 않도록 상한을 둔다.
export const apiClient = axios.create({ baseURL: API_BASE_URL, timeout: 10000 });

// 서버는 상태를 바꾸는 모든 요청에 이 머리글을 요구한다(CSRF 방어). 다른 사이트의 폼은 이 머리글을 붙일 수 없다.
apiClient.defaults.headers.common["X-KM-Request"] = "1";

// 세션이 끝나면(401) 앱 전체에 알려 열쇠와 풀어 둔 내용을 지우고 로그인 화면으로 보낸다.
export const SESSION_EXPIRED_EVENT = "km:session-expired";

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const url = error.config?.url ?? "";
    // 로그인 절차 자체의 401(비밀번호 틀림 등)은 화면이 직접 처리한다.
    if (error.response?.status === 401 && !url.startsWith("/auth/")) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  },
);
