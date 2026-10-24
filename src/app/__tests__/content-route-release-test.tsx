jest.mock('@/features/auth/MemberFeatureGate.native', () => ({ MemberFeatureGate: ({children}: {children: React.ReactNode}) => children }));
import { fireEvent, render } from '@testing-library/react-native';

import ContentRoute from '../content/[slug]';

const mockSlug = jest.fn<string, []>();
const mockDismissTo = jest.fn();

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>,
    useLocalSearchParams: () => ({ slug: mockSlug() }),
    useRouter: () => ({ back: jest.fn(), canGoBack: () => false, dismissTo: mockDismissTo }),
  };
});
jest.mock('@/features/content/ContentLibraryScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { ContentLibraryScreen: ({ slug }: { slug: string }) => <Text>{`library:${slug}`}</Text> };
});
jest.mock('@/features/content/LearningReportScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { LearningReportScreen: () => <Text>learning-report</Text> };
});
jest.mock('@/features/content/MockExamScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { MockExamScreen: () => <Text>mock-exam</Text> };
});
jest.mock('@/features/content/RadioPlayerScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { RadioPlayerScreen: () => <Text>radio</Text> };
});
jest.mock('@/features/content/VocabScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { VocabScreen: () => <Text>vocab</Text> };
});

describe('<ContentRoute /> Native 1.0.0 gates', () => {
  beforeEach(() => mockDismissTo.mockClear());

  it.each(['courses', 'ai-report'])('redirects a direct %s route before rendering hidden content', async (slug) => {
    mockSlug.mockReturnValue(slug);
    const screen = await render(<ContentRoute />);

    expect(screen.getByText('redirect:/(tabs)/discover')).toBeTruthy();
    expect(screen.queryByText('learning-report')).toBeNull();
    expect(screen.queryByText(`library:${slug}`)).toBeNull();
  });

  it('keeps the launch vocabulary route reachable', async () => {
    mockSlug.mockReturnValue('vocab');
    expect((await render(<ContentRoute />)).getByText('vocab')).toBeTruthy();
  });

  it('renders a safe recovery state instead of a blank screen for an unknown content route', async () => {
    mockSlug.mockReturnValue('unknown-private-content');
    const screen = await render(<ContentRoute />);

    expect(screen.getByText('无法打开此内容')).toBeTruthy();
    expect(screen.queryByText('library:unknown-private-content')).toBeNull();
    await fireEvent.press(screen.getByText('返回发现'));
    expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)/discover');
  });
});
