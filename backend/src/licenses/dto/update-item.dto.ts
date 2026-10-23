// PUT /items/:no 요청 본문. key는 필수, member는 빠지면 NULL(미배정)로 저장한다
import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import { LICENSE_MESSAGES as MSG } from "../license-messages.js";
import { trimString } from "./trim-string.js";

export class UpdateItemDto {
  @Transform(trimString)
  @IsString({ message: MSG.REQUIRED_KEY })
  @IsNotEmpty({ message: MSG.REQUIRED_KEY })
  key: string;

  // 빈 문자열을 보내면 배정 해제다. 사용자명은 옛 서버처럼 공백을 지우지 않고 그대로 저장한다.
  @IsOptional()
  @IsString({ message: MSG.BAD_REQUEST })
  member?: string | null;
}
