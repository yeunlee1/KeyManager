// 라이선스 기능(엔티티 저장소·서비스·컨트롤러)을 묶는 모듈
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LicenseKey } from "./license-key.entity.js";
import { LicensesController } from "./licenses.controller.js";
import { LicensesService } from "./licenses.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([LicenseKey])],
  controllers: [LicensesController],
  providers: [LicensesService],
})
export class LicensesModule {}
