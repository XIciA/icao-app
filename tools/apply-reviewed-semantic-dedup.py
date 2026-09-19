#!/usr/bin/env python3
"""Apply the reviewed v14 semantic groups once; default to a validated dry run."""
import argparse
import copy
import hashlib
import importlib.util
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECORD = 'docs/records/workstreams/question-bank-study-scopes-20260920'


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tools' / file)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


merge = module('scope_merge', 'merge-study-scope-content.py')
apply = module('scope_apply', 'apply-study-scope-proposal.py')


def card_hash(card):
    return hashlib.sha256(json.dumps(card, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def prepare(review):
    if review['schemaVersion'] != 2 or review['status'] != 'complete_bounded_candidate_review':
        raise ValueError('Only the complete reviewed groups can be applied')
    banks = merge.banks_from_sources()
    old_files, _ = apply.split_banks(banks)
    cards = {card['id']: card for bank in banks for _, _, card in merge.all_cards(bank)}
    topics = {topic['id']: topic for bank in banks for cat in bank['categories'] for topic in cat['topics']}
    contracts = (ROOT / 'packages/contracts/src/index.ts').read_text()
    free = set(re.findall(r"'([^']+)'", contracts.split('const FREE_LISTENING_CARD_IDS = new Set([')[1].split(']);')[0]))
    aliases, removed_topics, changed, replacements = {}, set(), set(), {}
    # Validate the entire input before any mutation. A second invocation fails closed.
    for group in review['approvedMerges']:
        if group['module'] == 'listening':
            for item in group['inputCards']:
                if item['id'] not in cards or card_hash(cards[item['id']]) != item['sha256']:
                    raise ValueError(f'Reviewed card changed: {item["id"]}')
            source_id = group['keepContentCardId']
            ids = [source_id, *group['removeCardIds']]
            free_ids = free.intersection(ids)
            if len(free_ids) > 1:
                raise ValueError('A merge would collapse two independently configured free slots')
            # Preserve the already published free identity, using the source's whole
            # payload (including option order and answer), not the old answer index.
            keep = next(iter(free_ids), source_id)
            replacements[source_id] = keep
            changed.add(keep)
            for identity in ids:
                if identity != keep:
                    if identity in aliases:
                        raise ValueError('Duplicate removal')
                    aliases[identity] = keep
        else:
            expected_removed = {card['id'] for topic_id in group['removeTopicIds'] for card in topics[topic_id]['cards']}
            if expected_removed != {item['removeCardId'] for item in group['cardMapping']}:
                raise ValueError('Partial scenario removal is forbidden')
            if {item['keepCardId'] for item in group['cardMapping']} != {card['id'] for card in topics[group['keepContentTopicId']]['cards']}:
                raise ValueError('Every complete retained scenario instruction must be mapped')
            for item in group['inputFiles']:
                if apply.digest((ROOT / item['path']).read_bytes()) != item['sha256']:
                    raise ValueError(f'Reviewed scenario changed: {item["path"]}')
            removed_topics.update(group['removeTopicIds'])
            for item in group['cardMapping']:
                if card_hash(cards[item['removeCardId']]) != item['removeCardSha256'] or card_hash(cards[item['keepCardId']]) != item['keepCardSha256']:
                    raise ValueError('Reviewed scenario card changed')
                if item['removeCardId'] in aliases:
                    raise ValueError('Duplicate scenario removal')
                aliases[item['removeCardId']] = item['keepCardId']
    if set(aliases).intersection(aliases.values()):
        raise ValueError('Conflicting or transitive removal')
    for group in review['approvedMerges']:
        if group['module'] == 'listening':
            source_id = group['keepContentCardId']
            source = cards[source_id]
            source['id'] = replacements[source_id]
            source['studyTier'] = group['studyTierAfterMerge']
        else:
            topics[group['keepContentTopicId']]['studyTier'] = group['studyTierAfterMerge']
    for bank in banks:
        for cat in bank['categories']:
            cat['topics'] = [topic for topic in cat['topics'] if topic['id'] not in removed_topics]
            for topic in cat['topics']:
                # A preserved free ID may now occur on both the old and preferred
                # object; retain the preferred object at the source category.
                topic['cards'] = [card for card in topic['cards'] if card['id'] not in aliases and
                                  not any(card is cards[keep] and keep != source for source, keep in replacements.items())]
    for correction in review['contentCorrections']:
        identity = correction['cardId']
        card = cards[identity]
        if card[correction['field']] != correction['before']:
            raise ValueError(f'Correction source changed: {identity}')
        card[correction['field']] = correction['after']
        changed.add(card['id'])
    # Keep the reviewed core set where possible and replenish only slots lost to
    # duplicate collapse. Scoring drills remain outside the 30 complete scenes.
    additions = []
    for bank in banks:
        if bank['id'] not in ('listening', 'radiotelephony'):
            continue
        if bank['id'] == 'listening':
            groups = [[(card['id'], card.get('audioText', ''), topic['id'], card) for card in topic['cards']]
                      for cat in bank['categories'] for topic in cat['topics']]
            target = 25
        else:
            groups = [[(topic['id'], '\n'.join(c.get('audioText', '') for c in topic['cards']), cat['id'], topic)
                       for cat in bank['categories'] for topic in cat['topics'] if topic.get('practiceKind') != 'scoring-points']]
            target = 30
        for candidates in groups:
            selected = [item for item in candidates if item[3].get('studyTier', 0) == 2]
            if len(selected) > target:
                raise ValueError('Merge unexpectedly increased crash selection')
            pool = [item for item in candidates if item[3].get('studyTier', 0) == 1 and item[0] not in merge.CRASH_REVIEW_EXCLUSIONS]
            fill = merge.balanced_foundations(pool, target - len(selected))
            if len(fill) + len(selected) != target:
                raise ValueError('Insufficient curated questions to replenish the agreed crash size')
            for identity, text, category, item in fill:
                item['studyTier'] = 2
                additions.append({'bank': bank['id'], 'id': identity, 'group': category, 'text': text, 'themes': merge.foundation_tags(text)})
    counts = {}
    for bank in banks:
        for cat in bank['categories']:
            for topic in cat['topics']:
                topic['declaredCardCount'] = len(topic['cards'])
            cat['declaredTopicCount'] = len(cat['topics'])
            cat['declaredCardCount'] = sum(t['declaredCardCount'] for t in cat['topics'])
        bank['declaredTopicCount'] = sum(c['declaredTopicCount'] for c in bank['categories'])
        bank['declaredCardCount'] = sum(c['declaredCardCount'] for c in bank['categories'])
        bank['summary'] = f'{bank["declaredTopicCount"]} {bank["topicUnit"]} / {bank["declaredCardCount"]} {bank["cardUnit"]}'
        counts[bank['id']] = {scope: sum(topic.get('studyTier', card.get('studyTier', 2 if bank['id'] == 'sentences900' else 0)) >= tier
                                      for _, topic, card in merge.all_cards(bank)) for scope, tier in [('all', 0), ('selected', 1), ('crash', 2)]}
    files, locations = apply.split_banks(banks)
    if not free.issubset({card for bank, card in locations if bank == 'listening'}):
        raise ValueError('Free access identity was lost')
    report = {'merged': [{'cardId': identity} for identity in changed], 'removed': list(aliases)}
    ledger, decisions, evidence = apply.migrate_audit(ROOT, old_files, files, locations, report, aliases)
    # Explicit corrections are part of the new audit, even when an older field
    # correction was superseded by the preferred source.
    for correction in review['contentCorrections']:
        card_id = replacements.get(correction['cardId'], correction['cardId'])
        bank_id = 'radiotelephony' if card_id.startswith('radiotelephony') else 'listening'
        file, index, category_id, topic_id = locations[(bank_id, card_id)]
        ledger['corrections'].append({
            **{key: correction[key] for key in ['before', 'after', 'reason']},
            'file': file, 'pointer': f'/cards/{index}/{correction["field"]}', 'field': correction['field'],
            'bankId': bank_id, 'categoryId': category_id, 'topicId': topic_id, 'cardId': card_id,
            'beforeSha256': apply.digest(correction['before'].encode()),
        })
    files[f'{apply.AUDIT}/corrections.json'] = ledger
    files[f'{apply.AUDIT}/review-decisions.json'] = decisions
    evidence.update({'counts': counts, 'aliases': aliases, 'removedTopics': sorted(removed_topics), 'freeIdsPreserved': sorted(free), 'crashReplenishment': additions,
                     'historyPolicy': 'User explicitly authorized resetting learning/history in the first complete v14 publish transaction; no historical answer-index migration.'})
    files[f'{RECORD}/semantic-dedup-application.json'] = evidence
    return files, sorted(set(old_files) - set(files)), evidence


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--review', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    files, deletions, evidence = prepare(apply.read(args.review))
    print(json.dumps({'writes': len(files), 'deletions': len(deletions), 'counts': evidence['counts'], 'crashReplenishment': len(evidence['crashReplenishment'])}, ensure_ascii=False))
    if args.apply:
        for relative, value in files.items():
            merge.write(ROOT / relative, value)
        for relative in deletions:
            (ROOT / relative).unlink()
        print('Reviewed semantic deduplication applied to canonical v14.')
