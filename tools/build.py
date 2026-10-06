"""Dependency-free static artifact. Default never bundles frozen assets or Core."""
import argparse,hashlib,json,re,runpy,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASELINE=json.loads((ROOT/'catalog/frozen-files.json').read_text())
HOMEPAGE_UPDATE=json.loads((ROOT/'catalog/homepage-entry.json').read_text())
verify_baseline=runpy.run_path(str(ROOT/'catalog/tools.py'))['verify_baseline']

def verify_source(source):
    failed=verify_baseline(source,BASELINE,HOMEPAGE_UPDATE)
    if failed:raise ValueError('冻结来源与基线不符: '+', '.join(failed))
    # A historical source may have the original homepage; the overlay must be
    # exactly the recorded, reviewed revision, never an unchecked ROOT copy.
    failed=verify_baseline(ROOT,{'files':[HOMEPAGE_UPDATE]})
    if failed:raise ValueError('首页入口与修订记录不符: '+', '.join(failed))

def build(base='/live2d_models/',release=False,source=None,site_addition=False):
    if not re.fullmatch(r'/(?:[A-Za-z0-9_-]+/)*',base):raise ValueError('base 必须为 / 或 /repository/')
    approval=json.loads((ROOT/'release-approval.json').read_text())
    if site_addition:
        if release:raise ValueError('增量发布不能使用全站复制模式')
        required=['approved','corePublicationApproved','parentConfirmationRecorded']
        if not all(approval.get(k) is True for k in required) or approval.get('repository')!='jianchengwang/live2d_models' or not approval.get('evidence'):
            raise ValueError('工作台增量发布需要已确认的应用许可与用户发布授权')
        if not source:raise ValueError('增量构建需要原站来源以验证旧字节')
        source=Path(source).resolve()
        verify_source(source)
    if release:
        required=['approved','corePublicationApproved','frozenRedistributionApproved','parentConfirmationRecorded']
        if not all(approval.get(k) is True for k in required) or approval.get('repository')!='jianchengwang/live2d_models' or not approval.get('evidence'):
            raise ValueError('发布未批准：需要 Core 适用许可、旧资源逐项再分发权、目标仓库与父线程确认；当前不可公开部署')
        if not source:raise ValueError('保留旧 URL 的 release 必须提供原仓库 source')
        source=Path(source).resolve()
        rights=approval.get('modelRights',{})
        catalog=json.loads((ROOT/'catalog/models.json').read_text())
        if any(not rights.get(m['id'],{}).get('evidence') or rights.get(m['id'],{}).get('redistributionAllowed') is not True for m in catalog['models']):raise ValueError('61 个旧模型的公开权利证据未完成；禁止扩大再分发')
        # Verify every original path before any release copy.
        verify_source(source)
    out=ROOT/'dist'
    if out.exists():shutil.rmtree(out)
    out.mkdir()
    for directory in ['studio','v2']:
        for p in (ROOT/directory).iterdir():
            if p.suffix in {'.html','.css','.js'}:dest=out/p.relative_to(ROOT);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest)
    runtime={'available':bool(release or site_addition),'developmentOnly':False,'existingRuntimeOnly':bool(site_addition)}
    configured_runtime=json.loads((ROOT/'v2/runtime.json').read_text())
    if configured_runtime.get('modernCoreURL'):runtime['existingRuntimeOnly']=False
    for key in ['modernCoreURL','modernCoreIntegrity']:
        if configured_runtime.get(key):runtime[key]=configured_runtime[key]
    (out/'v2/runtime.json').write_text(json.dumps(runtime)+'\n')
    catalog=json.loads((ROOT/'catalog/models.json').read_text())
    if not release and not site_addition:
        for m in catalog['models']:m['previewAvailable']=False
    (out/'catalog').mkdir();(out/'catalog/models.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
    csp="default-src 'self'; script-src 'none'; style-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
    fallback=f'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="{csp}"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url={base}studio/"><title>Model Studio</title><a href="{base}studio/">打开模型工作台</a></html>\n'
    if site_addition:
        shutil.copyfile(ROOT/'index.html',out/'index.html')
        (out/'studio/404.html').write_text(fallback)
    else:
        (out/'index.html').write_text(fallback);(out/'404.html').write_text(fallback);(out/'.nojekyll').touch()
    if release:
        for f in BASELINE['files']:
            dest=out/f['path'];dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source/f['path'],dest)
        # The original baseline is preserved; only the recorded homepage entry
        # replaces an old path. Model bytes, index2 and asset URLs stay frozen.
        shutil.copyfile(ROOT/'index.html',out/'index.html')
    files=[{'path':str(p.relative_to(out)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(out.rglob('*')) if p.is_file()]
    size=sum(f['bytes'] for f in files)
    if size>1024**3:raise ValueError('超过 GitHub Pages 1 GB 站点限制')
    manifest={'mode':'existing-site-addition' if site_addition else 'preserve-existing' if release else 'code-only-unpublished','base':base,'bytes':size,'files':files,'legacyAssetsIncluded':release,'coreIncluded':release,'deploymentApproved':bool(release or site_addition),'existingRuntimeReferenced':site_addition,'rootPageUpdated':bool(release or site_addition)}
    (ROOT/'evidence').mkdir(exist_ok=True);(ROOT/'evidence/artifact-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'artifact':str(out),'mode':manifest['mode'],'files':len(files),'bytes':size,'base':base}))
    return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base',default='/live2d_models/');parser.add_argument('--release',action='store_true');parser.add_argument('--site-addition',action='store_true');parser.add_argument('--source');a=parser.parse_args();build(a.base,a.release,a.source,a.site_addition)
