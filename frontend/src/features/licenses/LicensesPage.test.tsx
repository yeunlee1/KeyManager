// 라이선스 화면 시험: 목록·요약, 사용 상태 필터의 주소 반영, 처음부터 빈 목록과 조건에 맞는 결과 없음 구분
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { LicensesPage } from "./LicensesPage";

const getItems = vi.fn();
vi.mock("@/api/items", () => ({
  getItems: (params: unknown) => getItems(params),
  getCategoryStats: vi.fn().mockResolvedValue([
    { category: "Windows", total: 2, active: 1, available: 1 },
    { category: "Hancom", total: 1, active: 0, available: 1 },
  ]),
  getCategories: vi.fn().mockResolvedValue({ Windows: ["10", "11"], Hancom: ["2024"] }),
  createItem: vi.fn(),
  updateItemRequest: vi.fn(),
  deleteItemRequest: vi.fn(),
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="search">{location.search}</span>;
}

function renderAt(path = "/licenses") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LicensesPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

// 중괄호로 감싸 아무것도 돌려주지 않는다. 가짜 함수를 돌려주면 Vitest가 시험 뒤 정리 함수로 불러 버린다.
beforeEach(() => {
  getItems.mockReset();
});

test("라이선스 목록과 전체·사용 중·미사용 요약을 보여 준다", async () => {
  getItems.mockResolvedValue({ items: [{ no: 1, key: "VK7NX-9WQ3M-AAAAA-BBBBB-CCCCC", member: "홍길동", category: "Windows", version: "11" }], total: 1 });
  renderAt();
  expect(await screen.findByText("VK7NX-9WQ3M-AAAAA-BBBBB-CCCCC")).toBeInTheDocument();
  expect(screen.getByText("홍길동")).toBeInTheDocument();
  expect(screen.getByText("전체 3개 · 사용 중 1개 · 미사용 2개")).toBeInTheDocument();
  expect(screen.getByText("사용 중", { selector: "[data-slot=badge]" })).toBeInTheDocument();
});

test("사용 상태 필터를 누르면 주소에 남기고 그 조건으로 다시 불러온다", async () => {
  getItems.mockResolvedValue({ items: [], total: 0 });
  renderAt();
  await screen.findByText("등록된 라이선스가 없어요");
  await userEvent.click(screen.getByRole("button", { name: "미사용" }));
  await waitFor(() => expect(screen.getByTestId("search").textContent).toBe("?status=unassigned"));
  await waitFor(() => expect(getItems).toHaveBeenLastCalledWith(expect.objectContaining({ status: "unassigned", page: 1 })));
  expect(await screen.findByText("조건에 맞는 라이선스가 없어요")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "미사용" })).toHaveAttribute("aria-pressed", "true");
});

test("불러오기에 실패하면 빈 목록이 아니라 실패와 다시 시도를 보여 준다", async () => {
  getItems.mockRejectedValue(new Error("network"));
  renderAt();
  expect(await screen.findByText("라이선스 목록을 불러오지 못했어요")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
});
