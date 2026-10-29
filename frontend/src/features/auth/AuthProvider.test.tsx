// 로그인·잠금 상태(AuthProvider): 서버 응답에 따른 상태, 15분 자동 잠금, 탭 사이 잠금, 세션 만료 처리 시험
import { act, render, screen, waitFor } from "@testing-library/react";
import { SESSION_EXPIRED_EVENT } from "@/api/client";
import { useAuth } from "./auth-context";
import { AuthProvider, IDLE_LOCK_MS } from "./AuthProvider";

const getAuthStatus = vi.fn();
const getMe = vi.fn();
vi.mock("@/api/auth", () => ({
  getAuthStatus: () => getAuthStatus(),
  getMe: () => getMe(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

// 다른 탭을 흉내 내는 BroadcastChannel(같은 이름끼리 메시지를 주고받는다)
class FakeChannel {
  static channels: FakeChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(public name: string) {
    FakeChannel.channels.push(this);
  }
  postMessage(data: unknown) {
    for (const other of FakeChannel.channels) {
      if (other !== this && other.name === this.name) other.onmessage?.({ data } as MessageEvent);
    }
  }
  close() {
    FakeChannel.channels = FakeChannel.channels.filter((item) => item !== this);
  }
}

const ME = { id: "u1", loginId: "hong", name: "홍길동", role: "member" };
const KEYS = { accountKeyRaw: new Uint8Array(32) } as never;

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="keys">{auth.keys ? "있음" : "없음"}</span>
      <button type="button" onClick={() => auth.acceptUnlockedKeys(KEYS)}>
        열기
      </button>
      <button type="button" onClick={() => auth.lock()}>
        잠그기
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  FakeChannel.channels = [];
  vi.stubGlobal("BroadcastChannel", FakeChannel);
  getAuthStatus.mockReset();
  getMe.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("사용자가 없으면 처음 설정 상태가 된다", async () => {
  getAuthStatus.mockResolvedValue({ setupRequired: true });
  renderProvider();
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("setup"));
});

test("세션이 없으면 로그아웃 상태, 있으면 잠긴 상태로 시작한다", async () => {
  getAuthStatus.mockResolvedValue({ setupRequired: false });
  getMe.mockRejectedValueOnce({ response: { status: 401 } });
  const first = renderProvider();
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("signed-out"));
  first.unmount();

  getMe.mockResolvedValueOnce(ME);
  renderProvider();
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("locked"));
  expect(screen.getByTestId("keys")).toHaveTextContent("없음");
});

test("15분 동안 조작이 없으면 잠그고 열쇠를 지운다", async () => {
  getAuthStatus.mockResolvedValue({ setupRequired: false });
  getMe.mockResolvedValue(ME);
  renderProvider();
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("locked"));
  vi.useFakeTimers();
  act(() => screen.getByText("열기").click());
  expect(screen.getByTestId("status").textContent).toBe("unlocked");
  act(() => {
    vi.advanceTimersByTime(IDLE_LOCK_MS - 60_000);
  });
  expect(screen.getByTestId("status").textContent).toBe("unlocked");
  act(() => {
    vi.advanceTimersByTime(120_000);
  });
  expect(screen.getByTestId("status").textContent).toBe("locked");
  expect(screen.getByTestId("keys")).toHaveTextContent("없음");
});

test("다른 탭에서 잠그면 이 탭도 잠긴다", async () => {
  getAuthStatus.mockResolvedValue({ setupRequired: false });
  getMe.mockResolvedValue(ME);
  renderProvider();
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("locked"));
  act(() => screen.getByText("열기").click());
  expect(screen.getByTestId("status").textContent).toBe("unlocked");
  const otherTab = new FakeChannel("km-session");
  act(() => otherTab.postMessage({ type: "lock" }));
  expect(screen.getByTestId("status").textContent).toBe("locked");
});

test("세션이 끝났다는 알림을 받으면 열쇠를 지우고 로그아웃 상태가 된다", async () => {
  getAuthStatus.mockResolvedValue({ setupRequired: false });
  getMe.mockResolvedValue(ME);
  renderProvider();
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("locked"));
  act(() => screen.getByText("열기").click());
  act(() => {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  });
  expect(screen.getByTestId("status").textContent).toBe("signed-out");
  expect(screen.getByTestId("keys")).toHaveTextContent("없음");
});
