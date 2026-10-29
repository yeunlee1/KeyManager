// 금고(묶음·구성원·항목·열쇠 교체) 모듈
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../accounts/user.entity.js";
import { AuthModule } from "../auth/auth.module.js";
import { VaultAccessService } from "./vault-access.service.js";
import { VaultGroupAccess } from "./vault-group-access.entity.js";
import { VaultGroup } from "./vault-group.entity.js";
import { VaultItem } from "./vault-item.entity.js";
import { VaultController } from "./vault.controller.js";
import { VaultService } from "./vault.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([VaultGroup, VaultGroupAccess, VaultItem, User]), AuthModule],
  controllers: [VaultController],
  providers: [VaultAccessService, VaultService],
  exports: [VaultAccessService],
})
export class VaultModule {}
