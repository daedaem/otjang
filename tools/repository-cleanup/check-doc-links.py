#!/usr/bin/env python3
"""Read-only internal Markdown destination and GitHub heading-fragment audit."""
import ast
from collections import Counter
import html
import json
from pathlib import Path
import posixpath
import re
import subprocess
import sys
import unicodedata
from urllib.parse import unquote

root=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[2]
cli=root/'tools/repository-cleanup/reapply-docs-20261025.py'
parsed=ast.parse(cli.read_text())
names={'code_ranges','escaped','destinations'}
only=ast.Module(body=[n for n in parsed.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[])
namespace={'re':re}
exec(compile(only,str(cli), 'exec'),namespace)
code_ranges,destinations=namespace['code_ranges'],namespace['destinations']
raw=subprocess.check_output(['git','-C',str(root),'ls-files','--cached','--others','--exclude-standard','-z']).decode()
allfiles={f for f in raw.split('\0') if f and (root/f).is_file()}
files=sorted(f for f in allfiles if f.endswith('.md') and (
    '/' not in f or f.startswith('docs/') or (f.startswith('legacy/') and Path(f).name=='README.md')))
known_nonfiles={'primary','secondary','danger','ghost','disabled','outline','link','button','success','warning','error','loading'}

def non_file_example(source,path):
    if path in known_nonfiles: return True
    # Historical design prose uses bracket/parenthesis notation for control
    # roles and citation section IDs. These were inspected in their source
    # context; they are not intended repository-file destinations.
    if source == 'docs/design/mockups/ux10v2/research/references.md' and re.fullmatch(r'\d+-\d+',path): return True
    if source == 'docs/log/2026-10/redesign-spec-20261017.md' and path in {'44,','텍스트','→','best'}: return True
    if source == 'docs/log/2026-10/team-design-20261017.md' and path == '주': return True
    return False

def slug(text):
    text=re.sub(r'<[^>]+>','',text)
    text=html.unescape(text).strip().lower()
    text=re.sub(r'!?\[([^]]+)\]\([^)]*\)',r'\1',text)
    text=text.replace('`','')
    text=''.join(ch for ch in text if ch in '_-' or ch.isspace() or unicodedata.category(ch)[0] not in 'PS')
    return re.sub(r'\s','-',text)

anchor_cache={}
def anchors(file):
    if file in anchor_cache: return anchor_cache[file]
    text=(root/file).read_text()
    spans=code_ranges(text)
    def protected(i): return any(a<=i<b for a,b in spans)
    result=set(re.findall(r'<(?:a|h[1-6])\b[^>]*\b(?:id|name)=[\"\']([^\"\']+)',text,re.I))
    occurrences=Counter(); offset=0; previous=None
    def add(heading):
        base=slug(heading); count=occurrences[base]; occurrences[base]+=1
        result.add(base+(f'-{count}' if count else ''))
    for line in text.splitlines(keepends=True):
        if not protected(offset):
            m=re.match(r'^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+\s*)?$',line.rstrip('\n'))
            if m: add(m.group(1))
            elif previous and re.match(r'^\s{0,3}(?:=+|-+)\s*$',line): add(previous.strip())
            previous=line if line.strip() else None
        else: previous=None
        offset+=len(line)
    anchor_cache[file]=result
    return result

broken=[]; fragments=[]; nonfiles=[]; checked=0; checked_fragments=0
for source in files:
    text=(root/source).read_text()
    for start,end in destinations(text):
        dest=text[start:end]
        if not dest or dest.startswith(('//','/')) or re.match(r'^[A-Za-z][A-Za-z0-9+.-]*:',dest): continue
        path,symbol,fragment=dest.partition('#')
        path=path.split('?',1)[0]
        path=unquote(re.sub(r'\\([\\ ()\[\]])',r'\1',path))
        path=re.sub(r':\d+(?::\d+)?$','',path)
        target=posixpath.normpath(posixpath.join(posixpath.dirname(source),path)) if path else source
        info={'source':source,'line':text.count('\n',0,start)+1,'destination':dest,'target':target}
        if non_file_example(source,path):
            nonfiles.append(info); continue
        checked+=1
        if not (root/target).exists() or ((root/target).is_file() and target not in allfiles):
            broken.append(info); continue
        if symbol and fragment and target.endswith('.md') and (root/target).is_file():
            if re.fullmatch(r'L\d+(?:-L\d+)?',fragment): continue
            checked_fragments+=1
            fragment=unquote(fragment)
            if fragment not in anchors(target):
                fragments.append({**info,'fragment':fragment,'available':sorted(anchors(target))})
result={'markdown_files':len(files),'checked_internal_destinations':checked,'checked_fragments':checked_fragments,'ignored_ui_examples':len(nonfiles),'broken_files':broken,'broken_fragments':fragments}
print(json.dumps(result,ensure_ascii=False,indent=2))

sys.exit(1 if broken or fragments else 0)
