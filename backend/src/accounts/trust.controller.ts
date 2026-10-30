// 확인 기록 API(/trust): 내 계정 열쇠로 잠근 "상대 공개키를 확인했다" 기록을 조회·저장한다(서버는 내용을 풀지 못한다)
import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Put, Req } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Request } from "express";
import type { Repository } from "typeorm";
import { AuditService } from "../audit/audit.service.js";
import { type AuthContext, CurrentAuth } from "../auth/auth.decorators.js";
import { TrustRecordDto } from "./dto/accounts.dto.js";
import { TrustRecord } from "./trust-record.entity.js";
import { User } from "./user.entity.js";

@Controller("trust")
export class TrustController {
  constructor(
    @InjectRepository(TrustRecord) private readonly records: Repository<TrustRecord>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext) {
    const rows = await this.records.find({ where: { ownerUserId: auth.user.id } });
    return rows.map((row) => ({
      subjectUserId: row.subjectUserId,
      recordEnc: row.recordEnc,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  @Put(":userId")
  @HttpCode(204)
  async put(
    @CurrentAuth() auth: AuthContext,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: TrustRecordDto,
    @Req() req: Request,
  ) {
    if (!(await this.users.exists({ where: { id: userId } }))) throw new NotFoundException("없는 사용자예요.");
    await this.records.upsert(
      { ownerUserId: auth.user.id, subjectUserId: userId, recordEnc: dto.recordEnc },
      ["ownerUserId", "subjectUserId"],
    );
    await this.audit.record({ actorUserId: auth.user.id, action: "trust_recorded", targetType: "user", targetId: userId, request: req });
  }
}
