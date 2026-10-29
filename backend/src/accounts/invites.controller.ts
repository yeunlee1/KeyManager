// 초대 API(/invites): 관리자의 초대 만들기·목록·취소·공개키 확인, 초대받은 사람의 조회·수락(로그인 없음, 토큰은 본문)
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AdminOnly, type AuthContext, CurrentAuth, Public } from "../auth/auth.decorators.js";
import {
  AcceptInviteDto,
  CreateInviteDto,
  InviteTokenDto,
  StepUpDto,
  VerifyInviteDto,
} from "./dto/accounts.dto.js";
import { InvitesService } from "./invites.service.js";

@Controller("invites")
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @AdminOnly()
  @Get()
  list() {
    return this.invites.list();
  }

  @AdminOnly()
  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateInviteDto, @Req() req: Request) {
    return this.invites.create(auth, dto, req);
  }

  @AdminOnly()
  @Get("pending-verification")
  pending(@CurrentAuth() auth: AuthContext) {
    return this.invites.pendingVerification(auth);
  }

  @AdminOnly()
  @Post(":id/revoke")
  @HttpCode(204)
  async revoke(
    @CurrentAuth() auth: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: StepUpDto,
    @Req() req: Request,
  ) {
    await this.invites.revoke(auth, id, dto.totpCode, req);
  }

  @AdminOnly()
  @Post(":id/verify")
  @HttpCode(204)
  async verify(
    @CurrentAuth() auth: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: VerifyInviteDto,
    @Req() req: Request,
  ) {
    await this.invites.verify(auth, id, dto, req);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post("lookup")
  @HttpCode(200)
  lookup(@Body() dto: InviteTokenDto) {
    return this.invites.lookup(dto.token);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post("accept")
  @HttpCode(200)
  accept(@Body() dto: AcceptInviteDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.invites.accept(dto, req, res);
  }
}
