import { render } from '@testing-library/react-native';

import ContentRoute from '../content/[slug]';

const mockSlug = jest.fn<string, []>();

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>,
    useLocalSearchParams: () => ({ slug: mockSlug() }),
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
});
