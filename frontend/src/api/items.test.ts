// 서버 오류 응답의 문구와 화면의 기본 오류 문구 선택을 확인한다.
import { AxiosError, AxiosHeaders } from "axios";
import { getErrorMessage } from "./items";

const responseError = (data: unknown) => new AxiosError(
  "요청 실패",
  "ERR_BAD_RESPONSE",
  undefined,
  undefined,
  {
    data,
    status: 500,
    statusText: "Internal Server Error",
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  },
);

describe("getErrorMessage", () => {
  it("응답에 error 문구가 있으면 서버 문구를 표시한다", () => {
    expect(getErrorMessage(responseError({ error: "이미 등록된 라이선스 키입니다." }), "등록 실패"))
      .toBe("이미 등록된 라이선스 키입니다.");
  });

  it.each([{}, { error: "" }, "Server Error", null, undefined])(
    "error 문구가 없는 응답 %j는 상황별 기본 문구를 표시한다",
    (data) => {
      expect(getErrorMessage(responseError(data), "등록 프로세스 중 오류가 발생했습니다."))
        .toBe("등록 프로세스 중 오류가 발생했습니다.");
    },
  );

  it("응답이 없는 네트워크 오류는 기본 문구를 표시한다", () => {
    expect(getErrorMessage(new AxiosError("연결 끊김", "ERR_NETWORK"), "수정 중 오류가 발생했습니다."))
      .toBe("수정 중 오류가 발생했습니다.");
  });

  it("Axios 이외의 예외는 기본 문구를 표시한다", () => {
    expect(getErrorMessage(new Error("예상하지 못한 오류"), "삭제 중 오류가 발생했습니다."))
      .toBe("삭제 중 오류가 발생했습니다.");
  });
});
