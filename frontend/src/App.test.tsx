// 실제 네트워크 없이 앱의 제목과 연결 상태를 확인한다.
import { render, screen } from '@testing-library/react';
import App from './App';

vi.mock('./api/items', () => ({
  checkHealth: vi.fn().mockResolvedValue({ status: 'ok' }),
  getCategories: vi.fn().mockResolvedValue({ Windows: ['10', '11'] }),
  getCategoryStats: vi.fn().mockResolvedValue([]),
  getItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  createItem: vi.fn(),
  updateItemRequest: vi.fn(),
  deleteItemRequest: vi.fn(),
  getErrorMessage: vi.fn(),
}));

test('라이선스 관리 제목과 연결 완료 상태를 표시한다', async () => {
  render(<App />);
  const heading = screen.getByRole('heading', { level: 1, name: '라이선스 관리' });
  expect(heading).toBeInTheDocument();
  expect(await screen.findByText('시스템 연결됨')).toBeInTheDocument();
  expect(await screen.findByText('등록된 라이선스가 없습니다.')).toBeInTheDocument();
});
