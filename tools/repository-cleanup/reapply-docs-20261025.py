#!/usr/bin/env python3
"""Rebase dated-doc locations and Markdown links from CURRENT checked-out bytes.
Dry-run by default. No old branch blobs/patches/checkouts, no prose replacements.
Review the dry-run first: python3 tools/repository-cleanup/reapply-docs-20261025.py REPO --apply
"""
from pathlib import Path, PurePosixPath
import argparse, collections, datetime, hashlib, json, os, posixpath, re, subprocess
from urllib.parse import unquote, quote

parser = argparse.ArgumentParser()
parser.add_argument('repo', type=Path)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
root = args.repo.resolve()
def git(*a): return subprocess.check_output(['git', '-C', str(root), *a])
tracked = git('ls-files', '-z').decode().split('\0')[:-1]
files = set(tracked)
original = {f: (root/f).read_bytes() for f in tracked if (root/f).is_file()}
current_docs = {'docs/README.md','docs/owner-requirements.md','docs/business-plan.md','docs/development-plan.md','docs/system-handover.md'}
old_to_code = json.loads((root/'tools/repository-cleanup/layout-map.json').read_text())['moves']
code_to_old = {v:k for k,v in old_to_code.items()}
date_re = re.compile(r'(?<!\d)(20\d{2})-?(0[1-9]|1[0-2])-?([0-2]\d|3[01])(?!\d)')
moves = {}
root_non_dated = []
for f in tracked:
    pp = PurePosixPath(f)
    if not f.startswith('docs/') or f in current_docs or f.startswith('docs/log/'):
        continue
    parts = pp.parts
    root_dated = len(parts) == 2 and f.endswith('.md')
    sub_dated = len(parts) > 2 and parts[1] in ('research','validation')
    if not root_dated and not sub_dated:
        continue
    match = date_re.search(pp.name)
    if not match and sub_dated:
        match = date_re.search('/'.join(parts[2:-1]))
    if not match:
        if root_dated: root_non_dated.append(f)
        continue
    year, month, day = match.groups()
    datetime.date(int(year), int(month), int(day))
    tail = pp.name if root_dated else '/'.join(parts[1:])
    moves[f] = f'docs/log/{year}-{month}/{tail}'
assert all(not (root/new).exists() for new in moves.values()), 'An archive destination already exists'
assert len(set(moves.values())) == len(moves), 'Colliding archive destinations'

# All file/dir existence checks use tracked material, matching what GitHub receives;
# ignored private files must not accidentally make a documentation link look valid.
def tree_paths(file_paths):
    result = set(file_paths)
    for f in file_paths:
        for parent in PurePosixPath(f).parents:
            result.add(str(parent))
    return result
before_paths = tree_paths(files)
after_paths = tree_paths({moves.get(f,f) for f in files})

# Return masked ranges for fenced or inline code. Their contents are immutable.
def code_ranges(text):
    spans=[]; offset=0; fence=None; start=0
    for line in text.splitlines(True):
        m=re.match(r'^\s*(?:>\s*)?(`{3,}|~{3,})', line)
        if fence is None:
            if m:
                fence=m.group(1); start=offset
        elif m and m.group(1)[0] == fence[0] and len(m.group(1)) >= len(fence):
            spans.append((start, offset+len(line))); fence=None
        offset+=len(line)
    if fence is not None: spans.append((start,len(text)))
    protected=sorted(spans); cursor=0
    for begin,end in list(protected)+[(len(text),len(text))]:
        section=text[cursor:begin]
        for m in re.finditer(r'`+', section):
            a=cursor+m.start()
            if any(s <= a < e for s,e in spans): continue
            marks=m.group(0); end_tick=text.find(marks,a+len(marks),begin)
            if end_tick >= 0:
                spans.append((a,end_tick+len(marks)))
        cursor=end
    # Merge overlapping ranges (inline code can be observed at each ending mark).
    result=[]
    for a,b in sorted(spans):
        if result and a <= result[-1][1]: result[-1]=(result[-1][0],max(b,result[-1][1]))
        else: result.append((a,b))
    return result

def escaped(text,pos):
    n=0; pos-=1
    while pos >= 0 and text[pos] == '\\': n+=1; pos-=1
    return bool(n%2)

def destinations(text):
    """Yield only Markdown link destinations, never image/URL/code contents.
    Supports inline nested labels, balanced parentheses, angle destinations and
    reference definitions. Fragment strings are kept as opaque original bytes.
    """
    mask=code_ranges(text)
    def protected(i): return any(a <= i < b for a,b in mask)
    def read_dest(i):
        while i < len(text) and text[i] in ' \t\r\n': i+=1
        if i >= len(text): return None
        if text[i] == '<':
            j=i+1
            while j < len(text) and not (text[j] == '>' and not escaped(text,j)): j+=1
            return (i+1,j) if j < len(text) else None
        start=i; depth=0
        while i < len(text):
            c=text[i]
            if escaped(text,i): i+=1; continue
            if c == '(': depth+=1
            elif c == ')':
                if depth == 0: break
                depth-=1
            elif c.isspace() and depth == 0: break
            i+=1
        return (start,i) if i > start else None
    found=[]; i=0
    while i < len(text):
        if text[i] != '[' or escaped(text,i) or protected(i): i+=1; continue
        # Images are deliberately immutable, including destination and label.
        image=i>0 and text[i-1] == '!' and not escaped(text,i-1)
        depth=1; j=i+1
        while j < len(text) and depth:
            if not escaped(text,j):
                if text[j] == '[': depth+=1
                elif text[j] == ']': depth-=1
            j+=1
        if depth: i+=1; continue
        k=j
        if k < len(text) and text[k] == '(':
            dest=read_dest(k+1)
            if dest and not image: found.append(dest)
            # Skip nested brackets inside this recognized label.
            i=max(j,dest[1] if dest else j); continue
        # A reference destination is parsed only at a line's optional indentation.
        if k < len(text) and text[k] == ':' and not image:
            line_start=text.rfind('\n',0,i)+1
            if text[line_start:i].strip() == '':
                dest=read_dest(k+1)
                if dest: found.append(dest)
        i=j
    return sorted(set(found))

schemes=re.compile(r'^[A-Za-z][A-Za-z0-9+.-]*:')
def target_parts(raw):
    if not raw or raw.startswith(('#','/','//')) or schemes.match(raw): return None
    cut=min([raw.find(c) for c in ['?','#'] if c in raw]+[len(raw)])
    path,suffix=raw[:cut],raw[cut:]
    if not path: return None
    # Markdown path escapes do not change the linked file's path.
    decoded=unquote(re.sub(r'\\([\\ ()\[\]])',r'\1',path))
    # Preserve local-file line suffixes (file.mjs:12) if they occur.
    line=''; m=re.search(r':\d+(?::\d+)?$',decoded)
    if m: line=decoded[m.start():]; decoded=decoded[:m.start()]
    return decoded,suffix,line

def resolve(file,path): return posixpath.normpath(posixpath.join(posixpath.dirname(file),path))
def moved_target(path):
    # Exact target first. Directory mapping is allowed only when the repository's
    # code map proves a single uniform directory relocation.
    if path in moves: return moves[path]
    if path in old_to_code: return old_to_code[path]
    if path not in before_paths:
        descendants=[(a,b) for a,b in old_to_code.items() if a.startswith(path.rstrip('/')+'/')]
        if descendants:
            prefix=path.rstrip('/')+'/'
            candidates={b[:-len(a[len(prefix):])].rstrip('/') for a,b in descendants if b.endswith(a[len(prefix):])}
            if len(candidates)==1 and len(descendants)==sum(1 for a,b in descendants if b.endswith(a[len(prefix):])):
                return candidates.pop()
    return path

def current_target(source,path):
    original_target=resolve(source,path)
    target=moved_target(original_target)
    target=moves.get(target,target)
    # Some README files were moved in B without rebasing their old relative links.
    # Only if the current resolution is missing, retry its documented pre-B origin.
    if target not in after_paths and source in code_to_old:
        before_layout=resolve(code_to_old[source],path)
        candidate=moved_target(before_layout)
        candidate=moves.get(candidate,candidate)
        if candidate in after_paths: return candidate
    return target

def spell_path(path,raw):
    # Existing percent encoding style is retained. Korean/plain ASCII paths stay
    # human-readable; mandatory Markdown path characters are safely escaped.
    if re.search(r'%[0-9A-Fa-f]{2}',raw): return quote(path,safe='/._-~@+')
    return path.replace('\\','\\\\').replace('(','\\(').replace(')','\\)').replace(' ','%20')

rewritten={}; changes=[]; baseline_missing=[]; repaired_missing=[]; remaining_missing=[]; new_missing=[]
all_links=0; local_links=0; non_file_ids=set()
for source,raw in original.items():
    if not source.lower().endswith('.md'): continue
    text=raw.decode(); dests=destinations(text); replacements=[]
    for ordinal,(start,end) in enumerate(dests):
        all_links+=1
        dest=text[start:end]; parsed=target_parts(dest)
        if parsed is None: continue
        local_links+=1
        path,suffix,line=parsed
        old_target=resolve(source,path)
        target=current_target(source,path)
        was_missing=old_target not in before_paths
        will_missing=target not in after_paths
        non_file=(was_missing and will_missing and '/' not in dest and not re.search(r'\.[A-Za-z0-9]{1,8}(?:[?#:]|$)',dest))
        if non_file: non_file_ids.add((source,ordinal))
        info={'source':source,'ordinal':ordinal,'destination':dest,'resolved':old_target,'new_source':moves.get(source,source),'new_resolved':target}
        if was_missing: baseline_missing.append(info)
        if was_missing and not will_missing: repaired_missing.append(info)
        if will_missing:
            if was_missing: remaining_missing.append(info)
            else: new_missing.append(info)
        new_source=moves.get(source,source)
        rel=posixpath.relpath(target,posixpath.dirname(new_source))
        if path.endswith('/') and not rel.endswith('/'): rel+='/'
        # Preserve a same-location destination byte-for-byte if no relocation is needed.
        changed=spell_path(rel,dest)+line+suffix
        if non_file or (old_target==target and new_source==source): changed=dest
        if changed != dest:
            replacements.append((start,end,changed))
            changes.append({**info,'new_destination':changed})
    result=text
    for start,end,new_dest in reversed(replacements): result=result[:start]+new_dest+result[end:]
    # External URLs in the public design-reference ledger and all other documents
    # must remain byte-identical; only local Markdown destinations are changed.
    external=lambda t: re.findall(r'(?:https?|mailto):[^\s<>\]"\']+',t)
    assert external(text)==external(result), f'External URL changed: {source}'
    fence_contents=lambda t: [t[a:b] for a,b in code_ranges(t)]
    assert fence_contents(text)==fence_contents(result), f'Code block/inline code changed: {source}'
    # Parsing the result must resolve each rewritten local destination as intended.
    post_dests=destinations(result)
    assert len(dests)==len(post_dests), f'Markdown link count changed: {source}'
    for ordinal,(start,end) in enumerate(post_dests):
        dest=result[start:end]; parsed=target_parts(dest)
        if parsed is None: continue
        path,suffix,line=parsed
        target=resolve(moves.get(source,source),path)
        prior=text[dests[ordinal][0]:dests[ordinal][1]]
        if (source,ordinal) in non_file_ids:
            assert dest==prior, f'Non-file reference notation changed: {source}'
            continue
        oldpath=target_parts(prior)[0]
        expected=current_target(source,oldpath)
        assert target==expected, f'Link target changed unexpectedly: {source}: {prior} -> {dest}'
    if result != text: rewritten[source]=result.encode()

assert not new_missing, 'Newly broken links: '+json.dumps(new_missing,ensure_ascii=False)
assert all(f in original for f in current_docs), 'Missing a current canonical document'
non_file_references=[x for x in remaining_missing if '/' not in x['destination'] and not re.search(r'\.[A-Za-z0-9]{1,8}(?:[?#:]|$)',x['destination'])]
report={
    'head':git('rev-parse','HEAD').decode().strip(), 'mode':'apply' if args.apply else 'dry-run',
    'dated_root_moves':sum(f.count('/')==1 for f in moves), 'subdirectory_moves':sum(f.count('/')>1 for f in moves),
    'moves':moves,'root_non_dated_except_current':root_non_dated,
    'markdown_files_scanned':sum(f.lower().endswith('.md') for f in original),'markdown_files_changed':sorted(rewritten),
    'links_parsed':all_links,'local_links':local_links,'relative_destinations_rewritten':len(changes),
    'baseline_missing':baseline_missing,'repaired_missing':repaired_missing,'remaining_baseline_missing':remaining_missing,'new_missing':new_missing,
    'non_file_reference_candidates':non_file_references,
    'remaining_file_missing':[x for x in remaining_missing if x not in non_file_references],
    'changes':changes,
    'original_sha256':{f:hashlib.sha256(raw).hexdigest() for f,raw in original.items() if f in moves or f in rewritten or f in current_docs},
    'current_doc_rule':'current five canonical prose preserved; only local Markdown link destinations rewritten',
}
# Writing /tmp reports is safe in both modes. Source writes occur only with --apply.
Path('/tmp/otjang-docs-reapply-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
Path('/tmp/otjang-docs-map.json').write_text(json.dumps({'base':report['head'],'moves':moves},ensure_ascii=False,indent=2)+'\n')
if args.apply:
    for f,raw in original.items():
        assert (root/f).read_bytes()==raw, f'Concurrent modification detected: {f}'
    for old,new in moves.items():
        (root/new).parent.mkdir(parents=True,exist_ok=True); os.rename(root/old,root/new)
    for old,data in rewritten.items(): (root/moves.get(old,old)).write_bytes(data)
    for folder in sorted({(root/f).parent for f in moves},key=lambda p:len(p.parts),reverse=True):
        try: folder.rmdir()
        except OSError: pass
summary={k:v for k,v in report.items() if k not in ['moves','changes','original_sha256','markdown_files_changed','baseline_missing','repaired_missing','remaining_baseline_missing','new_missing','non_file_reference_candidates','remaining_file_missing']}
summary.update({'total_moves':len(moves),'markdown_files_changed':len(rewritten),'baseline_missing':len(baseline_missing),'repaired_missing':len(repaired_missing),'remaining_baseline_missing':len(remaining_missing),'new_missing':len(new_missing),'remaining_file_missing':len(report['remaining_file_missing']),'non_file_reference_candidates':len(non_file_references)})
print(json.dumps(summary,ensure_ascii=False,indent=2))
