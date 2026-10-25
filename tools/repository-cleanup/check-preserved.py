#!/usr/bin/env python3
"""Compare the PR #66 canonical logic with the relocated working tree."""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BASE = 'c02ea9a2f0b38d7cdb6bcf0fb53c2b649db64839'
results = {}

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
same('canonical backup tests: only screen URL may change',
     original('app/lite/checks/backup-client.check.mjs').replace('../../mockups/ux10v2/links/d12-hang.html', '../src/screen.html'),
     current('app/lite/checks/backup-client.check.mjs'))
same('canonical budget tests: only domain URL may change',
     original('app/lite/checks/rank.check.mjs').replace('../../src/data/products.js', '../src/domain/data/products.js'),
     current('app/lite/checks/rank.check.mjs'))
before = original('app/mockups/ux10v2/links/d12-hang.html')
after = current('app/lite/src/screen.html')
for label, start, end in [
    ('BK restore and undo', '  const BK = {', '  function backupSheet('),
    ('consultation and budget', '  const RULES = ', '  function render('),
    ('return and purchase flow', '  function returnSheet(', '  function toggleHang('),
]:
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
