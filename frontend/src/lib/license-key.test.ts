// 라이선스 키 한 칸 자동 서식 시험: 영문·숫자만 대문자로, 5자마다 하이픈, 25자 완성 여부와 사용 중 판정
import { formatLicenseKey, isAssigned, licenseKeyComplete } from "./license-key";

describe("formatLicenseKey", () => {
  it("영문·숫자만 남겨 대문자로 바꾸고 5자마다 하이픈을 넣는다", () => {
    expect(formatLicenseKey("vk7nx9wq3m")).toBe("VK7NX-9WQ3M");
    expect(formatLicenseKey("vk7nx-9wq3m-ab")).toBe("VK7NX-9WQ3M-AB");
    expect(formatLicenseKey("  vk7nx 9wq3m / 한글!")).toBe("VK7NX-9WQ3M");
  });

  it("붙여 넣은 키가 25자를 넘으면 25자에서 자른다", () => {
    expect(formatLicenseKey("ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-ZZZZ")).toBe("ABCDE-FGHIJ-KLMNO-PQRST-UVWXY");
  });

  it("25자를 모두 넣었을 때만 완성으로 본다", () => {
    expect(licenseKeyComplete("ABCDE-FGHIJ-KLMNO-PQRST-UVWXY")).toBe(true);
    expect(licenseKeyComplete("ABCDE-FGHIJ")).toBe(false);
  });
});

describe("isAssigned", () => {
  it("비었거나 '사용자없음'이면 미사용으로 본다(서버 기준과 같다)", () => {
    expect(isAssigned(null)).toBe(false);
    expect(isAssigned("")).toBe(false);
    expect(isAssigned("사용자없음")).toBe(false);
    expect(isAssigned("홍길동")).toBe(true);
  });
});
