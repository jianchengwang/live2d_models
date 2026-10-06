import hashlib
import json
import re
import runpy
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[2]
verify_baseline = runpy.run_path(str(ROOT/'catalog/tools.py'))['verify_baseline']


class HomepageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.anchors = []
        self.elements = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.elements.append((tag, attrs))
        if tag == 'a':
            self.anchors.append(attrs)


class HomepageTests(unittest.TestCase):
    def test_visible_studio_link_keeps_project_deployment_base(self):
        html = (ROOT/'index.html').read_text()
        parser = HomepageParser()
        parser.feed(html)
        links = [a for a in parser.anchors if a.get('class') == 'studio-entry']
        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]['href'], './studio/')
        self.assertNotIn('hidden', links[0])
        self.assertIn('打开 Live2D Studio 模型工作台', html)
        self.assertLess(html.index('class="studio-entry"'), html.index('id="charSelect"'))
        self.assertFalse(any(tag == 'base' for tag, _ in parser.elements))
        self.assertFalse(any(tag == 'meta' and attrs.get('http-equiv', '').lower() == 'refresh'
                             for tag, attrs in parser.elements))
        for base in ('/', '/live2d_models/', '/nested/repository/'):
            for page in ('', 'index.html'):
                with self.subTest(base=base, page=page):
                    self.assertEqual(urljoin('https://example.test'+base+page, links[0]['href']),
                                     'https://example.test'+base+'studio/')

    def test_homepage_changes_only_add_studio_navigation(self):
        baseline = json.loads((ROOT/'catalog/frozen-files.json').read_text())
        update = json.loads((ROOT/'catalog/homepage-entry.json').read_text())
        original = next(f for f in baseline['files'] if f['path'] == 'index.html')
        self.assertEqual(original['sha256'], 'b80887e63cd47594e33006ecb4591fb0dfc094634c4c4a27d1d4556f4df8df8a')
        self.assertEqual(update['originalSha256'], original['sha256'])
        current = (ROOT/'index.html').read_bytes()
        self.assertEqual(hashlib.sha256(current).hexdigest(), update['sha256'])
        self.assertEqual(len(current), update['bytes'])
        restored, styles = re.subn(rb'    \.studio-entry \{.*?(?=    \.form-control \{)',
                                   b'', current, count=1, flags=re.DOTALL)
        restored, navs = re.subn(rb'  <nav aria-label="Studio navigation">.*?</nav>\r?\n',
                                 b'', restored, count=1, flags=re.DOTALL)
        self.assertEqual((styles, navs), (1, 1))
        self.assertEqual(len(restored), original['bytes'])
        self.assertEqual(hashlib.sha256(restored).hexdigest(), original['sha256'])

    def test_only_recorded_homepage_revision_is_allowed(self):
        original, revised, asset = b'original root', b'root with studio', b'original asset'
        def record(path, data):
            return {'path': path, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        baseline = {'sourceCommit': 'fixture', 'files': [record('index.html', original), record('model.moc3', asset)]}
        update = {**record('index.html', revised), 'schemaVersion': 1, 'baselineSourceCommit': 'fixture',
                  'originalSha256': hashlib.sha256(original).hexdigest(), 'originalBytes': len(original),
                  'reason': 'Add Studio link'}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'model.moc3').write_bytes(asset)
            for data in (original, revised):
                (root/'index.html').write_bytes(data)
                self.assertEqual(verify_baseline(root, baseline, update), [])
            self.assertEqual(verify_baseline(root, baseline), ['index.html'])
            (root/'model.moc3').write_bytes(b'changed asset')
            self.assertEqual(verify_baseline(root, baseline, update), ['model.moc3'])
            (root/'model.moc3').write_bytes(asset)
            (root/'index.html').write_bytes(b'unrecorded homepage')
            self.assertEqual(verify_baseline(root, baseline, update), ['index.html'])
            (root/'index.html').unlink()
            self.assertEqual(verify_baseline(root, baseline, update), ['index.html'])
            (root/'target.html').write_bytes(revised)
            (root/'index.html').symlink_to(root/'target.html')
            self.assertEqual(verify_baseline(root, baseline, update), ['index.html'])
            for key, value in (('path', 'model.moc3'), ('baselineSourceCommit', 'unrelated'),
                               ('originalSha256', '0'*64), ('originalBytes', 0), ('bytes', True)):
                with self.subTest(key=key), self.assertRaisesRegex(ValueError, '首页入口修订记录'):
                    verify_baseline(root, baseline, {**update, key: value})


if __name__ == '__main__':
    unittest.main()
