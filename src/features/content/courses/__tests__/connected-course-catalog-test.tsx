import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ConnectedCourseCatalogScreen } from '../ConnectedCourseCatalogScreen';
import { builtinCourseRelease, readAvailableCourses, refreshCourses } from '../course-content-repository';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: (callback: () => void) => jest.requireActual('react').useEffect(callback, [callback]) }));
jest.mock('../course-content-repository', () => ({
  builtinCourseRelease: { payload: { hero: { title: 'bundled' } } },
  readAvailableCourses: jest.fn(),
  refreshCourses: jest.fn(),
}));
jest.mock('../AppCourseCatalogScreen', () => ({
  CourseCatalogScreen: ({ catalog, hidePrices }: { catalog: { hero: { title: string } }; hidePrices: boolean }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`${catalog.hero.title}:${hidePrices ? 'hours-only' : 'price'}`}</Text>;
  },
}));

beforeEach(() => { jest.clearAllMocks(); });

it('displays cached content first, then updates the native template with remote data', async () => {
  jest.mocked(readAvailableCourses).mockResolvedValue({ ...builtinCourseRelease, payload: { ...builtinCourseRelease.payload, hero: { ...builtinCourseRelease.payload.hero, title: 'cached' } } });
  let finish!: (value: typeof builtinCourseRelease) => void;
  jest.mocked(refreshCourses).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const screen = await render(<ConnectedCourseCatalogScreen />);
  await waitFor(() => expect(screen.getByText('cached:hours-only')).toBeTruthy());
  await act(async () => { finish({ ...builtinCourseRelease, payload: { ...builtinCourseRelease.payload, hero: { ...builtinCourseRelease.payload.hero, title: 'remote' } } }); });
  expect(screen.getByText('remote:hours-only')).toBeTruthy();
});

it('does not replace the page while the user is already reading or opening details', async () => {
  jest.mocked(readAvailableCourses).mockResolvedValue(builtinCourseRelease);
  let finish!: (value: typeof builtinCourseRelease) => void;
  jest.mocked(refreshCourses).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const screen = await render(<ConnectedCourseCatalogScreen />);
  await waitFor(() => expect(refreshCourses).toHaveBeenCalled());
  await fireEvent(screen.getByText('bundled:hours-only'), 'touchStart');
  await act(async () => { finish({ ...builtinCourseRelease, payload: { ...builtinCourseRelease.payload, hero: { ...builtinCourseRelease.payload.hero, title: 'remote' } } }); });
  expect(screen.getByText('bundled:hours-only')).toBeTruthy();
});
