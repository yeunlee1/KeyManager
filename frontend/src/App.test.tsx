// 로그인·잠금 상태에 따라 앱이 알맞은 화면으로 안내하는지 실제 네트워크 없이 확인한다.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import App from "./App";
import { AuthProvider } from "./features/auth/AuthProvider";

const getAuthStatus = vi.fn();
const getMe = vi.fn();
vi.mock("@/api/auth", () => ({
  getAuthStatus: () => getAuthStatus(),
  getMe: () => getMe(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

const ME = {
  id: "u1",
  loginId: "hong",
  name: "홍길동",
  role: "member",
  status: "active",
  kdfSalt: "AAAAAAAAAAAAAAAAAAAAAA",
  kdfParams: { memoryKiB: 65536, iterations: 3, parallelism: 4 },
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getAuthStatus.mockReset();
  getMe.mockReset();
});

test("사용자가 없으면 어느 주소로 와도 처음 설정 화면으로 안내한다", async () => {
  getAuthStatus.mockResolvedValue({ setupRequired: true });
  renderAt("/vault");
  expect(await screen.findByRole("heading", { level: 1, name: "KeyManager 처음 설정" })).toBeInTheDocument();
});

test("세션이 없으면 로그인 화면으로 안내한다", async () => {
  getAuthStatus.mockResolvedValue({ setupRequired: false });
  getMe.mockRejectedValue({ response: { status: 401 } });
  renderAt("/admin/users");
  expect(await screen.findByRole("heading", { level: 1, name: "로그인" })).toBeInTheDocument();
});

test("세션은 있지만 금고를 열지 않았으면 잠금 화면을 보여 준다", async () => {
  getAuthStatus.mockResolvedValue({ setupRequired: false });
  getMe.mockResolvedValue(ME);
  renderAt("/vault");
  expect(await screen.findByRole("heading", { level: 1, name: "금고가 잠겼어요" })).toBeInTheDocument();
  expect(screen.getByLabelText("마스터 비밀번호")).toBeInTheDocument();
});

test("서버에 닿지 않으면 빈 화면 대신 다시 시도를 안내한다", async () => {
  getAuthStatus.mockRejectedValue(new Error("network"));
  renderAt("/vault");
  expect(await screen.findByText("서버에 연결하지 못했어요.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
});
