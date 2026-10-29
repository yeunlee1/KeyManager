// 초대·확인 기록·사용자 관리 모듈
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module.js";
import { VaultModule } from "../vault/vault.module.js";
import { Invite } from "./invite.entity.js";
import { InvitesController } from "./invites.controller.js";
import { InvitesService } from "./invites.service.js";
import { TrustRecord } from "./trust-record.entity.js";
import { TrustController } from "./trust.controller.js";
import { User } from "./user.entity.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([User, Invite, TrustRecord]), AuthModule, VaultModule],
  controllers: [InvitesController, TrustController, UsersController],
  providers: [InvitesService, UsersService],
})
export class AccountsModule {}
