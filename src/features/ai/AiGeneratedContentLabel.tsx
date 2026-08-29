import { AI_GENERATED_CONTENT_LABEL } from '@icao/contracts';
import { View } from 'react-native';

import { Tag } from '@/components/ui';

export function AiGeneratedContentLabel() {
  return (
    <View
      accessibilityLabel={AI_GENERATED_CONTENT_LABEL}
      accessibilityRole="text"
      accessible
      testID="ai-generated-content-label"
    >
      <Tag tone="accent">{AI_GENERATED_CONTENT_LABEL}</Tag>
    </View>
  );
}
