import importlib.util,json,unittest,tempfile,hashlib
from unittest.mock import patch
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('build',ROOT/'tools/build.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
class BuildTests(unittest.TestCase):
 def test_artifact_has_no_models_core_backend_keys_or_symlinks(self):
  result=b.build('/live2d_models/');self.assertFalse(result['coreIncluded']);self.assertFalse(result['legacyAssetsIncluded'])
  self.assertLess(result['bytes'],1024**3)
  for p in (ROOT/'dist').rglob('*'):
   self.assertFalse(p.is_symlink());self.assertNotIn(p.suffix,['.moc','.moc3','.py']);self.assertNotIn('live2dcubismcore',p.name)
  models=json.loads((ROOT/'dist/catalog/models.json').read_text())['models'];self.assertEqual(len(models),61);self.assertTrue(all(m['previewAvailable'] is False for m in models))
 def test_subpath_csp_404_and_deployment_gate(self):
  b.build('/nested/repository/');fallback=(ROOT/'dist/404.html').read_text();self.assertIn('/nested/repository/studio/',fallback)
  html=(ROOT/'dist/studio/index.html').read_text();self.assertIn('Content-Security-Policy',html);self.assertNotIn('unsafe-inline',html)
  self.assertIn('src="./app.js"',html);self.assertNotIn('/api/',(ROOT/'dist/studio/app.js').read_text())
  with self.assertRaises(ValueError):b.build('/live2d_models/',True,ROOT)
  with self.assertRaises(ValueError):b.build('/../bad/')
 def test_additive_build_preserves_source_and_excludes_frozen_bytes(self):
  with tempfile.TemporaryDirectory() as directory:
   source=Path(directory);data=b'unchanged existing root';(source/'index.html').write_bytes(data)
   baseline={'files':[{'path':'index.html','sha256':hashlib.sha256(data).hexdigest()}]}
   with patch.object(b,'BASELINE',baseline):
    result=b.build('/live2d_models/',source=source,site_addition=True)
    self.assertEqual(result['mode'],'existing-site-addition')
    self.assertFalse(result['coreIncluded']);self.assertFalse(result['legacyAssetsIncluded'])
    self.assertTrue(json.loads((ROOT/'dist/v2/runtime.json').read_text())['available'])
    self.assertFalse((ROOT/'dist/index.html').exists());self.assertFalse((ROOT/'dist/assets').exists())
    self.assertEqual((source/'index.html').read_bytes(),data)
    (source/'index.html').write_bytes(b'changed')
    with self.assertRaisesRegex(ValueError,'冻结来源'):b.build(source=source,site_addition=True)
