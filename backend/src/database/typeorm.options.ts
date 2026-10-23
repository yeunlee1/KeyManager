// 앱(TypeOrmModule)과 TypeORM CLI가 함께 쓰는 PostgreSQL 연결·엔티티·마이그레이션 설정
import type { DataSourceOptions } from "typeorm";
import type { AppEnv } from "../config/env.validation.js";
import { LicenseKey } from "../licenses/license-key.entity.js";
import { InitLicenseKeys1792713600000 } from "../migrations/1792713600000-InitLicenseKeys.js";

// 엔티티와 마이그레이션은 경로 패턴이 아니라 클래스로 등록한다.
// 그래야 시험(ts 소스 실행)과 빌드본(dist의 js 실행)에서 똑같이 찾는다.
export function buildDataSourceOptions(env: AppEnv): DataSourceOptions {
  return {
    type: "postgres",
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities: [LicenseKey],
    migrations: [InitLicenseKeys1792713600000],
    // synchronize는 엔티티에 없는 컬럼(search_vector)을 지울 수 있어 끈다. 스키마는 마이그레이션으로만 바꾼다.
    synchronize: false,
    // 요청을 받기 전에 마이그레이션을 끝내서, 새 DB에서도 "relation does not exist" 오류가 나지 않게 한다.
    migrationsRun: true,
  };
}
