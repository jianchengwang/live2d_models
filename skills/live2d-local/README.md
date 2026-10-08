# Local Live2D preparation and export skill 0.2.0

Use this folder with your own Codex, Claude Code, or subagent. No host service or account is required. Node 22.12+ is required; there are no npm dependencies or install steps. The package includes original single-parameter and four-parameter geometric examples and a pinned MIT experimental writer. It includes no repository character models, private assets, Cubism Core, Editor, or SDK binaries. Obtain any required SDK legally from Live2D and decide its terms yourself. See PROVENANCE.json and both licenses. The upstream layout has reverse-engineering references; this is not a clean-room writer or an official Cubism exporter.

For Codex, place this folder in your chosen skills directory or tell it to read SKILL.md. For Claude Code, place the folder under your project's `.claude/skills/live2d-local/` or explicitly ask it to read SKILL.md. See AGENT-PROMPTS.md. Do not install into another person's workspace or execute uploaded scripts.

```sh
node scripts/cli.mjs inspect studio/spec/moc3-synthetic.mesh2d.json
node scripts/cli.mjs source studio/spec/moc3-synthetic.mesh2d.json new-editable
node scripts/cli.mjs export studio/spec/moc3-synthetic.mesh2d.json new-runtime ParamDemo
node scripts/verify-core.mjs studio/spec/moc3-synthetic.mesh2d.json new-runtime ParamDemo /your/legally-obtained/core.js new-core-report.json
node --test tests/*.test.mjs
```

All output directories/reports must be new. `export` creates a deterministic stored candidate-model.zip with model.moc3, model.model3.json, atlas PNG, declared test.motion3.json, writer license and file-hash report. Core verification explicitly reports browser texture/motion acceptance pending. It never changes the original candidate report into a claimed visual pass.

| Input or capability | Current status |
| --- | --- |
| Editable `studio-mesh2d` v1 JSON | Preserve original layers, meshes, UVs, endpoint shapes, parameters; browser import/edit/save/reopen |
| Editable project ZIP v1 | Contains project.mesh2d.json and project.manifest.json; extract the JSON for the current browser editor |
| PNG layers manifest v1 | Bounded RGB/RGBA PNG, declared roles/offsets and SHA-256; grid and approximate starter binding |
| PSD | Contract/schema included; import a supported flat PSD with the browser, then save mesh2d; no CLI PSD parser |
| MOC3 export | 1–4 independent effective dynamic parameters, 0–1; two linear direct ArtMesh keyforms per dynamic mesh; static meshes retain one keyform and no parameter band |
| Limits | 1–16 visible meshes; 8192 total vertices; 1024 vertices/mesh; one atlas ≤4096 with 2px edge extrusion |
| Independent simultaneous export | Each mesh may have one effective dynamic driver; a parameter may drive multiple meshes. Reject same-mesh combinations, hidden-only actions and more than four dynamic parameters |
| Rotation, skeleton, nested deformation, masks, physics | Rejected at export boundary |
| Full blink, mouth interior, articulated wave | Not guaranteed; closed patch stretching is approximate and cannot invent missing pixels |
| Existing MOC3-only model | Play and inspect parameters using a legal runtime; no editable-source recovery or lossless re-export |

The browser path is source-first: open editable JSON → edit base/endpoint → save JSON → reopen → supported export → actual Core/pixel/motion acceptance. Keep the source alongside the runtime output. The webpage export can generate a fresh model from edited JSON; current export-page ZIP re-open validates its own generated package. CLI-generated candidate ZIP can be imported into a model preview but is not automatically treated as that page's identical generated ZIP.

Default actions have no network or upload. No dependency fallback exists. Unsupported PNG variants (palette, grayscale, 16-bit, interlaced, APNG, RGB tRNS) fail explicitly; re-export locally as 8-bit RGBA with your chosen image tool. No automatic image splitting or quality approval is claimed. A safe input format is not permission to publicly distribute its pixels.

The checked-in original synthetic source was already tested with the official Core 6 runtime and actual browser rendering/motion. The offline CLI pipeline is separately tested; browser evidence belongs to the exact output hash, not every future project. A runtime source comparison must pass before calling a new model visually verified.

For the original four-parameter example, use `studio/spec/moc3-independent.mesh2d.json` with `ParamBreath` as the initial preview parameter. Export retains all four actions. Core validation tests defaults, every endpoint combination and all midpoints (18 states for four parameters). The model declares a fixed `flat-independent-v1` runtime profile for the tested Core 6 path; it does not select an arbitrary runtime URL.
