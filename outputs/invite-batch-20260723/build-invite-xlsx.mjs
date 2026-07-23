import fs from 'node:fs/promises';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const rows = (await fs.readFile('/tmp/icao-invite-batch-keep.tsv', 'utf8'))
  .trim().split('\n').map((line) => line.split('\t'));
if (rows.length !== 50 || rows.some(([name, code]) => !name || !code)) throw new Error('expected_50_invites');
const workbook = Workbook.create();
const sheet = workbook.worksheets.add('邀请码');
sheet.showGridLines = false;
sheet.getRange('A1:E1').merge();
sheet.getRange('A1').values = [['飞猪 ICAO · 内测邀请码台账']];
sheet.getRange('A2:E2').values = [['显示名', '完整邀请码', '状态', '创建批次', '发放对象']];
sheet.getRange(`A3:E${rows.length + 2}`).values = rows.map(([name, code]) => [name, code, '未发放', '2026-07-23', '']);
sheet.getRange('A1:E1').format = { fill: '#1E5FD8', font: { bold: true, color: '#FFFFFF', size: 14 }, horizontalAlignment: 'center', verticalAlignment: 'center' };
sheet.getRange('A2:E2').format = { fill: '#EAF1FF', font: { bold: true, color: '#163A72' }, horizontalAlignment: 'center' };
sheet.getRange(`A2:E${rows.length + 2}`).format.borders = { preset: 'all', style: 'thin', color: '#D7E2F5' };
sheet.getRange(`C3:C${rows.length + 2}`).format = { fill: '#FFF7E6', font: { color: '#9A6500' }, horizontalAlignment: 'center' };
sheet.getRange('A:A').format.columnWidth = 14;
sheet.getRange('B:B').format.columnWidth = 27;
sheet.getRange('C:C').format.columnWidth = 12;
sheet.getRange('D:D').format.columnWidth = 14;
sheet.getRange('E:E').format.columnWidth = 20;
sheet.getRange('A1').format.rowHeight = 28;
sheet.freezePanes.freezeRows(2);
const out = '/Users/zhouyide/Desktop/icao-app/outputs/invite-batch-20260723/飞猪ICAO-内测邀请码-2026-07-23.xlsx';
await fs.mkdir('/Users/zhouyide/Desktop/icao-app/outputs/invite-batch-20260723', { recursive: true });
const file = await SpreadsheetFile.exportXlsx(workbook);
await file.save(out);
console.log(out);
