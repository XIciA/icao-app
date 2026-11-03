import { render } from '@testing-library/react-native';
import { View } from 'react-native';
import { Download } from '@/components/ui/icons';
import { colors } from '@/theme';
import { DownloadPackageCard } from '../DownloadPackageCard.native';
import { downloadStatusColors, downloadStatusTone } from '../download-status-colors';

it.each([
  ['已下载', colors.successForeground], ['未下载', colors.mutedForeground], ['可扩展', colors.mutedForeground],
  ['准备中', colors.accent], ['已暂停', colors.accent], ['等待网络', colors.accent], ['等待 Wi-Fi', colors.accent],
  ['稍后重试', colors.accent], ['校验失败', colors.destructive], ['保存失败', colors.destructive],
])('renders %s in the correct semantic color without adding a separate feedback row', async (status, color) => {
  const screen = await render(<DownloadPackageCard title="听力" icon={<View />} open={false} toggle={jest.fn()} status={status}
    completed={status === '已下载'} progress={0} size="1 MB" scope="all" scopes={[{ value: 'all', label: '全部', shortLabel: '全部' }]}
    rangeLocked={false} onScope={jest.fn()} action={Download} actionLabel="下载" onAction={jest.fn()} canDelete={false} onDelete={jest.fn()} />);
  expect(screen.getAllByText(status)).toHaveLength(1);
  expect(screen.getByText(status)).toHaveStyle({ color });
});

it('distinguishes update checks, real failures and unknown status text without making every new label red', () => {
  expect(downloadStatusTone('3 项有更新')).toBe('waiting');
  expect(downloadStatusTone('检查中')).toBe('waiting');
  expect(downloadStatusTone('已是最新')).toBe('success');
  expect(downloadStatusTone('已下载项为最新')).toBe('success');
  expect(downloadStatusTone('有未完成下载')).toBe('waiting');
  expect(downloadStatusTone('部分检查失败')).toBe('error');
  expect(downloadStatusTone('恢复中')).toBe('neutral');
  expect(downloadStatusColors('校验失败')).not.toEqual(downloadStatusColors('已暂停'));
});
