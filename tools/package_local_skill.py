"""Build the reviewed, dependency-free skill ZIP deterministically. No downloads."""
from pathlib import Path
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'skills/live2d-local'
DEST=ROOT/'skills/live2d-local-skill-0.2.0.zip'
def build():
    provenance=json.loads((SOURCE/'PROVENANCE.json').read_text())
    writer=(SOURCE/'vendor/experimental-moc3/moc3writer.js').read_bytes()
    if hashlib.sha256(writer).hexdigest()!=provenance['writerSHA256']:raise ValueError('Pinned writer mismatch')
    files={}
    for p in sorted(SOURCE.rglob('*')):
        if p.is_symlink():raise ValueError('Symlink in package')
        if not p.is_file():continue
        relative=p.relative_to(SOURCE).as_posix()
        if p.suffix not in {'.js','.mjs','.json','.md','.txt','.png','.MIT'} and p.name!='LICENSE':raise ValueError('Unreviewed package file: '+relative)
        if any(part.startswith('.') or part=='node_modules' for part in p.relative_to(SOURCE).parts):raise ValueError('Hidden/dependency input')
        data=p.read_bytes()
        if p.suffix!='.png':
            text=data.decode('utf-8')
            if any(s in text for s in ['/Users/mini/','Sentinel_','jianchengwang.github.io','libfile_','sk-proj-','private-basic-actions']):raise ValueError('Private evidence or host destination in package')
        files['live2d-local/'+relative]=data
    if sum(map(len,files.values()))>64*1024*1024:raise ValueError('Package too large')
    manifest=''.join(hashlib.sha256(data).hexdigest()+'  '+name+'\n' for name,data in files.items())
    files['live2d-local/MANIFEST.sha256']=manifest.encode()
    with zipfile.ZipFile(DEST,'w',compression=zipfile.ZIP_STORED) as z:
        for name,data in files.items():
            info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.external_attr=0o100644<<16;info.create_system=3;z.writestr(info,data)
    digest=hashlib.sha256(DEST.read_bytes()).hexdigest();DEST.with_suffix('.zip.sha256').write_text(digest+'  '+DEST.name+'\n')
    print(json.dumps({'path':str(DEST),'sha256':digest,'bytes':DEST.stat().st_size,'files':len(files),'coreIncluded':False}))
    return DEST
if __name__=='__main__':build()
