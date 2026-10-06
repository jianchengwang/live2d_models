import importlib.util, io, json, stat, unittest, zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('tools',ROOT/'catalog/tools.py')
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)

def archive(files, *, mode=None, compression=zipfile.ZIP_STORED):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',compression=compression) as z:
        for name,content in files:
            if mode is not None:
                info=zipfile.ZipInfo(name);info.external_attr=mode<<16;z.writestr(info,content)
            else:z.writestr(name,content)
    return out.getvalue()

def valid_files():
    # Existing frozen package; no generated/fake MOC3 used as an accepted fixture.
    base=ROOT/'assets/model/moc3/yichui_2'
    return [(str(p.relative_to(base)),p.read_bytes()) for p in base.rglob('*') if p.is_file()]

class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog=json.loads((ROOT/'catalog/models.json').read_text())
        cls.files=valid_files()
    def test_all_61_entries_and_formats(self):
        self.assertEqual(len(self.catalog['models']),61)
        self.assertEqual(sum(m['format']=='moc3' for m in self.catalog['models']),47)
    def test_accurate_entry_and_empty_motion_group(self):
        model=next(m for m in self.catalog['models'] if m['name']=='yichui_2')
        self.assertEqual(model['motions'][0]['group'],'')
        self.assertEqual(model['motions'][2]['file'],'motions/mission.motion3.json')
        model=next(m for m in self.catalog['models'] if m['name']=='March 7th')
        self.assertIn('march%207th.model3.json',model['entryUrl'])
        self.assertEqual(len([x for x in model['issues'] if x['severity']=='error']),8)
    def test_license_restrictions_not_overridden_by_mit(self):
        model=next(m for m in self.catalog['models'] if m['name']=='huohuo')
        self.assertEqual(model['license']['status'],'restricted')
        self.assertFalse(model['license']['redistributionAllowed'])
    def test_valid_existing_package(self):
        model,files=t.validate_zip(archive(self.files))
        self.assertTrue(model['validation']['referencesComplete'])
        self.assertEqual(model['validation']['coreAcceptance'],'pending')
        self.assertEqual(model['license']['status'],'unknown')
        self.assertEqual(model['name'],'yichui_2')
        self.assertIn('yichui_2.moc3',files)
    def test_dangerous_names(self):
        for name in ('../escape.moc3','/abs.moc3','C:/evil.moc3','a\\evil.moc3','%2e%2e/evil.moc3','%252e%252e/evil.moc3','a//b.json'):
            with self.subTest(name=name),self.assertRaises(t.ValidationError):t.validate_zip(archive([(name,b'x')]))
    def test_symlink(self):
        with self.assertRaises(t.ValidationError):t.validate_zip(archive([('link.json',b'../../escape')],mode=stat.S_IFLNK|0o777))
    def test_case_collision(self):
        with self.assertRaises(t.ValidationError):t.validate_zip(archive([('A.json',b'{}'),('a.json',b'{}')]))
    def test_script_rejected(self):
        for name in ('run.js','install.sh','a.exe','script.html'):
            with self.subTest(name=name),self.assertRaises(t.ValidationError):t.validate_zip(archive(self.files+[(name,b'anything')]))
    def test_compression_bomb(self):
        with self.assertRaises(t.ValidationError):t.validate_zip(archive([('big.json',b'0'*1048576)],compression=zipfile.ZIP_DEFLATED))
    def test_missing_texture(self):
        with self.assertRaises(t.ValidationError):t.validate_zip(archive([(p,b) for p,b in self.files if not p.endswith('.png')]))
    def test_bad_moc_header_not_accepted(self):
        damaged=[(p,b'not-a-model' if p.endswith('.moc3') else b) for p,b in self.files]
        with self.assertRaises(t.ValidationError):t.validate_zip(archive(damaged))
    def test_external_dependency_and_parent_reference(self):
        for ref in ('https://example.com/model.moc3','../outside.moc3','%2e%2e/outside.moc3'):
            config={'Version':3,'FileReferences':{'Moc':ref,'Textures':['texture.png']}}
            with self.subTest(ref=ref),self.assertRaises(t.ValidationError):
                t.validate_zip(archive([('a.model3.json',json.dumps(config).encode()),('texture.png',b'x')]))
    def test_invalid_schema(self):
        for value in ([],{'Version':3,'FileReferences':[]},{'Version':3,'FileReferences':{'Moc':'a.moc3','Textures':[]}}):
            with self.subTest(value=value),self.assertRaises(t.ValidationError):t.validate_zip(archive([('a.model3.json',json.dumps(value).encode())]))
    def test_multiple_models_refused(self):
        with self.assertRaises(t.ValidationError):t.validate_zip(archive(self.files+[('other.model3.json',b'{}')]))
    def test_no_zip(self):
        with self.assertRaises(t.ValidationError):t.validate_zip(b'not zip')

if __name__=='__main__':unittest.main()
