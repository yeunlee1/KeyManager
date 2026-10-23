// 모든 예외를 프론트가 기대하는 오류 응답 형태로 바꾸는 전역 예외 필터
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";

// Nest 기본 오류 형식({ statusCode, message, error })을 옛 서버 계약인 { error: "<문구>" }로 바꾼다.
// 예상하지 못한 예외는 DB 오류 같은 내부 내용을 숨기고 500 텍스트 "Server Error"로 답한다.
// 프론트 getErrorMessage는 error 필드가 없으면 상황별 한국어 기본 문구를 보여준다.
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json({ error: this.messageOf(exception) });
      return;
    }

    this.logger.error(
      "처리하지 못한 예외",
      exception instanceof Error ? exception.stack : String(exception),
    );
    res.status(500).type("text/plain").send("Server Error");
  }

  private messageOf(exception: HttpException): string {
    const body = exception.getResponse();
    if (typeof body === "string") return body;
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message)) return String(message[0]);
    return typeof message === "string" ? message : exception.message;
  }
}
