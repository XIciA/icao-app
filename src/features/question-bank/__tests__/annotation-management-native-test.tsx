import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { AnnotationFloatingPanel } from '../components/AnnotationToolbar.native';
import { DEFAULT_ANNOTATION_HIGHLIGHTS, DEFAULT_ANNOTATION_TAGS } from '../annotations/types';
const props = {
  activeHighlightId: 'green', highlightDefinitions: DEFAULT_ANNOTATION_HIGHLIGHTS,
  tagDefinitions: DEFAULT_ANNOTATION_TAGS, left: 0, top: 0, width: 320, resetToken: 'q1', selectedTags: [],
  onCreateHighlight: jest.fn(), onCreateTag: jest.fn(), onHighlightChange: jest.fn(), onTagToggle: jest.fn(),
  onManagingChange: jest.fn(), onSaveDefinition: jest.fn(async () => true), onDeleteDefinition: jest.fn(async () => true), definitionUsage: () => 3,
};
beforeEach(() => { jest.clearAllMocks(); props.onSaveDefinition.mockResolvedValue(true); });
it.each(['tags', 'highlight'] as const)('%s keeps management outside the scrolling long labels and preserves selection', async (mode) => {
  const definitions = DEFAULT_ANNOTATION_TAGS.map((definition, index) => ({ ...definition, label: `需要重点复习分类${index}` }));
  const screen = await render(<AnnotationFloatingPanel {...props} width={240} mode={mode} tagDefinitions={definitions} highlightDefinitions={definitions} />);
  const scroll = within(screen.getByTestId('annotation-options-scroll'));
  expect(scroll.queryByLabelText('管理标注分类')).toBeNull();
  await fireEvent.press(scroll.getByLabelText(mode === 'tags' ? `选择${definitions[0].label}` : `使用${definitions[0].label}高亮`));
  expect(mode === 'tags' ? props.onTagToggle : props.onHighlightChange).toHaveBeenCalledWith(definitions[0].id);
  await fireEvent.press(screen.getByLabelText('管理标注分类'));
  expect(screen.getByLabelText('标注名称')).toBeTruthy();
});
it.each(['tags', 'highlight'] as const)('%s management selects definitions without applying them, saves rename and exits', async (mode) => {
  const screen = await render(<AnnotationFloatingPanel {...props} mode={mode} />);
  await fireEvent.press(screen.getByLabelText('管理标注分类'));
  expect(props.onManagingChange).toHaveBeenLastCalledWith(true);
  await fireEvent.press(screen.getByLabelText('颜色 yellow 已使用'));
  expect(screen.getByLabelText('标注名称').props.value).toBe('记忆');
  expect(props.onTagToggle).not.toHaveBeenCalled(); expect(props.onHighlightChange).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('标注名称'), '复习');
  await fireEvent.press(screen.getByLabelText('保存标注'));
  await waitFor(() => expect(screen.queryByLabelText('标注名称')).toBeNull());
  expect(props.onSaveDefinition).toHaveBeenCalledWith(mode === 'tags' ? 'tag' : 'highlight', mode === 'tags' ? 'memory' : 'yellow', '复习', 'yellow');
  expect(props.onManagingChange).toHaveBeenLastCalledWith(false);
});
it('creates by selecting an unused color and never auto-applies the new tag', async () => {
  const screen = await render(<AnnotationFloatingPanel {...props} mode="tags" />);
  await fireEvent.press(screen.getByLabelText('管理标注分类'));
  await fireEvent.press(screen.getByLabelText('颜色 purple 未使用'));
  expect(screen.getByLabelText('标注名称').props.value).toBe('');
  await fireEvent.changeText(screen.getByLabelText('标注名称'), '疑问');
  await fireEvent.press(screen.getByLabelText('保存标注'));
  expect(props.onSaveDefinition).toHaveBeenCalledWith('tag', undefined, '疑问', 'purple');
  expect(props.onTagToggle).not.toHaveBeenCalled();
});
it('retains a failed draft; cancelling and discarding a color change do not persist', async () => {
  props.onSaveDefinition.mockResolvedValueOnce(false);
  const screen = await render(<AnnotationFloatingPanel {...props} mode="highlight" />);
  await fireEvent.press(screen.getByLabelText('管理标注分类'));
  await fireEvent.changeText(screen.getByLabelText('标注名称'), '新名字');
  await fireEvent.press(screen.getByLabelText('颜色 yellow 已使用'));
  expect(screen.getByText('切换颜色会放弃未保存的名称修改。')).toBeTruthy();
  await fireEvent.press(screen.getByText('继续编辑'));
  await fireEvent.press(screen.getByLabelText('保存标注'));
  expect(screen.getByLabelText('标注名称').props.value).toBe('新名字');
  await fireEvent.press(screen.getByLabelText('取消编辑标注'));
  expect(screen.queryByLabelText('标注名称')).toBeNull();
  expect(props.onDeleteDefinition).not.toHaveBeenCalled();
});
it('confirms deletion impact before deleting a used class', async () => {
  const screen = await render(<AnnotationFloatingPanel {...props} mode="highlight" />);
  await fireEvent.press(screen.getByLabelText('管理标注分类'));
  await fireEvent.press(screen.getByLabelText('删除当前分类'));
  expect(props.onDeleteDefinition).not.toHaveBeenCalled();
  expect(screen.getByText(/3 道题/)).toBeTruthy();
  await fireEvent.press(screen.getByText('确认删除'));
  expect(props.onDeleteDefinition).toHaveBeenCalledWith('highlight', 'green');
  expect(props.onTagToggle).not.toHaveBeenCalled();
});

it('protects a dirty draft when an external navigation or tool change requests exit', async () => {
  const guard = { current: undefined as (() => Promise<boolean>) | undefined };
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const screen = await render(<AnnotationFloatingPanel {...props} mode="tags" exitGuardRef={guard} />);
  await fireEvent.press(screen.getByLabelText('管理标注分类'));
  await fireEvent.changeText(screen.getByLabelText('标注名称'), '未保存');
  let exit: Promise<boolean>;
  await act(() => { exit = guard.current!(); });
  expect(alert).toHaveBeenCalledWith('放弃未保存的修改？', expect.any(String), expect.any(Array), expect.any(Object));
  await act(async () => { alert.mock.calls.at(-1)![2]![0].onPress!(); expect(await exit!).toBe(false); });
  expect(screen.getByLabelText('标注名称').props.value).toBe('未保存');
  await act(() => { exit = guard.current!(); });
  await act(async () => { alert.mock.calls.at(-1)![2]![1].onPress!(); expect(await exit!).toBe(true); });
  expect(screen.queryByLabelText('标注名称')).toBeNull();
  expect(props.onSaveDefinition).not.toHaveBeenCalled();
  expect(props.onTagToggle).not.toHaveBeenCalled();
  alert.mockRestore();
});
