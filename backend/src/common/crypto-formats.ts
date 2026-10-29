// 브라우저가 보내는 암호문·열쇠·확인값의 형식 검사(정규식)와 공통 DTO 데코레이터. 서버는 내용을 풀지 않고 모양만 확인한다.
import { applyDecorators } from "@nestjs/common";
import { IsString, Matches, MaxLength } from "class-validator";

// base64url(패딩 없음) 32바이트·16바이트
export const B64U_32 = /^[A-Za-z0-9_-]{43}$/;
export const B64U_16 = /^[A-Za-z0-9_-]{22}$/;
// AES-256-GCM 암호문: v1.{IV 12바이트}.{암호문+태그}
export const AES_BLOB = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/;
// RSA-OAEP 3072비트로 잠근 값(384바이트)
export const RSA_BLOB = /^v1r\.[A-Za-z0-9_-]{512}$/;
// ECDSA P-256 서명(IEEE P1363, 64바이트)
export const SIG_BLOB = /^v1s\.[A-Za-z0-9_-]{86}$/;
// SPKI 공개키(RSA-3072 약 563자, P-256 약 122자)
export const SPKI = /^[A-Za-z0-9_-]{100,800}$/;
// 아이디: 소문자로 바꾼 뒤 영문·숫자·점·밑줄·하이픈 3~64자
export const LOGIN_ID = /^[a-z0-9._-]{3,64}$/;

export function IsAesBlob(maxLength: number) {
  return applyDecorators(
    IsString({ message: "암호문 형식이 올바르지 않습니다." }),
    MaxLength(maxLength, { message: "암호문이 너무 깁니다." }),
    Matches(AES_BLOB, { message: "암호문 형식이 올바르지 않습니다." }),
  );
}

export function IsB64u32() {
  return applyDecorators(
    IsString({ message: "확인값 형식이 올바르지 않습니다." }),
    Matches(B64U_32, { message: "확인값 형식이 올바르지 않습니다." }),
  );
}

export function IsRsaBlob() {
  return applyDecorators(
    IsString({ message: "열쇠 사본 형식이 올바르지 않습니다." }),
    Matches(RSA_BLOB, { message: "열쇠 사본 형식이 올바르지 않습니다." }),
  );
}

export function IsSignature() {
  return applyDecorators(
    IsString({ message: "서명 형식이 올바르지 않습니다." }),
    Matches(SIG_BLOB, { message: "서명 형식이 올바르지 않습니다." }),
  );
}

export function IsSpki() {
  return applyDecorators(
    IsString({ message: "공개키 형식이 올바르지 않습니다." }),
    Matches(SPKI, { message: "공개키 형식이 올바르지 않습니다." }),
  );
}
