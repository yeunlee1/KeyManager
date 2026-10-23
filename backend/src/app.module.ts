// 설정·DB 연결·기능 모듈을 묶는 루트 모듈
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { type AppEnv, validateEnv } from "./config/env.validation.js";
import { readAppEnv } from "./config/read-app-env.js";
import { buildDataSourceOptions } from "./database/typeorm.options.js";
import { LicensesModule } from "./licenses/licenses.module.js";

@Module({
  imports: [
    // backend/.env를 읽고 validateEnv로 검증한다. 같은 이름이 실제 환경변수에도 있으면 그 값이 우선한다.
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => ({
        ...buildDataSourceOptions(readAppEnv(config)),
        // DB에 붙지 못하면 짧게 두 번만 다시 시도하고 기동을 멈춘다. 오래 재시도하면 실패가 숨는다.
        retryAttempts: 2,
        retryDelay: 1000,
      }),
    }),
    LicensesModule,
  ],
})
export class AppModule {}
