"""Local GET-only fixture. No upload or proxy endpoint; never a product backend."""
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse,unquote
import argparse
p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8797);p.add_argument('--root',default=str(Path(__file__).resolve().parents[1]));a=p.parse_args()
ROOT=Path(a.root).resolve()
class Static(SimpleHTTPRequestHandler):
 def translate_path(self,path):
  s=unquote(urlparse(path).path)
  if s.startswith('/live2d_models/'):s=s[len('/live2d_models'):]
  if any(x.startswith('.') or x in ('evidence','__pycache__') for x in s.split('/') if x):return str(ROOT/'not-served')
  f=(ROOT/s.lstrip('/')).resolve()
  if not f.is_relative_to(ROOT):return str(ROOT/'not-served')
  return str(f)
 def end_headers(self):self.send_header('Access-Control-Allow-Origin','*');self.send_header('Cache-Control','no-store');super().end_headers()
 def log_message(self,*args):pass
print(f'Local static fixture http://127.0.0.1:{a.port}/live2d_models/studio/',flush=True)
ThreadingHTTPServer(('127.0.0.1',a.port),Static).serve_forever()
