// 예외 필터가 오류 응답을 프론트 계약({ error } / 500 텍스트)으로 바꾸는지 확인하는 단위 시험
import { BadRequestException, NotFoundException, type ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ApiExceptionFilter } from "./api-exception.filter.js";

function fakeHost() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  return { res, host };
}

describe("ApiExceptionFilter", () => {
  const filter = new ApiExceptionFilter();

  it("HttpException은 상태 코드와 { error: 문구 }로 바꾼다", () => {
    const { res, host } = fakeHost();
    filter.catch(new NotFoundException("존재하지 않는 라이선스입니다."), host);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "존재하지 않는 라이선스입니다." });
  });

  it("문구가 배열이면 첫 문구만 쓴다", () => {
    const { res, host } = fakeHost();
    filter.catch(new BadRequestException(["첫 번째", "두 번째"]), host);
    expect(res.json).toHaveBeenCalledWith({ error: "첫 번째" });
  });

  it("그 밖의 예외는 내부 내용을 숨기고 500 텍스트 'Server Error'로 답한다", () => {
    const { res, host } = fakeHost();
    const spy = vi.spyOn(filter["logger"], "error").mockImplementation(() => undefined);
    filter.catch(new Error("password authentication failed for user postgres"), host);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.type).toHaveBeenCalledWith("text/plain");
    expect(res.send).toHaveBeenCalledWith("Server Error");
    expect(res.json).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
