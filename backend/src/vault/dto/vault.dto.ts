// 금고 요청(묶음·구성원·열쇠 교체·항목·비밀 제공)의 본문 형식. 암호문·서명은 모양만 검사하고 개수 상한을 둔다.
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { IsAesBlob, IsSignature } from "../../common/crypto-formats.js";

const RSA = /^v1r\.[A-Za-z0-9_-]{512}$/;

export class AccessGrantDto {
  @IsUUID("4") userId: string;

  @IsIn(["view", "edit"], { message: "권한이 올바르지 않습니다." })
  permission: "view" | "edit";

  @IsBoolean() isMember: boolean;

  @IsString() @Matches(RSA, { message: "열쇠 사본 형식이 올바르지 않습니다." })
  wrappedKey: string;

  @IsSignature() shareSignature: string;
}

export class CreateGroupDto {
  @IsUUID("4") id: string;

  @IsAesBlob(2000) nameEnc: string;

  @ArrayMaxSize(100, { message: "한 묶음의 사람 수 상한(100명)을 넘었습니다." })
  @ValidateNested({ each: true }) @Type(() => AccessGrantDto)
  accesses: AccessGrantDto[];
}

export class RenameGroupDto {
  @IsInt() @Min(1) generation: number;

  @IsAesBlob(2000) nameEnc: string;
}

export class ItemKeyDto {
  @IsUUID("4") itemId: string;

  // 이 개정의 항목 열쇠를 다시 잠갔다는 표시. 그 사이 항목이 고쳐졌으면 서버가 거절한다(옛 열쇠로 덮어쓰지 않게).
  @IsInt() @Min(1) revision: number;

  @IsAesBlob(200) itemKeyEnc: string;
}

// 묶음 하나의 열쇠 교체 자료: 새 세대 이름·남은 사람 모두의 새 사본·모든 항목 열쇠의 새 사본
export class RotationDto {
  @IsUUID("4") groupId: string;

  @IsInt() @Min(1) fromGeneration: number;

  @IsAesBlob(2000) nameEnc: string;

  @ArrayMaxSize(100, { message: "한 묶음의 사람 수 상한(100명)을 넘었습니다." })
  @ValidateNested({ each: true }) @Type(() => AccessGrantDto)
  accesses: AccessGrantDto[];

  @ArrayMaxSize(5000, { message: "한 묶음의 항목 수 상한(5,000개)을 넘었습니다." })
  @ValidateNested({ each: true }) @Type(() => ItemKeyDto)
  itemKeys: ItemKeyDto[];
}

export class PutMemberDto {
  @IsIn(["view", "edit"], { message: "권한이 올바르지 않습니다." })
  permission: "view" | "edit";

  // 처음 넣는 사람에게만 필요하다(관리자처럼 이미 사본이 있으면 생략).
  @IsOptional() @IsInt() @Min(1) generation?: number;

  @IsOptional() @IsString() @Matches(RSA, { message: "열쇠 사본 형식이 올바르지 않습니다." })
  wrappedKey?: string;

  @IsOptional() @IsSignature() shareSignature?: string;
}

export class RemoveMemberDto {
  // 직원을 빼면 열쇠 교체가 필요하다. 관리자를 구성원에서만 빼는 경우에는 생략한다.
  @IsOptional() @ValidateNested() @Type(() => RotationDto)
  rotation?: RotationDto;
}

export class RotationsDto {
  @ArrayMaxSize(50, { message: "한 번에 교체할 수 있는 묶음 수(50개)를 넘었습니다." })
  @ValidateNested({ each: true }) @Type(() => RotationDto)
  rotations: RotationDto[];
}

export class CreateItemDto {
  @IsUUID("4") id: string;

  // 개인 항목이면 null
  @ValidateIf((_, value) => value !== null) @IsUUID("4") groupId: string | null;

  @ValidateIf((dto: CreateItemDto) => dto.groupId !== null) @IsInt() @Min(1)
  keyGeneration: number | null;

  @IsAesBlob(200) itemKeyEnc: string;

  @IsAesBlob(24000) summaryEnc: string;

  @IsAesBlob(48000) secretEnc: string;
}

export class UpdateItemDto {
  @IsInt() @Min(1) expectedRevision: number;

  @IsOptional() @IsInt() @Min(1) keyGeneration?: number | null;

  @IsAesBlob(200) itemKeyEnc: string;

  @IsAesBlob(24000) summaryEnc: string;

  @IsAesBlob(48000) secretEnc: string;

  // "비밀번호를 새로 바꿨어요"를 고르면 교체 권장 표시를 지운다.
  @IsBoolean() clearRotation: boolean;
}

export class SecretRequestDto {
  @IsIn(["view", "copy", "edit"], { message: "비밀을 받는 목적이 올바르지 않습니다." })
  purpose: "view" | "copy" | "edit";

  @IsInt() @Min(1) @Max(1_000_000_000) expectedRevision: number;
}
