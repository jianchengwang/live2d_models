# Browser-only Studio

Open `/live2d_models/studio/` on the existing GitHub Pages site. The workbench uses static HTML, CSS, ES modules and catalog JSON; there are no runtime `/api/session`, `/api/catalog` or `/api/import` endpoints. Imports execute in a browser worker, models remain in Blob URLs, and BYOK calls go directly to the visitor's explicitly selected trusted HTTPS provider. Keys stay in memory and are cleared on refresh or explicit reset. CORS failures are shown without using public proxies.

The isolated iframe reuses the existing same-site Core/renderer files. Catalog model references retain their existing asset URLs. Legacy moc entries are indexed; moc3 preview reports compatibility failures. Motion compatibility is an explicit option that changes allocation counts only in renderer memory. Local imports, motions, expressions, model switching and stream cancellation release their resources.

Image-to-model stages describe manual layer review, Editor rigging/export and validation of a real model package. They do not automatically produce moc3 or invoke a host CLI.

See [PUBLISHING.md](./PUBLISHING.md) for the authorized publication scope and preservation constraints. The offline Python catalog utilities are audit/test tools only. Run `node --test studio/tests/*.test.mjs` and `python3 -B -m unittest discover -s studio/tests -p 'test_*.py' -v` from the repository root. `python3 -B tools/build.py --site-addition --source .` builds only the code addition and checks every frozen old byte; never deploy that artifact as the complete old site.
