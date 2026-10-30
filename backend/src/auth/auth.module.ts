// 세션·전역 가드·처음 설정 코드·계정 절차(AuthService)를 묶는 모듈
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../accounts/user.entity.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService, TOTP_CLOCK, type TotpClock } from "./auth.service.js";
import { Session } from "./session.entity.js";
import { SessionsService } from "./sessions.service.js";
import { SetupCodeService } from "./setup-code.service.js";

const systemClock: TotpClock = { now: () => Date.now() };

@Module({
  imports: [TypeOrmModule.forFeature([User, Session])],
  controllers: [AuthController],
  providers: [
    SessionsService,
    SetupCodeService,
    AuthService,
    { provide: TOTP_CLOCK, useValue: systemClock },
    // 모든 요청이 이 가드를 거친다. 로그인 없이 쓸 요청은 @Public()으로 표시한다.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionsService, AuthService],
})
export class AuthModule {}
