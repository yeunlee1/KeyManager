// 마스터 비밀번호 강도 조건(12자 이상·강도 점수 3 이상·아이디·이름 금지·지금 비밀번호와 다름) 단위 시험
import { checkMasterPassword } from "./password-policy";

describe("checkMasterPassword", () => {
  it("길고 짐작하기 어려운 문장형 비밀번호는 통과한다", async () => {
    const result = await checkMasterPassword("맑은 하늘 아래 파란 금고 열쇠 2026", { loginId: "hong", name: "홍길동" });
    expect(result).toMatchObject({ ok: true, problems: [] });
  });

  it("12자보다 짧으면 막는다", async () => {
    const result = await checkMasterPassword("Ab1!xyz", { loginId: "hong", name: "홍길동" });
    expect(result.ok).toBe(false);
    expect(result.problems).toContain("12자 이상이어야 해요.");
  });

  it("흔한 비밀번호는 길어도 막는다", async () => {
    const result = await checkMasterPassword("password123456", { loginId: "hong", name: "홍길동" });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("짐작하기 쉬운");
  });

  it("아이디나 이름이 들어 있으면 막는다", async () => {
    const withId = await checkMasterPassword("Hong 맑은 하늘 아래 금고 2026", { loginId: "hong", name: "홍길동" });
    expect(withId.problems).toContain("아이디나 이름이 들어 있으면 안 돼요.");
    const withName = await checkMasterPassword("홍길동의 맑은 하늘 금고 2026", { loginId: "hong", name: "홍길동" });
    expect(withName.problems).toContain("아이디나 이름이 들어 있으면 안 돼요.");
  });

  it("바꿀 때 지금 비밀번호와 같으면 막는다", async () => {
    const same = "맑은 하늘 아래 파란 금고 열쇠 2026";
    const result = await checkMasterPassword(same, { loginId: "hong", name: "홍길동", current: same });
    expect(result.problems).toContain("지금 비밀번호와 달라야 해요.");
  });
});
