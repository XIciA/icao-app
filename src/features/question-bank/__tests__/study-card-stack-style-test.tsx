import { render } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';

import { colors, radii } from '@/theme';

import { StudyCardStack } from '../components/StudyCardStack';

describe('study card stack material', () => {
  it('uses the same white, bordered card material for audio, transcript, and workbench', async () => {
    const screen = await render(
      <StudyCardStack
        onCollapse={jest.fn()}
        onReveal={jest.fn()}
        primary={<View />}
        revealed
        transcript={<View />}
        workbench={<View />}
      />,
    );

    for (const testID of ['study-card-primary', 'study-card-transcript', 'study-card-workbench']) {
      expect(StyleSheet.flatten(screen.getByTestId(testID).props.style)).toMatchObject({
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: radii.xxl,
        borderWidth: 1,
      });
    }
  });
});
