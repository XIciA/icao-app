import { fireEvent, render, within } from '@testing-library/react-native';

import type { QuestionBankDataset } from '../types';
import { QuestionBankCatalog } from '../components/QuestionBankCatalog.native';

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ account: { accountId: 'catalog-test' } }) }));
const mockPush = jest.fn();
jest.mock('@/features/auth/use-login-entry', () => ({ useLoginEntry: () => mockPush }));
jest.mock('../export/SentenceExportScreen',()=>({SentenceExportScreen:({onBack}:{onBack:()=>void})=>{const {Button}=jest.requireActual('react-native');return <Button title="关闭测试导出" onPress={onBack}/>;}}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }),
  useFocusEffect: (callback: () => void) => jest.requireActual('react').useEffect(callback, [callback]),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
jest.mock('../lib/catalog-progress', () => ({
  loadCatalogProgress: jest.fn(async () => ({})),
}));

const dataset: QuestionBankDataset = {
  id: 'opi',
  title: 'OPI',
  nameEn: 'OPI',
  description: 'description',
  summary: 'summary',
  enabled: true,
  statusLabel: 'ready',
  icon: 'mic',
  declaredTopicCount: 1,
  declaredCardCount: 8,
  categoryUnit: '分类',
  topicUnit: '话题',
  cardUnit: '题',
  study: {
    interaction: 'speaking',
    tools: { recorder: true, choices: false, notes: true, dictionary: true, highlights: true, tags: true },
    copy: { transcriptLabel: '题目', referenceLabel: '参考' },
    audioTitlePattern: 'card-title',
    consoleTabs: ['mine', 'reference', 'notes'],
  },
  access: {
    policyVersion: 'content-access-v2',
    environment: null,
    membershipActive: false,
    membershipExpiresAt: null,
  },
  categories: [{
    id: 'opi-category-01',
    name: '会员话题',
    declaredTopicCount: 1,
    declaredCardCount: 8,
    topics: [{
      id: 'opi-topic-0004',
      name: '应急设备',
      declaredCardCount: 8,
      cards: [],
      access: { level: 'member', availableCardCount: 0, declaredCardCount: 8 },
    }],
  }],
};

describe('<QuestionBankCatalog /> Native content access', () => {
  beforeEach(() => mockPush.mockClear());

  it('shows locked catalog metadata and routes a free user to membership', async () => {
    const screen = await render(<QuestionBankCatalog dataset={dataset} />);

    expect(screen.getByText('会员')).toBeTruthy();
    // Lock status must not replace the category's content meaning.
    expect(screen.getByTestId('category-symbol-weather', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(screen.getByText('会员话题'));
    expect(mockPush).toHaveBeenCalledWith('/account/membership?next=%2Fquestion-bank%2Fopi%2Fstudy%2Fopi-category-01%2Fopi-topic-0004', '登录后查看会员题库');
  });
});

it('keeps semantic icons with stable category IDs after filtering, reordering and renaming', async () => {
  const weather = { ...dataset.categories[0], name: '气象' };
  const systems = { ...weather, id: 'opi-category-06', name: '飞机系统' };
  const screen = await render(<QuestionBankCatalog dataset={{ ...dataset, categories: [weather, systems] }} />);
  await screen.rerender(<QuestionBankCatalog dataset={{ ...dataset, categories: [{ ...systems, name: 'Aircraft systems' }, { ...weather, name: 'Weather' }] }} />);
  expect(within(screen.getByTestId(`catalog-icon-${systems.id}`)).getByTestId('category-symbol-systems', { includeHiddenElements: true })).toBeTruthy();
  expect(within(screen.getByTestId(`catalog-icon-${weather.id}`)).getByTestId('category-symbol-weather', { includeHiddenElements: true })).toBeTruthy();
});

it('keeps specialty and airline icons unchanged and preserves the disclosure after repeated expand/collapse', async () => {
  const { StyleSheet } = jest.requireActual('react-native');
  const { colors } = jest.requireActual('@/theme');
  const bank: QuestionBankDataset = { ...dataset, id: 'radiotelephony', icon: 'radioTower', categories: [
    { ...dataset.categories[0], id: 'atc-scoring-points', name: '专项训练', declaredTopicCount: 2, topics: [
      { ...dataset.categories[0].topics[0], id: 'special-a', name: '放行许可', practiceKind: 'scoring-points' },
      { ...dataset.categories[0].topics[0], id: 'special-b', name: '初始联系', practiceKind: 'scoring-points' },
    ] },
    { ...dataset.categories[0], id: 'airline', name: 'CCA', declaredTopicCount: 2, topics: [
      { ...dataset.categories[0].topics[0], id: 'airline-a' }, { ...dataset.categories[0].topics[0], id: 'airline-b' },
    ] },
  ] };
  const screen = await render(<QuestionBankCatalog dataset={bank} />);
  for (const category of bank.categories) {
    for (let i = 0; i < 3; i++) {
      const arrow = () => screen.getByTestId(`catalog-disclosure-${category.id}`);
      const icon = () => screen.getByTestId(`catalog-icon-${category.id}`);
      expect(StyleSheet.flatten(arrow().props.style).transform).toEqual([{ rotate: '0deg' }]);
      await fireEvent.press(screen.getByRole('button', { name: `${category.name}，展开` }));
      expect(screen.getByRole('button', { name: `${category.name}，收起` }).props.accessibilityState.expanded).toBe(true);
      expect(StyleSheet.flatten(arrow().props.style).transform).toEqual([{ rotate: '180deg' }]);
      expect(StyleSheet.flatten(icon().props.style).backgroundColor).toBe(colors.primary10);
      await fireEvent.press(screen.getByRole('button', { name: `${category.name}，收起` }));
      expect(StyleSheet.flatten(arrow().props.style).transform).toEqual([{ rotate: '0deg' }]);
      expect(arrow().props.children).toBeTruthy();
      expect(StyleSheet.flatten(icon().props.style).backgroundColor).toBe(colors.primary10);
    }
  }
});

it('pauses automatic export teaching when returning to the catalog without a route change',async()=>{
 const {GuideBindingContext}=jest.requireActual('@/features/usage-guide/GuideBindings') as typeof import('@/features/usage-guide/GuideBindings');
 const pause=jest.fn();
 const guide={current:'export',event:jest.fn(),availability:jest.fn(),register:jest.fn(),modal:jest.fn(),surface:()=>null,offer:jest.fn(),exit:jest.fn(),start:jest.fn(async()=>undefined),suspend:jest.fn(),pause,checkpoint:jest.fn()};
 const screen=await render(<GuideBindingContext.Provider value={guide}><QuestionBankCatalog dataset={{...dataset,id:'sentences900'}}/></GuideBindingContext.Provider>);
 await fireEvent.press(screen.getByLabelText('导出900句 PDF'));
 await fireEvent.press(screen.getByText('关闭测试导出'));expect(pause).toHaveBeenCalledTimes(1);
 expect(screen.getByLabelText('导出900句 PDF')).toBeTruthy();
});
