// coss ui 버튼의 처리 중(loading) 동작을 확인한다: 초점 유지, 중복 실행 방지, 폼 재제출 방지.
import type { FormEvent } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

test('처리 중에도 버튼에 초점이 남고, 눌러도 안 된다는 것을 화면 읽기 프로그램에 알린다', () => {
  const { rerender } = render(<Button>저장</Button>);
  const button = screen.getByRole('button', { name: '저장' });
  button.focus();
  rerender(<Button loading>저장</Button>);
  // 네이티브 disabled를 켜면 브라우저가 초점을 문서 본문으로 옮기므로 aria-disabled로만 막아야 한다.
  expect(button).not.toHaveAttribute('disabled');
  expect(button).toHaveAttribute('aria-disabled', 'true');
  expect(button).toHaveFocus();
});

test('처리 중에는 눌러도 동작하지 않는다', async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  render(
    <Button loading onClick={onClick}>
      저장
    </Button>,
  );
  await user.click(screen.getByRole('button', { name: /저장/ }));
  expect(onClick).not.toHaveBeenCalled();
});

test('처리 중에는 입력칸에서 Enter를 눌러도 폼이 다시 제출되지 않는다', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <input aria-label="이름" />
      <Button type="submit" loading>
        저장
      </Button>
    </form>,
  );
  await user.type(screen.getByRole('textbox', { name: '이름' }), '가{Enter}');
  expect(onSubmit).not.toHaveBeenCalled();
});

test('처리 중이 아니면 눌렀을 때 동작한다', async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  render(<Button onClick={onClick}>저장</Button>);
  await user.click(screen.getByRole('button', { name: '저장' }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test('disabled만 준 버튼은 지금처럼 네이티브 disabled로 끈다', () => {
  render(<Button disabled>저장</Button>);
  expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
});
