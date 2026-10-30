// 열람·변경 기록을 audit_events에 남기는 서비스. 트랜잭션 안에서 부를 때는 그 EntityManager를 넘겨 함께 커밋되게 한다.
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Request } from "express";
import type { EntityManager, Repository } from "typeorm";
import { type AuditDetail, AuditEvent } from "./audit-event.entity.js";

export interface AuditEntry {
  actorUserId?: string | null;
  action: string;
  result?: "ok" | "fail" | "denied";
  targetType?: "user" | "invite" | "group" | "item" | "session";
  targetId?: string | null;
  groupId?: string | null;
  // 비밀번호·제목·주소 같은 내용은 넣지 않는다. ID·목적·개정 번호 정도만 넣는다.
  detail?: AuditDetail;
  request?: Request;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditEvent) private readonly events: Repository<AuditEvent>) {}

  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AuditEvent) : this.events;
    const event = repo.create({
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      result: entry.result ?? "ok",
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      groupId: entry.groupId ?? null,
      detail: entry.detail ?? {},
      ip: entry.request?.ip?.slice(0, 64) ?? null,
      userAgent: entry.request?.get("user-agent")?.slice(0, 256) ?? null,
    });
    await repo.insert(event);
  }
}
