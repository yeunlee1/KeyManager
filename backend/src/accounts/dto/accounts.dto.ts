// 초대·확인 기록·사용자 관리 요청의 본문 형식. 암호문·서명은 모양만 검사한다.
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { B64U_32, IsAesBlob, IsSignature, LOGIN_ID } from "../../common/crypto-formats.js";
import { AccountMaterialDto } from "../../auth/dto/auth.dto.js";
import { RotationDto } from "../../vault/dto/vault.dto.js";

const toLowerTrim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toLowerCase() : value;
const toTrim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

// 관리자 작업 직전에 받는 본인 인증 코드
export class StepUpDto {
  @IsString() @Matches(/^\d{6}$/, { message: "인증 코드는 숫자 6자리입니다." })
  totpCode: string;
}

export class CreateInviteDto extends StepUpDto {
  @IsUUID("4", { message: "초대 ID 형식이 올바르지 않습니다." })
  id: string;

  // 링크의 # 뒤에 들어가는 토큰. 서버는 HMAC만 저장한다.
  @IsString() @Matches(B64U_32, { message: "초대 토큰 형식이 올바르지 않습니다." })
  token: string;

  @Transform(toLowerTrim)
  @IsString() @Matches(LOGIN_ID, { message: "아이디는 영문 소문자·숫자·점·밑줄·하이픈 3~64자입니다." })
  loginId: string;

  @Transform(toTrim)
  @IsString() @MinLength(1, { message: "이름을 입력하세요." }) @MaxLength(100)
  name: string;

  @IsIn(["admin", "member"], { message: "역할이 올바르지 않습니다." })
  role: "admin" | "member";

  // 초대 MAC에 들어간 만료 시각. 서버는 이 값을 그대로 저장해 받는 사람이 같은 값으로 MAC을 다시 계산하게 한다.
  @IsISO8601({ strict: true }, { message: "만료 시각 형식이 올바르지 않습니다." })
  expiresAt: string;

  // 관리자 계정 열쇠로 잠근 초대 비밀 S
  @IsAesBlob(200)
  secretEnc: string;

  @IsString() @Matches(B64U_32, { message: "초대 MAC 형식이 올바르지 않습니다." })
  inviterMac: string;
}

export class InviteTokenDto {
  @IsString() @Matches(B64U_32, { message: "초대 링크가 올바르지 않습니다." })
  token: string;
}

export class AcceptInviteDto extends AccountMaterialDto {
  @IsString() @Matches(B64U_32, { message: "초대 링크가 올바르지 않습니다." })
  token: string;

  @IsString() @Matches(B64U_32, { message: "수락 MAC 형식이 올바르지 않습니다." })
  acceptMac: string;

  // 초대받은 사람이 자기 계정 열쇠로 잠근 "초대한 관리자 확인 기록"
  @IsAesBlob(6000)
  inviterTrustRecordEnc: string;
}

export class TrustRecordDto {
  @IsAesBlob(6000)
  recordEnc: string;
}

// 관리자로 올릴 때 새 관리자 몫으로 건네는 묶음 열쇠 사본 하나
export class KeyShareDto {
  @IsUUID("4") groupId: string;

  @IsInt() @Min(1) @Max(1_000_000)
  generation: number;

  @IsString() @Matches(/^v1r\.[A-Za-z0-9_-]{512}$/, { message: "열쇠 사본 형식이 올바르지 않습니다." })
  wrappedKey: string;

  @IsSignature()
  shareSignature: string;
}

export class PromotionDto {
  @IsSignature()
  adminGrantSig: string;

  @ArrayMaxSize(200, { message: "한 번에 건넬 수 있는 묶음 수를 넘었습니다." })
  @ValidateNested({ each: true }) @Type(() => KeyShareDto)
  keyShares: KeyShareDto[];
}

export class VerifyInviteDto {
  // 관리자가 자기 계정 열쇠로 잠근 "초대받은 사람 확인 기록"
  @IsAesBlob(6000)
  trustRecordEnc: string;

  // 관리자로 초대한 경우에만: 관리자 승인 서명과 모든 묶음 열쇠 사본
  @IsOptional() @ValidateNested() @Type(() => PromotionDto)
  promotion?: PromotionDto;

  // 관리자로 올리는 확인에만 필요한 본인 인증 코드(직원 초대 확인은 자동이라 필요 없다)
  @IsOptional() @IsString() @Matches(/^\d{6}$/, { message: "인증 코드는 숫자 6자리입니다." })
  totpCode?: string;
}

export class RoleChangeDto extends StepUpDto {
  @IsIn(["admin", "member"], { message: "역할이 올바르지 않습니다." })
  role: "admin" | "member";

  // 관리자로 올릴 때: 관리자 승인 서명과 아직 사본이 없는 모든 묶음의 열쇠 사본
  @IsOptional() @ValidateNested() @Type(() => PromotionDto)
  promotion?: PromotionDto;

  // 직원으로 내릴 때: 구성원이 아니면서 관리자라서 열 수 있던 묶음마다의 열쇠 교체 자료
  @IsOptional()
  @ArrayMaxSize(50, { message: "한 번에 교체할 수 있는 묶음 수(50개)를 넘었습니다." })
  @ValidateNested({ each: true }) @Type(() => RotationDto)
  rotations?: RotationDto[];
}

export class DisableUserDto extends StepUpDto {
  // 그 사람이 열 수 있던 모든 묶음의 열쇠 교체 자료
  @ArrayMaxSize(50, { message: "한 번에 교체할 수 있는 묶음 수(50개)를 넘었습니다." })
  @ValidateNested({ each: true }) @Type(() => RotationDto)
  rotations: RotationDto[];
}
