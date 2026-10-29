// 계정 요청(설정·로그인·2단계 인증·비밀번호 바꾸기·복구·초대 수락)의 본문 형식. 암호문은 모양만 검사한다.
import { Transform, Type } from "class-transformer";
import {
  Equals,
  IsIn,
  IsInt,
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
import {
  B64U_16,
  IsAesBlob,
  IsB64u32,
  IsSignature,
  IsSpki,
  LOGIN_ID,
} from "../../common/crypto-formats.js";

const toLowerTrim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toLowerCase() : value;
const toTrim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class KdfParamsDto {
  @Equals("argon2id", { message: "지원하지 않는 비밀번호 변환 방식입니다." })
  algorithm: "argon2id";

  @IsInt() @Min(65536) @Max(262144)
  memoryKiB: number;

  @IsInt() @Min(3) @Max(10)
  iterations: number;

  @IsInt() @Min(1) @Max(4)
  parallelism: number;
}

export class LoginIdDto {
  @Transform(toLowerTrim)
  @IsString({ message: "아이디를 입력하세요." })
  @Matches(LOGIN_ID, { message: "아이디는 영문 소문자·숫자·점·밑줄·하이픈 3~64자입니다." })
  loginId: string;
}

// 마스터 비밀번호에서 나온 값을 바꿀 때 함께 보내는 묶음(새 소금·설정·확인값·계정 열쇠 사본)
export class PasswordMaterialDto {
  @IsString() @Matches(B64U_16, { message: "소금 형식이 올바르지 않습니다." })
  kdfSalt: string;

  @ValidateNested() @Type(() => KdfParamsDto)
  kdfParams: KdfParamsDto;

  @IsB64u32()
  authValue: string;

  @IsAesBlob(200)
  accountKeyMaster: string;
}

// 가입(처음 설정·초대 수락) 때 브라우저가 만들어 올리는 계정 열쇠 자료 전부
export class AccountMaterialDto extends PasswordMaterialDto {
  @IsUUID("4", { message: "사용자 ID 형식이 올바르지 않습니다." })
  id: string;

  @IsB64u32()
  recoveryAuthValue: string;

  @IsAesBlob(200)
  accountKeyRecovery: string;

  @IsSpki()
  encPublicKey: string;

  @IsAesBlob(4000)
  encPrivateKey: string;

  @IsSpki()
  signPublicKey: string;

  @IsAesBlob(1000)
  signPrivateKey: string;
}

export class SetupDto extends AccountMaterialDto {
  @IsString() @MaxLength(32)
  setupCode: string;

  @Transform(toLowerTrim)
  @IsString() @Matches(LOGIN_ID, { message: "아이디는 영문 소문자·숫자·점·밑줄·하이픈 3~64자입니다." })
  loginId: string;

  @Transform(toTrim)
  @IsString() @MinLength(1, { message: "이름을 입력하세요." }) @MaxLength(100)
  name: string;

  // 첫 관리자가 자기 서명 열쇠로 자기 관리자 승인에 서명한 값
  @IsSignature()
  adminGrantSig: string;
}

export class LoginDto extends LoginIdDto {
  @IsB64u32()
  authValue: string;
}

// 인증 코드(6자리) 또는 예비 코드(12자) 중 하나
export class SecondFactorDto {
  @IsOptional() @IsString() @Matches(/^\d{6}$/, { message: "인증 코드는 숫자 6자리입니다." })
  code?: string;

  @IsOptional() @IsString() @MaxLength(32)
  backupCode?: string;
}

export class TotpCodeDto {
  @IsString() @Matches(/^\d{6}$/, { message: "인증 코드는 숫자 6자리입니다." })
  code: string;
}

export class ChangePasswordDto extends PasswordMaterialDto {
  @IsB64u32()
  currentAuthValue: string;
}

export class RecoverStartDto extends LoginIdDto {
  @IsB64u32()
  recoveryAuthValue: string;

  @IsOptional() @IsString() @Matches(/^\d{6}$/, { message: "인증 코드는 숫자 6자리입니다." })
  code?: string;

  @IsOptional() @IsString() @MaxLength(32)
  backupCode?: string;
}

export class RecoverCompleteDto extends PasswordMaterialDto {
  @IsB64u32()
  recoveryAuthValue: string;

  @IsAesBlob(200)
  accountKeyRecovery: string;
}

export class SecretPurposeDto {
  @IsIn(["view", "copy", "edit"], { message: "비밀을 받는 목적이 올바르지 않습니다." })
  purpose: "view" | "copy" | "edit";
}
