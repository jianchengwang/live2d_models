"""Read-only catalog inspection and bounded, data-only ZIP validation. No dependencies."""
from __future__ import annotations
import hashlib, io, json, posixpath, re, stat, struct, zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import quote, unquote

ROOT = Path(__file__).resolve().parents[1]
MAX_UPLOAD = 64 * 1024 * 1024
MAX_EXPANDED = 256 * 1024 * 1024
MAX_FILES = 1000
ALLOWED = {'.json', '.moc3', '.png', '.jpg', '.jpeg', '.wav', '.txt'}

class ValidationError(ValueError): pass

def sha(data): return hashlib.sha256(data).hexdigest()

def safe_name(name):
    if not isinstance(name, str) or not name or len(name) > 500:
        raise ValidationError('无效或过长的文件路径')
    decoded = name
    for _ in range(4):
        new = unquote(decoded)
        if new == decoded: break
        decoded = new
    if decoded != name or '\\' in name or ':' in name or any(ord(c) < 32 for c in name):
        raise ValidationError('拒绝编码、反斜杠、驱动器或控制字符路径')
    parts = name.rstrip('/').split('/')
    if name.startswith('/') or any(p in ('', '.', '..') for p in parts):
        raise ValidationError('拒绝绝对路径或路径穿越')
    return '/'.join(parts)

def resolve_ref(entry, ref):
    safe_name(ref)
    return posixpath.join(posixpath.dirname(entry), ref)

def model_refs(data, fmt):
    """Return references and exact motion/expression identifiers, never guessed semantics."""
    refs, motions, expressions = [], [], []
    if fmt == 'moc3':
        fr = data.get('FileReferences')
        if not isinstance(fr, dict): raise ValidationError('model3 缺少 FileReferences')
        if not isinstance(fr.get('Moc'), str) or not fr['Moc'].endswith('.moc3'):
            raise ValidationError('Moc 必须指向 .moc3')
        textures = fr.get('Textures')
        if not isinstance(textures, list) or not textures or not all(isinstance(x, str) for x in textures):
            raise ValidationError('Textures 必须为非空路径数组')
        refs += [('moc', fr['Moc'])] + [('texture', t) for t in textures]
        for key in ('Physics', 'Pose', 'DisplayInfo', 'UserData'):
            if fr.get(key): refs.append((key.lower(), fr[key]))
        groups = fr.get('Motions', {})
        if not isinstance(groups, dict): raise ValidationError('Motions 必须是动作组对象')
        for group, items in groups.items():
            if not isinstance(items, list): raise ValidationError('动作组必须为数组')
            for index, item in enumerate(items):
                if not isinstance(item, dict) or not isinstance(item.get('File'), str):
                    raise ValidationError('动作缺少 File')
                motions.append({'group': group, 'index': index, 'file': item['File'],
                                'label': PurePosixPath(item['File']).name.removesuffix('.motion3.json')})
                refs.append(('motion', item['File']))
                if item.get('Sound'): refs.append(('sound', item['Sound']))
        exp = fr.get('Expressions', [])
        if not isinstance(exp, list): raise ValidationError('Expressions 必须是 Name/File 数组')
        for item in exp:
            if not isinstance(item, dict) or not isinstance(item.get('Name'), str) or not isinstance(item.get('File'), str):
                raise ValidationError('表情缺少 Name/File')
            expressions.append({'name': item['Name'], 'file': item['File']})
            refs.append(('expression', item['File']))
    else:
        refs += [('moc', data.get('model', ''))]
        refs += [('texture', t) for t in data.get('textures', [])]
        for key in ('physics', 'pose'):
            if data.get(key): refs.append((key, data[key]))
        for group, items in data.get('motions', {}).items():
            for index, item in enumerate(items):
                motions.append({'group': group, 'index': index, 'file': item['file'], 'label': item['file']})
                refs.append(('motion', item['file']))
        for item in data.get('expressions', []):
            expressions.append({'name': item['name'], 'file': item['file']})
            refs.append(('expression', item['file']))
    return refs, motions, expressions

def inspect_model(entry, files, *, local_import=False, license_claim=None):
    raw = files[entry]
    if len(raw) > 4 * 1024 * 1024: raise ValidationError('模型配置 JSON 超过 4 MiB')
    data = json.loads(raw.decode('utf-8-sig'))
    if not isinstance(data, dict): raise ValidationError('模型配置必须是 JSON 对象')
    fmt = 'moc3' if entry.endswith('.model3.json') else 'moc'
    refs, motions, expressions = model_refs(data, fmt)
    issues, inventory = [], []
    if fmt == 'moc3' and data.get('Version') != 3:
        issues.append({'severity': 'error', 'message': 'model3 Version 应为 3'})
    if fmt == 'moc3' and 'Expressions' in data:
        issues.append({'severity': 'warning', 'message': '根级 Expressions 不被标准 loader 读取'})
    for kind, ref in refs:
        try: path = resolve_ref(entry, ref)
        except ValidationError as e:
            issues.append({'severity': 'error', 'message': f'{kind}: {e} ({ref})'})
            continue
        if path not in files:
            issues.append({'severity': 'error', 'message': f'缺少 {kind}: {ref}', 'file': ref})
            continue
        content = files[path]
        inventory.append({'kind': kind, 'path': path, 'url': '/' + quote(path, safe='/'),
                          'bytes': len(content), 'sha256': sha(content)})
        if kind == 'moc' and fmt == 'moc3':
            if len(content) < 64 or content[:4] != b'MOC3':
                issues.append({'severity': 'error', 'message': 'MOC3 文件头或长度无效'})
        if kind == 'texture' and content[:8] == b'\x89PNG\r\n\x1a\n':
            if len(content) < 24:
                issues.append({'severity': 'error', 'message': 'PNG 头不完整'})
            else:
                w, h = struct.unpack('>II', content[16:24])
                if not w or not h or w > 8192 or h > 8192:
                    issues.append({'severity': 'error', 'message': '纹理尺寸超出 8192 上限'})
                elif w & (w - 1) or h & (h - 1):
                    issues.append({'severity': 'warning', 'message': '旧 renderer 的 mipmap 路径不支持非二次幂纹理'})
        if ref.endswith('.json'):
            if len(content) > 4 * 1024 * 1024:
                issues.append({'severity':'error','message':f'依赖 JSON 超过 4 MiB: {ref}'})
                continue
            try: json.loads(content.decode('utf-8-sig'))
            except (ValueError, UnicodeError, RecursionError):
                issues.append({'severity': 'error', 'message': f'依赖 JSON 无效: {ref}'})
    groups = data.get('Groups', []) if fmt == 'moc3' else []
    if not isinstance(groups, list): raise ValidationError('Groups 必须是数组')
    for group in groups:
        if not isinstance(group, dict) or not isinstance(group.get('Ids', []), list) or not all(isinstance(x, str) for x in group.get('Ids', [])):
            raise ValidationError('参数组必须包含字符串 Ids 数组')
    lip = [i for g in groups if isinstance(g, dict) and g.get('Name') == 'LipSync' for i in g.get('Ids', [])]
    blink = [i for g in groups if isinstance(g, dict) and g.get('Name') == 'EyeBlink' for i in g.get('Ids', [])]
    params = []
    for f in inventory:
        if f['kind'] == 'displayinfo':
            cdi = json.loads(files[f['path']].decode('utf-8-sig'))
            params = [{'id': p.get('Id'), 'name': p.get('Name')} for p in cdi.get('Parameters', []) if isinstance(p, dict)]
    inventory = list({f['path']:f for f in inventory}.values())
    name = PurePosixPath(entry).parent.name or PurePosixPath(entry).name.removesuffix('.model3.json').removesuffix('.json')
    restricted = name == 'huohuo' and not local_import
    license_info = {'status': 'restricted' if restricted else 'unknown',
                    'evidence': ['assets/model/moc3/huohuo/instructions-使用说明.txt'] if restricted else ['README.md'] if not local_import else [],
                    'note': '包内声明禁止二次分发及获利直播' if restricted else '未核实逐模型授权；仅用于本地预览',
                    'userClaim': license_claim, 'redistributionAllowed': False}
    return {'id': ('import-' if local_import else 'legacy-') + sha(entry.encode())[:12],
            'name': name, 'entryPath': entry, 'entryUrl': '/' + quote(entry, safe='/'),
            'entrySha256': sha(raw), 'format': fmt, 'motions': motions, 'expressions': expressions,
            'lipSyncIds': lip, 'eyeBlinkIds': blink, 'parameters': params, 'files': inventory,
            'issues': issues, 'license': license_info, 'localImport': local_import,
            'source': {'type': 'user-local-import' if local_import else 'frozen-repository',
                       'evidence': [] if local_import else ['README.md:425', 'README.md:405']},
            'validation': {'referencesComplete': not any(i['severity'] == 'error' for i in issues),
                           'coreAcceptance': 'pending', 'note': '文件头检查不能证明二进制有效；需 Cubism Core 加载验收'}}

def build_catalog(root=ROOT):
    paths = sorted((root / 'assets/model').rglob('*'))
    # Read only data. Never execute repository tooling or mutate resources.
    files = {p.relative_to(root).as_posix(): p.read_bytes() for p in paths if p.is_file() and not p.is_symlink()}
    models = []
    for entry in files:
        if entry.endswith('.model3.json') or PurePosixPath(entry).name == 'model.json':
            try: models.append(inspect_model(entry, files))
            except (ValueError, KeyError, TypeError) as e:
                models.append({'id': 'invalid-' + sha(entry.encode())[:12], 'name': PurePosixPath(entry).parent.name,
                               'entryUrl': '/' + quote(entry, safe='/'), 'format': 'unknown',
                               'issues': [{'severity': 'error', 'message': str(e)}], 'motions': [], 'expressions': [],
                               'license': {'status': 'unknown', 'redistributionAllowed': False}, 'files': [],
                               'validation': {'referencesComplete': False, 'coreAcceptance': 'pending'}})
    return {'schemaVersion': 1, 'sourceCommit': json.loads((root/'catalog/frozen-files.json').read_text())['sourceCommit'],
            'models': models}

def validate_zip(payload):
    if len(payload) > MAX_UPLOAD: raise ValidationError('ZIP 超过 64 MiB')
    try: archive = zipfile.ZipFile(io.BytesIO(payload))
    except zipfile.BadZipFile as e: raise ValidationError('不是有效 ZIP') from e
    with archive:
        entries = archive.infolist()
        if not entries or len(entries) > MAX_FILES: raise ValidationError('条目数量需为 1–1000')
        total, seen, data = 0, set(), {}
        for info in entries:
            safe_name(info.orig_filename)
            name = safe_name(info.filename)
            key = name.casefold()
            if key in seen: raise ValidationError('重复或大小写冲突路径')
            seen.add(key)
            mode = info.external_attr >> 16
            if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
                raise ValidationError('拒绝符号链接及特殊文件')
            if info.flag_bits & 1: raise ValidationError('拒绝加密 ZIP')
            if info.is_dir(): continue
            if PurePosixPath(name).suffix.lower() not in ALLOWED:
                raise ValidationError('仅允许模型数据文件；禁止脚本和可执行文件')
            if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                raise ValidationError('仅支持 Stored / Deflate')
            total += info.file_size
            if total > MAX_EXPANDED or info.file_size > MAX_UPLOAD:
                raise ValidationError('解压大小超限')
            if info.file_size > max(1, info.compress_size) * 200:
                raise ValidationError('异常压缩比')
            try:
                with archive.open(info) as f: content = f.read(min(info.file_size + 1, MAX_UPLOAD + 1))
            except (zipfile.BadZipFile, OSError, EOFError) as e: raise ValidationError('ZIP 数据或 CRC 无效') from e
            if len(content) != info.file_size: raise ValidationError('条目长度不一致')
            data[name] = content
        entries = [p for p in data if p.endswith('.model3.json')]
        if len(entries) != 1: raise ValidationError('首轮导入要求 ZIP 恰好含一个 model3.json')
        try: model = inspect_model(entries[0], data, local_import=True)
        except (ValueError, KeyError, TypeError, AttributeError, UnicodeError, RecursionError) as e: raise ValidationError(str(e)) from e
        errors = [i['message'] for i in model['issues'] if i['severity'] == 'error']
        if errors: raise ValidationError('；'.join(errors))
        # Serve only entry + referenced files after validation, not unrelated archive content.
        reachable = {entries[0]} | {f['path'] for f in model['files']}
        return model, {p: data[p] for p in reachable}

def validate_homepage_update(baseline, homepage_update):
    """Allow one recorded homepage revision without rebasing any frozen bytes."""
    original = next((f for f in baseline['files'] if f['path'] == 'index.html'), None)
    if (homepage_update.get('schemaVersion') != 1 or
            homepage_update.get('path') != 'index.html' or original is None or
            homepage_update.get('baselineSourceCommit') != baseline.get('sourceCommit') or
            homepage_update.get('originalSha256') != original['sha256'] or
            homepage_update.get('originalBytes') != original['bytes'] or
            not re.fullmatch(r'[0-9a-f]{64}', str(homepage_update.get('sha256', ''))) or
            type(homepage_update.get('bytes')) is not int or homepage_update['bytes'] <= 0 or
            not homepage_update.get('reason')):
        raise ValueError('无效的首页入口修订记录；冻结基线不得重建')

def verify_baseline(root, baseline, homepage_update=None):
    if homepage_update is not None:
        validate_homepage_update(baseline, homepage_update)
    mismatches = []
    for f in baseline['files']:
        p = Path(root) / f['path']
        accepted = {(f['bytes'], f['sha256'])}
        if homepage_update is not None and f['path'] == 'index.html':
            accepted.add((homepage_update['bytes'], homepage_update['sha256']))
        if not p.is_file() or p.is_symlink() or (p.stat().st_size, sha(p.read_bytes())) not in accepted:
            mismatches.append(f['path'])
    return mismatches

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    if args.verify:
        baseline = json.loads((ROOT/'catalog/frozen-files.json').read_text())
        homepage_update = json.loads((ROOT/'catalog/homepage-entry.json').read_text())
        failed = verify_baseline(args.root, baseline, homepage_update)
        print(json.dumps({'checked': len(baseline['files']), 'changed': failed}, ensure_ascii=False))
        raise SystemExit(bool(failed))
    (ROOT/'catalog/models.json').write_text(json.dumps(build_catalog(), ensure_ascii=False, indent=2)+'\n')
