#!/usr/bin/env python3
"""Apply one fully captured and reviewed study-scope proposal to canonical files.

Default is a dry run. This never writes a database, publishes media or deploys an
app. Existing text-review evidence follows stable card IDs; superseded wording
is archived explicitly and the new canonical text must pass the normal audit.
"""
import argparse
import copy
import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = 'content/question-banks'
AUDIT = 'docs/records/workstreams/question-bank-text-quality-audit/artifacts'
RECORD = 'docs/records/workstreams/question-bank-study-scopes-20260920'
ARTIFACTS = {'proposal.json', 'resources.json', 'media-files.json', 'id-alias-review.json', 'crash-selection-review.json'}


def read(path):
    return json.loads(Path(path).read_text())


def digest(body):
    return hashlib.sha256(body).hexdigest()


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def under(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError(f'Path escapes root: {relative}')
    return path


def value_at(value, pointer):
    try:
        for part in pointer.split('/')[1:]:
            part = part.replace('~1', '/').replace('~0', '~')
            value = value[int(part)] if isinstance(value, list) else value[part]
        return value
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def split_banks(banks):
    files, locations, all_ids = {}, {}, set()
    for bank in copy.deepcopy(banks):
        bank_id = bank['id']
        categories = bank.pop('categories')
        bank['categoryIds'] = [item['id'] for item in categories]
        bank_path = f'{CONTENT}/banks/{bank_id}'
        files[f'{bank_path}/bank.json'] = bank
        for category in categories:
            topics = category.pop('topics')
            category['topicIds'] = [item['id'] for item in topics]
            files[f'{bank_path}/categories/{category["id"]}.json'] = category
            for topic in topics:
                topic['categoryId'] = category['id']
                path = f'{bank_path}/topics/{topic["id"]}.json'
                files[path] = topic
                for index, card in enumerate(topic['cards']):
                    if card['id'] in all_ids:
                        raise ValueError(f'Duplicate canonical card: {card["id"]}')
                    all_ids.add(card['id'])
                    locations[(bank_id, card['id'])] = (path, index, category['id'], topic['id'])
    return files, locations


def verify_proposal(root, proposal):
    report = read(proposal / 'merge-report.json')
    if report.get('publishable') is not True or report.get('warnings') or report.get('sourceCoverageErrors'):
        raise ValueError('Proposal is incomplete or has unresolved warnings')
    baseline = report.get('baselineFiles', {})
    if f'{CONTENT}/registry.json' not in baseline or len(baseline) < 10:
        raise ValueError('Proposal has no complete canonical baseline')
    for relative, checksum in baseline.items():
        path = under(root, relative)
        if not path.is_file() or digest(path.read_bytes()) != checksum:
            raise ValueError(f'Canonical baseline changed; regenerate proposal: {relative}')
    if set(report.get('artifactChecksums', {})) != ARTIFACTS:
        raise ValueError('Proposal artifact manifest is incomplete')
    for name, checksum in report['artifactChecksums'].items():
        if digest((proposal / name).read_bytes()) != checksum:
            raise ValueError(f'Proposal changed after generation: {name}')
    return report


def relocate_entry(entry, old_files, new_files, locations):
    """Resolve using card identity; indices are only a pointer into that card."""
    old_file = old_files.get(entry['file'])
    if old_file is None:
        raise ValueError(f'Missing historical audit source: {entry["file"]}')
    pointer = entry['pointer']
    match = re.fullmatch(r'/cards/(\d+)(/.*)', pointer)
    if match:
        card = old_file['cards'][int(match[1])]
        if entry.get('cardId') and card['id'] != entry['cardId']:
            raise ValueError('Historical audit pointer does not match its card ID')
        location = locations.get((entry['bankId'], card['id']))
        if not location:
            return None
        file, index, category_id, topic_id = location
        return {**entry, 'file': file, 'pointer': f'/cards/{index}{match[2]}',
                'categoryId': category_id, 'topicId': topic_id, 'cardId': card['id']}
    return copy.deepcopy(entry) if entry['file'] in new_files else None


def migrate_audit(root, old_files, new_files, locations, report, aliases):
    ledger = read(root / AUDIT / 'corrections.json')
    decisions = read(root / AUDIT / 'review-decisions.json')
    changed_cards = {item['cardId'] for item in report['merged'] if item.get('cardId')}
    changed_topics = {item['topicId'] for item in report['merged'] if item.get('topicId')}
    deleted = set(report['removed']) | set(aliases)
    evidence = {'schemaVersion': 1, 'supersededCorrections': [], 'supersededDecisions': [], 'relocatedCorrections': 0}

    def why(entry, moved):
        if moved is None and (entry.get('cardId') in deleted or entry['file'] not in new_files):
            return 'Question removed or merged in this reviewed content replacement'
        if entry.get('cardId') in changed_cards or entry.get('topicId') in changed_topics:
            return 'Canonical payload replaced by the preferred captured source'
        raise ValueError(f'Unexplained text change in historical audit: {entry["file"]}#{entry["pointer"]}')

    retained = []
    for entry in ledger['corrections']:
        moved = relocate_entry(entry, old_files, new_files, locations)
        previous = value_at(old_files[entry['file']], entry['pointer'])
        current = value_at(new_files[moved['file']], moved['pointer']) if moved else None
        if moved and previous == current:
            retained.append(moved)
            evidence['relocatedCorrections'] += int((entry['file'], entry['pointer']) != (moved['file'], moved['pointer']))
        else:
            evidence['supersededCorrections'].append({'historicalCorrection': entry, 'reason': why(entry, moved),
                                                     'previousCanonicalValue': previous, 'replacementValue': current,
                                                     'replacementLocator': {key: moved[key] for key in ['file', 'pointer', 'cardId'] if key in moved} if moved else None})
    ledger['corrections'] = retained
    next_decisions = []
    for decision in decisions['decisions']:
        file, pointer, rule = decision['key'].split('#')
        bank_id = file.split('/banks/')[1].split('/')[0]
        old_topic = old_files[file]
        entry = {'file': file, 'pointer': pointer, 'bankId': bank_id, 'topicId': old_topic.get('id')}
        if re.match(r'/cards/\d+/', pointer):
            entry['cardId'] = old_topic['cards'][int(pointer.split('/')[2])]['id']
        moved = relocate_entry(entry, old_files, new_files, locations)
        current = value_at(new_files[moved['file']], moved['pointer']) if moved else None
        if isinstance(current, str) and digest(current.encode()) == decision['textSha256']:
            next_decisions.append({**decision, 'key': f'{moved["file"]}#{moved["pointer"]}#{rule}'})
        else:
            evidence['supersededDecisions'].append({'historicalDecision': decision, 'reason': why(entry, moved), 'replacementValue': current})
    decisions['decisions'] = next_decisions
    return ledger, decisions, evidence


def prepare(root, proposal):
    report = verify_proposal(root, proposal)
    registry = read(root / CONTENT / 'registry.json')
    if registry['releaseVersion'] != 13:
        raise ValueError('This one-time migration requires the reviewed version 13 baseline')
    banks = read(proposal / 'proposal.json')
    if [bank['id'] for bank in banks] != registry['bankIds']:
        raise ValueError('Proposal bank identities differ from registry')
    files, locations = split_banks(banks)
    old_files = {path: read(root / path) for path in report['baselineFiles'] if '/banks/' in path}
    aliases = read(proposal / 'id-alias-review.json')
    ledger, decisions, evidence = migrate_audit(root, old_files, files, locations, report, aliases)
    registry['releaseVersion'] = 14
    registry['releasedAt'] = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    resources = read(proposal / 'resources.json')
    resources['version'] = read(root / CONTENT / 'resources/manifest.source.json')['version'] + 1
    resources_by_path = {item['publicPath']: item for item in resources['files']}
    copies = []
    for public_path, item in read(proposal / 'media-files.json').items():
        resource = resources_by_path[public_path]
        source = Path(item['source']).resolve()
        target = under(root / CONTENT / 'resources/files', item['sourceRelativePath'])
        if not source.is_file() or source.stat().st_size != resource['sizeBytes'] or digest(source.read_bytes()) != resource['checksum']:
            raise ValueError(f'Media source drift: {public_path}')
        if target.exists() and digest(target.read_bytes()) != resource['checksum']:
            raise ValueError(f'Refusing to overwrite different media: {target}')
        copies.append((source, target))
    # Hotspot references use the same canonical identity after deduplication.
    hotspots = read(root / CONTENT / 'opi-hotspots.json')
    for brief in hotspots['briefs']:
        for topic in brief['topics']:
            resolved = []
            for card_id in topic['cardIds']:
                seen = set()
                while card_id in aliases:
                    if card_id in seen:
                        raise ValueError('Cyclic canonical alias')
                    seen.add(card_id)
                    card_id = aliases[card_id]
                if ('opi', card_id) not in locations:
                    raise ValueError(f'Hotspot refers to a missing question: {card_id}')
                if card_id not in resolved:
                    resolved.append(card_id)
            topic['cardIds'] = resolved
    files.update({f'{CONTENT}/registry.json': registry, f'{CONTENT}/resources/manifest.source.json': resources,
                  f'{CONTENT}/opi-hotspots.json': hotspots, f'{AUDIT}/corrections.json': ledger,
                  f'{AUDIT}/review-decisions.json': decisions, f'{RECORD}/text-audit-migration.json': evidence})
    deletions = sorted(set(old_files) - set(files))
    return files, deletions, copies, evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--proposal', type=Path, default=ROOT / '.generated/study-scope-content-proposal')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    files, deletions, copies, evidence = prepare(ROOT, args.proposal)
    plan = {'writes': sorted(files), 'deletes': deletions, 'mediaCopies': len(copies),
            'supersededCorrections': len(evidence['supersededCorrections']),
            'relocatedCorrections': evidence['relocatedCorrections']}
    (args.proposal / 'apply-plan.json').write_bytes(encode(plan))
    if args.apply:
        # All paths, hashes and historical identities are preflighted before any
        # canonical write. Git retains the entire source baseline for rollback.
        for source, target in copies:
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                shutil.copyfile(source, target)
        for relative, value in files.items():
            path = under(ROOT, relative)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(encode(value))
        for relative in deletions:
            under(ROOT, relative).unlink()
    print(json.dumps({'applied': args.apply, **{key: len(value) if isinstance(value, list) else value for key, value in plan.items()}}))


if __name__ == '__main__':
    main()
