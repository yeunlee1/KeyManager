// 실제 서버(main.ts)와 e2e 시험이 똑같이 쓰는 전역 설정 (보안 헤더·CORS·검증·예외 처리·종료 훅)
import { BadRequestException, ValidationPipe, type ValidationError } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { ApiExceptionFilter } from "./common/api-exception.filter.js";
import type { AppEnv } from "./config/env.validation.js";

// 검증 오류 트리에서 처음 만나는 문구 하나만 꺼낸다. DTO마다 문구를 한국어로 지정해 두었다.
function firstValidationMessage(errors: ValidationError[]): string {
  for (const error of errors) {
    const message = Object.values(error.constraints ?? {})[0];
    if (message) return message;
    const nested = firstValidationMessage(error.children ?? []);
    if (nested) return nested;
  }
  return "";
}

export function configureApp(app: NestExpressApplication, env: AppEnv): void {
  app.use(helmet());
  // 로그인 세션 쿠키를 읽는다.
  app.use(cookieParser());
  // 묶음 열쇠 교체 요청은 항목 열쇠를 한꺼번에 보내므로 기본 100kb보다 크게 받는다. 칸마다의 길이는 DTO가 따로 제한한다.
  app.useBodyParser("json", { limit: "4mb" });
  // 잘못된 JSON은 해석기 문구(입력 일부가 섞일 수 있음) 대신 고정 문구로 답한다. 해석기 오류에 담긴 원문 본문은 응답·로그에 싣지 않는다.
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof SyntaxError && (error as { type?: string }).type === "entity.parse.failed") {
      res.status(400).json({ error: "요청 형식(JSON)이 올바르지 않아요." });
      return;
    }
    next(error);
  });
  // 모든 출처를 허용하던 옛 서버와 달리, CORS_ORIGIN에 적은 프론트 주소만 허용한다.
  app.enableCors({
    origin: env.CORS_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      // DTO에 없는 필드(isdelete, no 등)는 버려서 클라이언트가 숨은 컬럼을 바꾸지 못하게 한다.
      whitelist: true,
      // @Transform(공백 제거)을 거친 값을 핸들러에 넘긴다.
      transform: true,
      exceptionFactory: (errors) => new BadRequestException(firstValidationMessage(errors)),
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  // SIGINT/SIGTERM을 받으면 요청 처리와 DB 연결 풀을 정리하고 종료한다.
  app.enableShutdownHooks();
}
