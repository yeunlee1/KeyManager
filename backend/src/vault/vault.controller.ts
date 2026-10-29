// 금고 API(/vault): 묶음·구성원(관리자), 항목 목록·만들기·고치기·지우기, 비밀 덩어리 제공
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { StepUpDto } from "../accounts/dto/accounts.dto.js";
import { AdminOnly, type AuthContext, CurrentAuth } from "../auth/auth.decorators.js";
import { IsSignature } from "../common/crypto-formats.js";
import {
  CreateGroupDto,
  CreateItemDto,
  PutMemberDto,
  RemoveMemberDto,
  RenameGroupDto,
  SecretRequestDto,
  UpdateItemDto,
} from "./dto/vault.dto.js";
import { IsOptional } from "class-validator";
import { VaultService } from "./vault.service.js";

// 관리자를 구성원에서만 뺄 때 받는 새 서명(구성원 여부가 바뀐 값에 대한 서명)
class RemoveMemberBodyDto extends RemoveMemberDto {
  @IsOptional() @IsSignature() adminShareSignature?: string;
}

@Controller("vault")
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Get("groups")
  groups(@CurrentAuth() auth: AuthContext) {
    return this.vault.listGroups(auth);
  }

  @AdminOnly()
  @Post("groups")
  createGroup(@CurrentAuth() auth: AuthContext, @Body() dto: CreateGroupDto, @Req() req: Request) {
    return this.vault.createGroup(auth, dto, req);
  }

  @AdminOnly()
  @Patch("groups/:id")
  @HttpCode(204)
  async renameGroup(
    @CurrentAuth() auth: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RenameGroupDto,
    @Req() req: Request,
  ) {
    await this.vault.renameGroup(auth, id, dto, req);
  }

  @AdminOnly()
  @Delete("groups/:id")
  @HttpCode(204)
  async deleteGroup(
    @CurrentAuth() auth: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: StepUpDto,
    @Req() req: Request,
  ) {
    await this.vault.deleteGroup(auth, id, dto.totpCode, req);
  }

  @AdminOnly()
  @Get("groups/:id/members")
  members(@Param("id", ParseUUIDPipe) id: string) {
    return this.vault.members(id);
  }

  @AdminOnly()
  @Put("groups/:id/members/:userId")
  @HttpCode(204)
  async putMember(
    @CurrentAuth() auth: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: PutMemberDto,
    @Req() req: Request,
  ) {
    await this.vault.putMember(auth, id, userId, dto, req);
  }

  @AdminOnly()
  @Post("groups/:id/members/:userId/remove")
  @HttpCode(204)
  async removeMember(
    @CurrentAuth() auth: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: RemoveMemberBodyDto,
    @Req() req: Request,
  ) {
    await this.vault.removeMember(auth, id, userId, dto, req);
  }

  @Get("items")
  items(@CurrentAuth() auth: AuthContext, @Req() req: Request) {
    return this.vault.listItems(auth, req);
  }

  @Post("items")
  createItem(@CurrentAuth() auth: AuthContext, @Body() dto: CreateItemDto, @Req() req: Request) {
    return this.vault.createItem(auth, dto, req);
  }

  @Put("items/:id")
  updateItem(
    @CurrentAuth() auth: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateItemDto,
    @Req() req: Request,
  ) {
    return this.vault.updateItem(auth, id, dto, req);
  }

  @Delete("items/:id")
  @HttpCode(204)
  async deleteItem(@CurrentAuth() auth: AuthContext, @Param("id", ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.vault.deleteItem(auth, id, req);
  }

  @Post("items/:id/secret")
  @HttpCode(200)
  secret(
    @CurrentAuth() auth: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SecretRequestDto,
    @Req() req: Request,
  ) {
    return this.vault.deliverSecret(auth, id, dto, req);
  }
}
