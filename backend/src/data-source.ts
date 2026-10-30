// TypeORM CLI(npm run migration:run / migration:generate)가 빌드본에서 읽는 DataSource
import dotenv from "dotenv";
import { DataSource } from "typeorm";
import { validateEnv } from "./config/env.validation.js";
import { buildDataSourceOptions } from "./database/typeorm.options.js";

dotenv.config({ quiet: true });

export default new DataSource({
  ...buildDataSourceOptions(validateEnv(process.env)),
  // CLI가 명령을 실행하기 전에 마이그레이션을 먼저 돌리지 않도록 끈다.
  migrationsRun: false,
});
