// 사용자 API: 모두가 쓰는 공개키 목록(/directory)과 관리자의 사용자 관리(/users)
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminOnly, type AuthContext, CurrentAuth } from "../auth/auth.decorators.js";
import { DisableUserDto, RoleChangeDto, StepUpDto } from "./dto/accounts.dto.js";
import { UsersService } from "./users.service.js";

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("directory")
  directory() {
    return this.users.directory();
  }

  @AdminOnly()
  @Get("users")
  list() {
    return this.users.list();
  }

  @AdminOnly()
  @Patch("users/:id/role")
  @HttpCode(204)
  async changeRole(
    @CurrentAuth() auth: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RoleChangeDto,
    @Req() req: Request,
  ) {
    await this.users.changeRole(auth, id, dto, req);
  }

  @AdminOnly()
  @Post("users/:id/disable")
  @HttpCode(204)
  async disable(
    @CurrentAuth() auth: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: DisableUserDto,
    @Req() req: Request,
  ) {
    await this.users.disable(auth, id, dto, req);
  }

  @AdminOnly()
  @Post("users/:id/enable")
  @HttpCode(204)
  async enable(
    @CurrentAuth() auth: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: StepUpDto,
    @Req() req: Request,
  ) {
    await this.users.enable(auth, id, dto.totpCode, req);
  }

  @AdminOnly()
  @Post("users/:id/totp-reset")
  @HttpCode(204)
  async resetTotp(
    @CurrentAuth() auth: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: StepUpDto,
    @Req() req: Request,
  ) {
    await this.users.resetTotp(auth, id, dto.totpCode, req);
  }
}
