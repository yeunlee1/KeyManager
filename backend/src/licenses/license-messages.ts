// 라이선스 API가 프론트에 돌려주는 한국어 오류 문구 (옛 Express 서버와 같은 문자열)
export const LICENSE_MESSAGES = {
  REQUIRED_CREATE: "키, 카테고리, 버전은 필수 항목입니다.",
  UNSUPPORTED_CATEGORY: "지원하지 않는 카테고리입니다.",
  UNSUPPORTED_VERSION: "지원하지 않는 버전입니다.",
  DUPLICATE_KEY: "이미 등록된 라이선스 키입니다.",
  BAD_REQUEST: "잘못된 요청입니다.",
  REQUIRED_KEY: "라이선스 키는 필수 항목입니다.",
  NOT_FOUND: "존재하지 않는 라이선스입니다.",
} as const;
