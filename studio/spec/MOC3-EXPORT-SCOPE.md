# Experimental MOC3 export

The editor's **实验性 MOC3 导出** action sends the current unsaved project through a
same-origin, memory-only browser channel to the export page. It does not upload textures
or project contents. The export page also accepts a local mesh2d file or the original
synthetic T/checker sample. Generation runs in a local module worker using the pinned MIT
writer; no export server or new dependency is involved.

The first runtime validation loads the app's existing official Cubism Core 6.0.1 URL,
fixed by SRI, and the existing Cubism Web Framework. Model data remains in the browser.

## Exact supported boundary

- Studio mesh2d v1; flat normal-alpha raster layers and embedded PNG pixels.
- One to four independent parameters that change vertices, range 0–1, exactly two direct keyforms.
  Each mesh may have at most one effective dynamic driver; a parameter may drive several meshes. Static meshes retain one keyform with no parameter band. Other unbound parameters stay at defaults.
- 1–16 visible layers, 1024 vertices per layer, 8192 total vertices, one ≤4096px atlas.
- Reject same-mesh dynamic combinations, hidden-only actions, more than four moving parameters, rotation/deformer/pivot/parent/mask/physics structures,
  unknown structure fields and `ParamWave`. No silent dropping of an action.
- Legacy eye-close01 endpoints/default/motion are explicitly mapped to open01 semantics.
- This is not an editable CMO3, a full Cubism Editor replacement, or a complete blink,
  mouth or articulated-wave rig. The writer is experimental; unsupported input rejects.

## Acceptance and download

Generate, compare defaults/all endpoint combinations/all midpoints (0/0.5/1 for a single parameter), play the real exported test motion, then review the
texture orientation, silhouette and overlaps. Download stays disabled until official Core
consistency/load/geometry/UV/order checks, nonblank matching rendering, visible endpoint
motion, actual motion samples and explicit visual review pass. The test motion is one-shot.

Rendering comparison tolerances: mean channel difference ≤1/255, ≤3% pixels differing by
more than 3/255, ≤1% alpha mismatch. These are runtime comparisons, not full rig certification.
The downloaded ZIP contains a genuine MOC3, model3 JSON, PNG atlas, test motion3, validation
report and MIT license; Core is not redistributed. The export page can reopen that ZIP,
verify its model file hashes, and repeat Core and rendering load checks.

## Provenance

MIT ©2026 Nguyen Phan. Upstream `MangoLion/stretchystudio`, commit
`24a83a27ba43e43e9d2e3de5e33994594e6199c2`, source `src/io/live2d/moc3writer.js`.
The tested direct-keyform adaptation SHA-256 is
`cc3d3da169542deba778692663ef738b6d093c101d8132e449d882c43cf7cc3d`.
Keep `vendor/experimental-moc3/LICENSE.MIT`, provenance and adaptation patch.
The built-in synthetic sample was created for testing and contains no user artwork.

Generated model3 files declare a bounded `StudioRuntime` profile `flat-independent-v1`/Core 6. Legacy models retain their existing runtime selection. Unknown profiles and extra runtime URL fields reject. Original public example source and runtime ZIPs are separate; neither contains Core.
