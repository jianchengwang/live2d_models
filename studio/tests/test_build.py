import importlib.util,json,unittest,tempfile,hashlib
from unittest.mock import patch
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('build',ROOT/'tools/build.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
class BuildTests(unittest.TestCase):
 def test_parent_and_frame_csp_authorize_only_approved_external_core(self):
  import re
  for path in ['studio/index.html','studio/advanced.html','v2/frame.html']:
   html=(ROOT/path).read_text();directive=re.search(r"script-src ([^;]+)",html).group(1).split()
   self.assertIn('https://cubism.live2d.com',directive,path)
   self.assertNotIn('https:',directive,path);self.assertNotIn("'unsafe-inline'",directive,path)
 def test_artifact_has_no_models_core_backend_keys_or_symlinks(self):
  result=b.build('/live2d_models/');self.assertFalse(result['coreIncluded']);self.assertFalse(result['legacyAssetsIncluded'])
  self.assertLess(result['bytes'],1024**3)
  for p in (ROOT/'dist').rglob('*'):
   self.assertFalse(p.is_symlink());self.assertNotIn(p.suffix,['.moc','.moc3','.py']);self.assertNotIn('live2dcubismcore',p.name)
  models=json.loads((ROOT/'dist/catalog/models.json').read_text())['models'];self.assertEqual(len(models),61);self.assertTrue(all(m['previewAvailable'] is False for m in models))
 def test_subpath_csp_404_and_deployment_gate(self):
  b.build('/nested/repository/');fallback=(ROOT/'dist/404.html').read_text();self.assertIn('/nested/repository/studio/',fallback)
  html=(ROOT/'dist/studio/index.html').read_text();self.assertIn('Content-Security-Policy',html);self.assertNotIn('unsafe-inline',html)
  self.assertIn('src="./generator.js"',html);self.assertNotIn('/api/',(ROOT/'dist/studio/generator.js').read_text())
  with self.assertRaises(ValueError):b.build('/live2d_models/',True,ROOT)
  with self.assertRaises(ValueError):b.build('/../bad/')
 def test_additive_build_preserves_source_and_overlays_only_recorded_homepage(self):
  with tempfile.TemporaryDirectory() as directory:
   source=Path(directory);data=b'unchanged existing root';(source/'index.html').write_bytes(data)
   asset=b'frozen model bytes';(source/'assets').mkdir();(source/'assets/model.moc3').write_bytes(asset)
   baseline={'sourceCommit':'fixture','files':[{'path':'index.html','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()},{'path':'assets/model.moc3','bytes':len(asset),'sha256':hashlib.sha256(asset).hexdigest()}]}
   update={**b.HOMEPAGE_UPDATE,'baselineSourceCommit':'fixture','originalSha256':baseline['files'][0]['sha256'],'originalBytes':len(data)}
   with patch.object(b,'BASELINE',baseline),patch.object(b,'HOMEPAGE_UPDATE',update):
    result=b.build('/live2d_models/',source=source,site_addition=True)
    self.assertEqual(result['mode'],'existing-site-addition')
    self.assertFalse(result['coreIncluded']);self.assertFalse(result['legacyAssetsIncluded'])
    self.assertTrue(result['rootPageUpdated'])
    self.assertTrue(json.loads((ROOT/'dist/v2/runtime.json').read_text())['available'])
    self.assertEqual((ROOT/'dist/index.html').read_bytes(),(ROOT/'index.html').read_bytes());self.assertFalse((ROOT/'dist/assets').exists())
    self.assertEqual((source/'index.html').read_bytes(),data)
    self.assertEqual((source/'assets/model.moc3').read_bytes(),asset)
    (source/'index.html').write_bytes((ROOT/'index.html').read_bytes())
    b.build('/nested/repository/',source=source,site_addition=True)
    self.assertIn('href="./studio/"',(ROOT/'dist/index.html').read_text())
    (source/'assets/model.moc3').write_bytes(b'changed model bytes')
    with self.assertRaisesRegex(ValueError,'assets/model.moc3'):b.build(source=source,site_addition=True)
    (source/'assets/model.moc3').write_bytes(asset)
    (source/'index.html').write_bytes(b'changed')
    with self.assertRaisesRegex(ValueError,'冻结来源'):b.build(source=source,site_addition=True)
    (source/'index.html').write_bytes(data)
    with patch.object(b,'HOMEPAGE_UPDATE',{**update,'sha256':'0'*64}):
     with self.assertRaisesRegex(ValueError,'首页入口与修订记录'):b.build(source=source,site_addition=True)
