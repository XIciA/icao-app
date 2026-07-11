import { render } from '@testing-library/react-native';

import Index from '../index';

describe('<Index />', () => {
  it('renders the app identity', async () => {
    const screen = await render(<Index />);

    expect(screen.getByText('飞猪 ICAO')).toBeTruthy();
  });
});
