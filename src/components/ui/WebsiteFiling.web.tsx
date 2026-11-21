import { colors, fonts, spacing, type as typography } from '@/theme';

export function WebsiteFiling() {
  return (
    <footer style={{ paddingTop: spacing[6], textAlign: 'center' }}>
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: colors.mutedForeground,
          fontFamily: fonts.sansRegular,
          fontSize: typography.micro.fontSize,
          lineHeight: `${typography.micro.lineHeight}px`,
          display: 'inline-block',
          padding: spacing[2],
          textDecoration: 'none',
        }}
      >
        蜀ICP备2026045996号-2
      </a>
    </footer>
  );
}
