import { act, renderHook } from '@testing-library/react-native';
import { useNoteDraft } from '../hooks/useNoteDraft';

it('updates each keystroke immediately and ignores delayed save echoes during Chinese input', async () => {
  const save = jest.fn();
  const hook = await renderHook(({ saved }: { saved: string }) => useNoteDraft('session:q1', saved, true, save), { initialProps: { saved: '' } });
  for (const text of ['n', 'ni', '你', '你好', '你好\nATC']) {
    await act(() => hook.result.current.change(text));
    expect(hook.result.current.text).toBe(text);
  }
  await hook.rerender({ saved: 'ni' });
  expect(hook.result.current.text).toBe('你好\nATC');
  await hook.rerender({ saved: '你好\nATC' });
  await hook.rerender({ saved: '你' });
  expect(hook.result.current.text).toBe('你好\nATC');
  expect(save.mock.calls.map(([value]) => value)).toEqual(['n', 'ni', '你', '你好', '你好\nATC']);
});

it('retains deletion and blurred drafts until saved, then accepts later external changes', async () => {
  const hook = await renderHook(({ saved, editing }: { saved: string; editing: boolean }) => useNoteDraft('session:q1', saved, editing, jest.fn()), { initialProps: { saved: '原笔记', editing: true } });
  await act(() => hook.result.current.change(''));
  await hook.rerender({ saved: '原笔记', editing: false });
  expect(hook.result.current.text).toBe('');
  await hook.rerender({ saved: '', editing: false });
  await hook.rerender({ saved: '另一设备的新笔记', editing: false });
  expect(hook.result.current.text).toBe('另一设备的新笔记');
});

it('does not leak a draft to a new question or session and permits late hydration before typing', async () => {
  const save = jest.fn();
  const hook = await renderHook(({ scope, saved }: { scope: string; saved: string }) => useNoteDraft(scope, saved, true, save), { initialProps: { scope: 'session:q1', saved: '' } });
  await hook.rerender({ scope: 'session:q1', saved: '已保存的笔记' });
  expect(hook.result.current.text).toBe('已保存的笔记');
  await act(() => hook.result.current.change('新草稿'));
  await hook.rerender({ scope: 'session:q2', saved: '第二题' });
  expect(hook.result.current.text).toBe('第二题');
  await hook.rerender({ scope: 'next-session:q1', saved: '新会话笔记' });
  expect(hook.result.current.text).toBe('新会话笔记');
  expect(save).toHaveBeenCalledTimes(1);
});

it('waits for the latest save even when an earlier value happens to equal the final draft', async () => {
  const complete: (() => void)[] = [];
  const save = jest.fn(() => new Promise<boolean>(resolve => complete.push(() => resolve(true))));
  const hook = await renderHook(({ saved, editing }: { saved: string; editing: boolean }) => useNoteDraft('q1', saved, editing, save), { initialProps: { saved: '', editing: true } });
  await act(() => hook.result.current.change('a'));
  await act(() => hook.result.current.change('ab'));
  await act(() => hook.result.current.change('a'));
  await hook.rerender({ saved: 'a', editing: false });
  await act(() => complete[0]());
  await hook.rerender({ saved: 'ab', editing: false });
  expect(hook.result.current.text).toBe('a');
  await act(() => complete[1]());
  await act(() => complete[2]());
  await hook.rerender({ saved: 'a', editing: false });
  await hook.rerender({ saved: '同步的新内容', editing: false });
  expect(hook.result.current.text).toBe('同步的新内容');
});

it('preserves a failed save until retry clears the existing error', async () => {
  const hook = await renderHook(({ saved, error }: { saved: string; error?: string }) => useNoteDraft('q1', saved, false, async () => false, error), { initialProps: { saved: '', error: '保存失败' } });
  await act(() => hook.result.current.change('未保存'));
  await hook.rerender({ saved: '未保存', error: '保存失败' });
  await hook.rerender({ saved: '', error: '保存失败' });
  expect(hook.result.current.text).toBe('未保存');
  await hook.rerender({ saved: '未保存', error: undefined });
  await hook.rerender({ saved: '重试后同步', error: undefined });
  expect(hook.result.current.text).toBe('重试后同步');
});
