// 모든 요청에 앞서 CSRF(사용자 지정 머리글·Origin)를 검사하고, 세션 단계와 관리자 역할을 확인하는 전역 가드
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AppEnv } from "../config/env.validation.js";
import { APP_ENV } from "../security/security.module.js";
import { ADMIN_ONLY, type AuthedRequest, IS_PUBLIC, STAGES } from "./auth.decorators.js";
import type { SessionStage } from "./session.entity.js";
import { SessionsService } from "./sessions.service.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.allowedOrigins = new Set(
      env.CORS_ORIGIN.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    // 다른 사이트의 폼·스크립트는 이 머리글을 붙일 수 없고, 붙이려 하면 CORS 사전 요청에서 막힌다.
    if (!SAFE_METHODS.has(req.method) && req.get("x-km-request") !== "1") {
      throw new ForbiddenException("잘못된 요청이에요. 화면을 새로 고친 뒤 다시 시도하세요.");
    }
    const origin = req.get("origin");
    if (origin && !this.allowedOrigins.has(origin)) {
      throw new ForbiddenException("허용하지 않은 출처의 요청이에요.");
    }

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const auth = await this.sessions.resolve(req);
    if (!auth) throw new UnauthorizedException("로그인이 필요해요.");
    const stages = this.reflector.getAllAndOverride<SessionStage[]>(STAGES, targets) ?? ["full"];
    if (!stages.includes(auth.session.stage)) {
      throw new ForbiddenException("지금 단계에서는 할 수 없는 요청이에요. 로그인 절차를 마저 진행하세요.");
    }
    if (this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, targets) && auth.user.role !== "admin") {
      throw new ForbiddenException("관리자만 할 수 있어요.");
    }
    req.auth = auth;
    return true;
  }
}
