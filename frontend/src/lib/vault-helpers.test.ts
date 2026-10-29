// 금고 화면 도우미 시험: 클립보드 자동 지움, 비밀번호 만들기, 항목 칸 검사와 검색 글자
import { CLIPBOARD_CLEAR_MS, copyWithAutoClear } from "./clipboard";
import { generatePassword } from "./generate-password";
import { draftToContent, emptyDraft, searchText, validateDraft } from "./item-types";

describe("copyWithAutoClear", () => {
  afterEach(() => vi.useRealTimers());

  function fakeClipboard(initial = "") {
    let text = initial;
    return {
      writeText: vi.fn(async (value: string) => {
        text = value;
      }),
      readText: vi.fn(async () => text),
      peek: () => text,
      set: (value: string) => {
        text = value;
      },
    };
  }

  it("30초 뒤 클립보드가 복사한 값 그대로면 지운다", async () => {
    vi.useFakeTimers();
    const clipboard = fakeClipboard();
    const notCleared = vi.fn();
    await copyWithAutoClear("s3cret!", notCleared, clipboard);
    expect(clipboard.peek()).toBe("s3cret!");
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS);
    expect(clipboard.peek()).toBe("");
    expect(notCleared).not.toHaveBeenCalled();
  });

  it("그 사이 다른 내용으로 바뀌었으면 덮어쓰지 않고 알린다", async () => {
    vi.useFakeTimers();
    const clipboard = fakeClipboard();
    const notCleared = vi.fn();
    await copyWithAutoClear("s3cret!", notCleared, clipboard);
    clipboard.set("다른 글");
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS);
    expect(clipboard.peek()).toBe("다른 글");
    expect(notCleared).toHaveBeenCalledWith("changed");
  });

  it("클립보드를 읽을 수 없으면 지우지 않고 알린다", async () => {
    vi.useFakeTimers();
    const clipboard = fakeClipboard();
    clipboard.readText.mockRejectedValue(new Error("권한 없음"));
    const notCleared = vi.fn();
    await copyWithAutoClear("s3cret!", notCleared, clipboard);
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS);
    expect(clipboard.peek()).toBe("s3cret!");
    expect(notCleared).toHaveBeenCalledWith("unreadable");
  });
});

describe("generatePassword", () => {
  it("20자이고 대문자·소문자·숫자·기호가 모두 들어간다", () => {
    for (let i = 0; i < 50; i += 1) {
      const value = generatePassword();
      expect(value).toHaveLength(20);
      expect(value).toMatch(/[A-Z]/);
      expect(value).toMatch(/[a-z]/);
      expect(value).toMatch(/[0-9]/);
      expect(value).toMatch(/[^A-Za-z0-9]/);
    }
    expect(generatePassword()).not.toBe(generatePassword());
  });
});

describe("항목 칸", () => {
  it("이름은 꼭 넣어야 하고, 포트는 1~65535 숫자만 받는다", () => {
    const draft = { ...emptyDraft("remote"), name: " ", port: "70000" };
    expect(validateDraft(draft)).toMatchObject({ name: "이름을 넣으세요.", port: "포트는 1~65535 사이 숫자로 넣으세요." });
    expect(validateDraft({ ...draft, name: "고객사 A 서버", port: "3389" })).toEqual({});
  });

  it("글자 칸은 500자, 메모는 10,000자까지 받는다", () => {
    const draft = { ...emptyDraft("note"), name: "a".repeat(501), memo: "가".repeat(10_001) };
    expect(validateDraft(draft)).toMatchObject({ name: "500자까지 넣을 수 있어요.", memo: "10,000자까지 넣을 수 있어요." });
  });

  it("요약에는 비밀번호·메모를 넣지 않고, 검색 글자는 이름·업체·주소·아이디·DB 이름에서 만든다", () => {
    const draft = { ...emptyDraft("database"), name: "운영 DB", vendor: "고객사 B", host: "10.0.0.5", dbName: "erp", username: "sa", password: "pw!", memo: "메모" };
    const content = draftToContent(draft);
    expect(JSON.stringify(content.summary)).not.toContain("pw!");
    expect(JSON.stringify(content.summary)).not.toContain("메모");
    expect(content.secret).toEqual({ password: "pw!", memo: "메모" });
    expect(searchText(content.summary)).toBe("운영 db 고객사 b 10.0.0.5 sa erp");
  });
});
