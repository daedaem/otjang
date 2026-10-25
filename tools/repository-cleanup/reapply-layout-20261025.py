#!/usr/bin/env python3
"""Reapply PR63's location-only delta to CURRENT master contents.
No checkout/cherry-pick/apply/merge; only read git objects, then os.rename current files.
Run by the parent only, after review: python3 tools/repository-cleanup/reapply-layout-20261025.py REPO --apply
Documentation is intentionally excluded and must be freshly written against current facts.
"""
from pathlib import Path
import argparse, collections, difflib, hashlib, json, os, posixpath, re, subprocess

p = argparse.ArgumentParser()
p.add_argument('repo', type=Path)
p.add_argument('--apply', action='store_true')
a = p.parse_args()
root = a.repo.resolve()
def git(*args): return subprocess.check_output(['git', '-C', str(root), *args])
def obj(ref, file): return git('show', f'{ref}:{file}')
rows = [r.split('\t') for r in git('diff', '--name-status', '-M', 'origin/pr62..origin/pr63').decode().splitlines()]
tracked = git('ls-files', '-z').decode().split('\0')[:-1]
# Newly recovered, not-yet-committed tests are also CURRENT source, not old PR files.
tracked += [str(f.relative_to(root)) for f in (root/'app/lite/checks').glob('*.check.mjs') if str(f.relative_to(root)) not in tracked]
# Old PR's move MAP is a location specification, never its file contents.
moves = {r[1]: r[2] for r in rows if r[0].startswith('R')}
# Preserve newly added master assets too (not present when PR63 was written).
for file in tracked:
    if file not in moves and file.startswith('app/mockups/'):
        moves[file] = 'docs/design/mockups/' + file[len('app/mockups/'):]
# Generated artifacts have a dedicated build output, not a copied old bundle.
deleted = {r[1] for r in rows if r[0] == 'D'}
assert deleted == {'app/mockups/ux10/shared/eoul-mock.js', 'app/mockups/ux10v2/shared/eoul-mock.js'}
for file in deleted: moves.pop(file, None)

original = {f: (root/f).read_bytes() for f in tracked if (root/f).is_file()}
updates = {}
skipped = []
# Apply each tiny added/deleted location hunk to CURRENT contents. No #66 logic is
# loaded from an older commit. Fail closed on unexpected context or multiplicity.
for row in rows:
    status, old, new = row[0], row[1], row[-1]
    if not (status.startswith('R') or status == 'M'):
        continue
    if old.startswith('docs/') or new.endswith(('.png', '.jpg')):
        continue
    if old == 'app/public/sw.js':
        # Runtime dist URL, not a source-file relative import. PR63 changed this
        # incorrectly: the legacy build already copies icons into dist/icons.
        skipped.append({'file': old, 'reason': 'keep runtime ./icons URLs'})
        continue
    before = obj('origin/pr62', old).decode()
    after = obj('origin/pr63', new).decode()
    if before == after:
        continue
    current = original[old].decode()
    left, right = before.splitlines(True), after.splitlines(True)
    opcodes = difflib.SequenceMatcher(None, left, right, autojunk=False).get_opcodes()
    for tag, i, j, k, l in opcodes:
        if tag == 'equal': continue
        old_chunk, new_chunk = ''.join(left[i:j]), ''.join(right[k:l])
        if old_chunk:
            n = current.count(old_chunk)
            if n >= 1 and n <= before.count(old_chunk):
                current = current.replace(old_chunk, new_chunk, 1)
            elif n == 0 and old == 'app/lite/checks/backup-client.check.mjs' and old_chunk == "import { createMock } from '../../mockups/ux10v2/src/core.mjs';\n":
                # #66 deliberately removed this import. Do not reintroduce it.
                skipped.append({'file': old, 'reason': '#66 removed obsolete createMock import'})
            elif n == 0 and new_chunk and new_chunk in current:
                skipped.append({'file': old, 'reason': 'specific layout hunk already present'})
            else:
                raise SystemExit(f'Unmatched/multiple layout hunk: {old} {i}:{j} count={n}')
        else:
            # Insertion anchor is neighboring CURRENT context; never a whole file.
            prev = ''.join(left[max(0, i-1):i])
            nxt = ''.join(left[i:i+1])
            anchor = prev + nxt
            if anchor and current.count(anchor) == 1:
                current = current.replace(anchor, prev + new_chunk + nxt, 1)
            elif i == len(left) and prev and current.count(prev) == 1:
                current = current.replace(prev, prev + new_chunk, 1)
            else:
                raise SystemExit(f'Unmatched insertion anchor: {old} at {i}')
    updates[old] = current.encode()

# Cover imports introduced AFTER PR63 too, e.g. #66 rank.js -> query.js.
# Resolve each original static import in its original location, then rewrite only
# that import specifier relative to the new source location. Never rewrite runtime URLs.
for old, raw in original.items():
    if not old.endswith(('.js', '.mjs', '.ts', '.tsx', '.jsx')):
        continue
    source = raw.decode()
    current = updates.get(old, raw).decode()
    new = moves.get(old, old)
    for match in re.finditer(r"(?:from\s+|import\s+|new URL\(\s*)(['\"])(\.[^'\"]+)\1", source):
        quote, specifier = match.group(1), match.group(2)
        target = posixpath.normpath(posixpath.join(posixpath.dirname(old), specifier))
        if target not in moves:
            continue
        changed = posixpath.relpath(moves[target], posixpath.dirname(new))
        if not changed.startswith('.'):
            changed = './' + changed
        current = current.replace(match.group(0), match.group(0).replace(quote+specifier+quote, quote+changed+quote))
    if current.encode() != raw:
        updates[old] = current.encode()

# Verify #66's important source bodies remain EXACT, except location references.
# Dev MIME correction must be entirely unchanged.
checks = {}
rank = 'app/lite/functions/api/rank.js'
rank_expected = original[rank].decode().replace("'../../../src/data/products.js'", "'../../src/domain/data/products.js'").replace("'../../../src/data/slots.js'", "'../../src/domain/data/slots.js'").replace("'../../../src/query.js'", "'../../src/domain/query.js'")
assert updates[rank].decode() == rank_expected
checks[rank] = 'only 3 domain import paths changed (including #66 query import)'
core = 'app/mockups/ux10v2/src/core.mjs'
core_expected = original[core].decode().replace("'../../../src/", "'./domain/")
assert updates[core].decode() == core_expected
checks[core] = 'only domain import prefix changed'
screen = 'app/mockups/ux10v2/links/d12-hang.html'
assert updates[screen].decode() == original[screen].decode().replace('shared/eoul-mock.js', 'shared/core-bundle.js')
checks[screen] = 'only core script asset name changed; BK and budget consult preserved'
backup = 'app/lite/checks/backup-client.check.mjs'
assert updates[backup].decode() == original[backup].decode().replace('../../mockups/ux10v2/links/d12-hang.html', '../src/screen.html')
checks[backup] = 'only screen URL changed; all #66 tests preserved'
assert 'app/lite/dev.mjs' not in updates
checks['app/lite/dev.mjs'] = 'byte-identical'
# Shared domain modules must retain latest query parsing and return logic.
for old, new in moves.items():
    if new.startswith('app/lite/src/domain/'):
        assert old not in updates, f'Unexpected shared domain content modification: {old}'
checks['app/src/query.js'] = 'byte-identical current #66 source, moved only'
builder = 'app/mockups/ux10v2/tools/build-core.mjs'
boot_line = next(x for x in original[builder].decode().splitlines() if x.startswith('const bootChange ='))
assert boot_line in updates[builder].decode()
checks[builder] = '#66 bootChange preserved; only layout/build wrapper changed'

test_counts = {}
for file, raw in original.items():
    if file.endswith(('.test.mjs', '.check.mjs', '.spec.ts')):
        count = len(re.findall(rb'(?m)^\s*(?:test|it)\s*\(', raw))
        assert count == len(re.findall(rb'(?m)^\s*(?:test|it)\s*\(', updates.get(file, raw))), f'Test count changed in {file}'
        test_counts[moves.get(file, file)] = count

for old, new in moves.items():
    assert old in original, f'Missing source file: {old}'
    assert not (root/new).exists(), f'Destination already exists: {new}'
manifest = {
    'head': git('rev-parse', 'HEAD').decode().strip(),
    'mode': 'apply' if a.apply else 'dry-run',
    'moves': moves, 'generated_deletions': sorted(deleted),
    'content_updates': sorted(updates), 'skipped': skipped, 'preservation_checks': checks,
    'test_declaration_counts': test_counts,
    'source_sha256': {f: hashlib.sha256(b).hexdigest() for f,b in original.items() if f in moves or f in updates or f in deleted},
}
if a.apply:
    for old, new in moves.items():
        (root/new).parent.mkdir(parents=True, exist_ok=True)
        os.rename(root/old, root/new)
    for old, data in updates.items():
        (root/moves.get(old, old)).write_bytes(data)
    for file in deleted:
        (root/file).unlink()
    # Empty tracked-source directories only; no recursive deletion of ignored or private data.
    for folder in sorted({(root/f).parent for f in moves}, key=lambda x: len(x.parts), reverse=True):
        try: folder.rmdir()
        except OSError: pass
    manifest['result_sha256'] = {moves.get(f, f): hashlib.sha256((root/moves.get(f, f)).read_bytes()).hexdigest() for f in original if f in moves or f in updates}
    Path('/tmp/otjang-layout-reapply-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({k:v for k,v in manifest.items() if k not in ['moves','source_sha256','result_sha256','test_declaration_counts']}, ensure_ascii=False, indent=2))
print(f'MOVE {len(moves)} files; UPDATE {len(updates)} files; DELETE {len(deleted)} generated bundles')
