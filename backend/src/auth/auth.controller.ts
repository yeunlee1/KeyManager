// 계정 절차 API(/auth): 처음 설정·로그인·2단계 인증·로그아웃·내 정보·비밀번호 바꾸기·복구
import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { type AuthContext, CurrentAuth, Public, Stages } from "./auth.decorators.js";
import { AuthService } from "./auth.service.js";
import {
  ChangePasswordDto,
  LoginDto,
  LoginIdDto,
  RecoverCompleteDto,
  RecoverStartDto,
  SecondFactorDto,
  SetupDto,
  TotpCodeDto,
} from "./dto/auth.dto.js";

// 인증 요청은 IP마다 1분에 AUTH_RATE_LIMIT번까지만 받는다(상태 조회·내 정보 등은 제외).
@Controller("auth")
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @SkipThrottle()
  @Get("status")
  status() {
    return this.auth.status();
  }

  @Public()
  @Post("setup")
  @HttpCode(200)
  setup(@Body() dto: SetupDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.setup(dto, req, res);
  }

  @Public()
  @Post("prelogin")
  @HttpCode(200)
  prelogin(@Body() dto: LoginIdDto) {
    return this.auth.prelogin(dto.loginId);
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto, req, res);
  }

  @Stages("pending_totp")
  @Post("login/totp")
  @HttpCode(200)
  secondFactor(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SecondFactorDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.secondFactor(auth, dto, req, res);
  }

  @Stages("enroll_totp", "recovery_enroll")
  @SkipThrottle()
  @Post("totp/enroll/start")
  @HttpCode(200)
  enrollStart(@CurrentAuth() auth: AuthContext) {
    return this.auth.enrollStart(auth);
  }

  @Stages("enroll_totp", "recovery_enroll")
  @Post("totp/enroll/confirm")
  @HttpCode(200)
  enrollConfirm(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: TotpCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.enrollConfirm(auth, dto.code, req, res);
  }

  @Stages("pending_totp", "enroll_totp", "recovery_enroll", "recovery", "full")
  @SkipThrottle()
  @Post("logout")
  @HttpCode(204)
  async logout(@CurrentAuth() auth: AuthContext, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(auth, req, res);
  }

  @SkipThrottle()
  @Get("me")
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.me(auth);
  }

  @Post("password")
  @HttpCode(204)
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(auth, dto, req, res);
  }

  @Public()
  @Post("recover/start")
  @HttpCode(200)
  recoverStart(@Body() dto: RecoverStartDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.recoverStart(dto, req, res);
  }

  @Stages("recovery")
  @SkipThrottle()
  @Get("recover/material")
  recoverMaterial(@CurrentAuth() auth: AuthContext) {
    return this.auth.recoverMaterial(auth);
  }

  @Stages("recovery")
  @Post("recover/complete")
  @HttpCode(204)
  async recoverComplete(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: RecoverCompleteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.recoverComplete(auth, dto, req, res);
  }
}
