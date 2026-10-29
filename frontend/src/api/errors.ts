// 서버 오류를 사용자가 다음에 할 일을 알 수 있는 한국어 문구로 바꾼다(설계서 12절).
import axios from "axios";

export function errorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

export function describeError(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    if (!error.response) return "서버에 연결하지 못했어요. 네트워크를 확인한 뒤 다시 시도하세요.";
    const message = error.response.data?.error;
    if (typeof message === "string" && message) return message;
    switch (error.response.status) {
      case 401:
        return "로그인이 끝났어요. 다시 로그인하세요.";
      case 403:
        return "이 작업을 할 권한이 없어요.";
      case 409:
        return "다른 사람이 먼저 고쳤어요. 새 내용을 불러온 뒤 다시 하세요.";
      case 413:
        return "한 번에 보내기에는 내용이 너무 많아요.";
      case 429:
        return "시도가 너무 많아요. 잠시 뒤 다시 하세요.";
      default:
        return fallback;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
