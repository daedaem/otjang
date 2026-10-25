#!/usr/bin/env python3
"""Compare PR #66; --backup-validation permits the approved boundary extension.

The default checks the cleanup-only snapshot. The opt-in mode still requires
identical transaction bodies, with exactly one target-validation guard added.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
BASE = 'c02ea9a2f0b38d7cdb6bcf0fb53c2b649db64839'
results = {}
validation = sys.argv[1:] == ['--backup-validation']
assert not sys.argv[1:] or validation, 'Only --backup-validation is supported'

def original(path):
    return subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{BASE}:{path}']).decode()

def current(path):
    return (ROOT / path).read_text()

def same(label, expected, actual):
    assert expected == actual, f'Canonical logic changed: {label}'
    results[label] = hashlib.sha256(actual.encode()).hexdigest()

def region(text, start, end):
    a = text.index(start)
    return text[a:text.index(end, a)]

same('rank: only domain import paths may change',
     original('app/lite/functions/api/rank.js').replace("'../../../src/", "'../../src/domain/"),
     current('app/lite/functions/api/rank.js'))
same('core: only domain import paths may change',
     original('app/mockups/ux10v2/src/core.mjs').replace("'../../../src/", "'./domain/"),
     current('app/lite/src/core.mjs'))
for path in ['query.js', 'purchase-journey.js', 'related-returns.js']:
    same(f'domain/{path}', original(f'app/src/{path}'), current(f'app/lite/src/domain/{path}'))
same('dev MIME', original('app/lite/dev.mjs'), current('app/lite/dev.mjs'))
backup_expected = original('app/lite/checks/backup-client.check.mjs').replace('../../mockups/ux10v2/links/d12-hang.html', '../src/screen.html')
backup_actual = current('app/lite/checks/backup-client.check.mjs')
if validation:
    # The old drafts and opaque consult filler were invalid according to the
    # actual readers. Preserve all existing failure assertions, use valid inputs,
    # and require the added assertion that proves the storage fault was reached.
    added_assertion = "  assert.equal(a.sets, 3, 'NEXT 저장·대상 쓰기 실패·보상 쓰기까지 실행해야 한다');\n"
    assert backup_actual.count(added_assertion) == 1
    approved = [
        ('// A normal editable v1 draft needs the same fields as the actual input reader.\n', ''),
        ("JSON.stringify({ v: 1, step: 0, updatedAt: '2026-10-25T00:00:00Z', values: { draftId: 'draft-abcdefgh', brand: '', name: '', kind: '', color: '', url: '' } })", """'{"v":1}'"""),
        ("JSON.stringify({ threads: [{ id: 't-second', turns: [{ role: 'assistant', text: 'x'.repeat(50), ids: [] }] }], cur: 't-second' })", "'x'.repeat(50)"),
        (added_assertion, ''),
    ]
    for added, baseline in approved:
        assert backup_actual.count(added) == 1, 'Unexpected backup fixture/assertion change'
        backup_actual = backup_actual.replace(added, baseline)
same('canonical backup assertions: only approved fixture/counter extensions', backup_expected, backup_actual)
same('canonical budget tests: only domain URL may change',
     original('app/lite/checks/rank.check.mjs').replace('../../src/data/products.js', '../src/domain/data/products.js'),
     current('app/lite/checks/rank.check.mjs'))
before = original('app/mockups/ux10v2/links/d12-hang.html')
after = current('app/lite/src/screen.html')
if validation:
    same('BK keys and snapshot', region(before, '    APP:', '    make()'), region(after, '    APP:', '    make()'))
    same('BK removable and apply compensation', region(before, '    removable:', '    restore(data) {'), region(after, '    removable:', '    restore(data) {'))
    guard = '      BK.validate(data); // Only the incoming target, before any NEXT/STASH write.\n'
    assert after.count(guard) == 1
    same('BK STASH/NEXT restore: only one target validation guard', region(before, '    restore(data) {', '    stash() {'), region(after, '    restore(data) {', '    stash() {').replace(guard, ''))
    same('BK stash and undo', region(before, '    stash() {', '  };\n'), region(after, '    stash() {', '  };\n'))
for label, start, end in [
    ('BK restore and undo', '  const BK = {', '  function backupSheet('),
    ('consultation and budget', '  const RULES = ', '  function render('),
    ('return and purchase flow', '  function returnSheet(', '  function toggleHang('),
]:
    if validation and label == 'BK restore and undo':
        continue
    expected = region(before, start, end)
    if label == 'return and purchase flow':
        # This broad region also contains the common input-entry dispatcher.
        # Permit that one host-state substitution; protect every other byte.
        expected = expected.replace("{ S.reg = null; K.go('reg', { q: t.dataset.regQ || '' }); }",
                                    "{ Input.reset(); K.go('reg', { q: t.dataset.regQ || '' }); }")
    same(label, expected, region(after, start, end))
builder_before = original('app/mockups/ux10v2/tools/build-core.mjs')
builder_after = current('app/lite/tools/build-core.mjs')
same('generated core bootstrap', region(builder_before, 'const bootChange =', '})();'),
     region(builder_after, 'const bootChange =', '})();'))
print(json.dumps({'base': BASE, 'checks': results, 'passed': len(results)}, ensure_ascii=False, indent=2))
