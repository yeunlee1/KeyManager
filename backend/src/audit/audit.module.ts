// 열람 기록 서비스를 앱 전체에서 쓰게 하는 전역 모듈
import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditEvent } from "./audit-event.entity.js";
import { AuditController } from "./audit.controller.js";
import { AuditService } from "./audit.service.js";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
