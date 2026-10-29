// 프론트의 연결 상태 배지가 주기적으로 부르는 상태 확인 API
import { Controller, Get, Res } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Response } from "express";
import { DataSource } from "typeorm";
import { Public } from "../auth/auth.decorators.js";

export interface HealthStatus {
  status: "ok" | "error";
}

// 로그인 화면에서도 서버 연결 상태를 보여 줘야 하므로 로그인 없이 부를 수 있다.
@Public()
@Controller("health")
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // DB 쿼리까지 통과해야 "연결됨"이다. 실패 응답은 { error } 형식이 아니라 옛 계약대로 { status: "error" }라서
  // 예외를 던지지 않고 상태 코드만 직접 바꾼다.
  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    try {
      await this.dataSource.query("SELECT 1");
      return { status: "ok" };
    } catch {
      res.status(503);
      return { status: "error" };
    }
  }
}
