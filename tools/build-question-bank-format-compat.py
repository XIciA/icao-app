"""Generate exact old-fingerprint/token-run compatibility from the reviewed diff."""
import difflib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPORT = ROOT / 'docs/records/workstreams/question-bank-standardization-20261022'


def fingerprint(text):
    value = 5381
    data = text.encode('utf-16-le')
    for offset in range(0, len(data), 2):
        value = ((value * 33) ^ int.from_bytes(data[offset:offset + 2], 'little')) & 0xffffffff
    alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
    result = ''
    while value:
        result = alphabet[value % 36] + result
        value //= 36
    return result or '0'


def tokens(text):
    return [re.sub(r'[^\w]', '', word).casefold() for word in text.split()]


def main():
    blocks = {}
    for change in json.loads((REPORT / 'text-changes.json').read_text())['changes']:
        field = change['field']
        if field not in ('audioText', 'referenceText') or change.get('hotspotId'):
            continue
        block = 'question' if field == 'audioText' else 'reference'
        key = ':'.join(change[k] for k in ('bankId', 'categoryId', 'topicId', 'cardId')) + ':' + block
        if key in blocks:
            assert blocks[key]['after'] == change['before'], key
            blocks[key]['after'] = change['after']
        else:
            blocks[key] = dict(before=change['before'], after=change['after'])
    revisions = {}
    for key, change in blocks.items():
        before, after = change['before'], change['after']
        runs = [[m.a, m.b, m.size] for m in difflib.SequenceMatcher(None, tokens(before), tokens(after), autojunk=False).get_matching_blocks() if m.size]
        revisions[key + ':' + fingerprint(before)] = dict(fingerprint=fingerprint(after), runs=runs)
    target = ROOT / 'services/api/src/sync/question-bank-format-revisions.ts'
    target.write_text('// Generated from the reviewed 2026-10-22 text changes. No user data.\nexport type FormatRevision = { fingerprint: string; runs: number[][] };\nexport const formatRevisions: Record<string, FormatRevision> = ' + json.dumps(revisions, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('format_compat_generated blocks=' + str(len(revisions)))


if __name__ == '__main__':
    main()
