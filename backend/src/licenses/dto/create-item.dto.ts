// POST /items 요청 본문. 필수값과 문자열 여부만 보고, 카테고리·버전 검사는 서비스가 순서대로 한다
import { Transform } from "class-transformer";
import { IsNotEmpty, IsString } from "class-validator";
import { LICENSE_MESSAGES as MSG } from "../license-messages.js";
import { trimString } from "./trim-string.js";

// 세 필드의 오류 문구가 모두 같아서, 어느 필드가 먼저 걸려도 응답은 REQUIRED_CREATE 하나다.
// 그래서 옛 서버처럼 "필수값 → 카테고리 → 버전" 순서가 유지된다.
export class CreateItemDto {
  @Transform(trimString)
  @IsString({ message: MSG.REQUIRED_CREATE })
  @IsNotEmpty({ message: MSG.REQUIRED_CREATE })
  key: string;

  @IsString({ message: MSG.REQUIRED_CREATE })
  @IsNotEmpty({ message: MSG.REQUIRED_CREATE })
  category: string;

  @IsString({ message: MSG.REQUIRED_CREATE })
  @IsNotEmpty({ message: MSG.REQUIRED_CREATE })
  version: string;
}
