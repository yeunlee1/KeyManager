// 라이선스 키 한 칸 입력의 자동 서식(영문·숫자 25자, 5자마다 하이픈)과 사용 중 판정
export const LICENSE_KEY_LENGTH = 25;

export function formatLicenseKey(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, LICENSE_KEY_LENGTH);
  return clean.match(/.{1,5}/g)?.join("-") ?? "";
}

export function licenseKeyComplete(formatted: string): boolean {
  return formatted.replace(/-/g, "").length === LICENSE_KEY_LENGTH;
}

// 미사용 기준은 서버와 같다: NULL, 빈 문자열, '사용자없음'
export function isAssigned(member: string | null | undefined): boolean {
  return !!member && member !== "사용자없음";
}
