// Vitest에서 DOM 요소를 검사하는 Testing Library 매처를 등록한다.
import '@testing-library/jest-dom/vitest';

// jsdom에는 ResizeObserver가 없어 Base UI 탭 밑줄 표시가 쓰는 최소 대체물을 둔다.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
