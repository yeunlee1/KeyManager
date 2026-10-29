// 요청마다 필요한 로그인 단계·역할을 표시하는 데코레이터와, 가드가 붙여 둔 로그인 정보를 꺼내는 매개변수 데코레이터
import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Request } from "express";
import type { User } from "../accounts/user.entity.js";
import type { Session, SessionStage } from "./session.entity.js";

export const IS_PUBLIC = "km:public";
export const STAGES = "km:stages";
export const ADMIN_ONLY = "km:admin-only";

export interface AuthContext {
  session: Session;
  user: User;
}

export type AuthedRequest = Request & { auth?: AuthContext };

// 로그인 없이 부를 수 있는 요청. 상태를 바꾸는 요청이면 CSRF 검사는 그대로 받는다.
export const Public = () => SetMetadata(IS_PUBLIC, true);

// 정상(full)이 아닌 세션 단계에서 허용할 요청. 표시가 없으면 정상 단계만 허용한다.
export const Stages = (...stages: SessionStage[]) => SetMetadata(STAGES, stages);

export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);

export const CurrentAuth = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const auth = context.switchToHttp().getRequest<AuthedRequest>().auth;
  if (!auth) throw new Error("가드가 로그인 정보를 붙이지 않은 요청입니다.");
  return auth;
});
