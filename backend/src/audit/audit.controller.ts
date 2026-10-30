// 열람 기록 조회 API(/audit, 관리자): 사람·묶음·종류·기간으로 거르고 최신순으로 쪽을 나눠 준다
import { Controller, Get, Query } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Type } from "class-transformer";
import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, Min } from "class-validator";
import { type FindOptionsWhere, LessThan, Between, MoreThanOrEqual, LessThanOrEqual, type Repository } from "typeorm";
import { AdminOnly } from "../auth/auth.decorators.js";
import { AuditEvent } from "./audit-event.entity.js";

class AuditQueryDto {
  @IsOptional() @IsUUID("4") actorUserId?: string;

  @IsOptional() @IsUUID("4") groupId?: string;

  @IsOptional() @IsString() @Matches(/^[a-z_]{3,40}$/) action?: string;

  @IsOptional() @IsISO8601({ strict: true }) from?: string;

  @IsOptional() @IsISO8601({ strict: true }) to?: string;

  // 이 ID보다 앞(더 오래된) 기록부터 준다(다음 쪽).
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) before?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

@AdminOnly()
@Controller("audit")
export class AuditController {
  constructor(@InjectRepository(AuditEvent) private readonly events: Repository<AuditEvent>) {}

  @Get()
  async list(@Query() query: AuditQueryDto) {
    const where: FindOptionsWhere<AuditEvent> = {};
    if (query.actorUserId) where.actorUserId = query.actorUserId;
    if (query.groupId) where.groupId = query.groupId;
    if (query.action) where.action = query.action;
    if (query.from && query.to) where.at = Between(new Date(query.from), new Date(query.to));
    else if (query.from) where.at = MoreThanOrEqual(new Date(query.from));
    else if (query.to) where.at = LessThanOrEqual(new Date(query.to));
    if (query.before) where.id = LessThan(String(query.before));
    const limit = query.limit ?? 50;
    const rows = await this.events.find({ where, order: { id: "DESC" }, take: limit });
    return {
      events: rows.map((row) => ({
        id: Number(row.id),
        at: row.at.toISOString(),
        actorUserId: row.actorUserId,
        action: row.action,
        result: row.result,
        targetType: row.targetType,
        targetId: row.targetId,
        groupId: row.groupId,
        detail: row.detail,
        ip: row.ip,
      })),
      nextBefore: rows.length === limit ? Number(rows[rows.length - 1].id) : null,
    };
  }
}
