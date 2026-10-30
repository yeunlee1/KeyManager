// 각 e2e 시험 파일보다 먼저 실행돼 환경변수를 시험 DB 기준으로 맞춘다
import { loadTestEnv } from "./test-db.js";

// AppModule의 ConfigModule은 .env보다 process.env 값을 우선하므로, 여기서 DB_NAME을 덮어쓰면 앱도 시험 DB에 붙는다.
loadTestEnv();
