# From image materials to editable source and candidate MOC3

Choose the entrypoint matching the pixels you actually have. Both routes run locally using existing Node 22.12+, with no dependencies, model downloads, host agents or automatic uploads. Each output directory must be fresh.

## A. Existing layers or a supported layered PSD

For PNG layers, supply `studio-png-layers` v1 with cropped files, shared canvas offsets, bottom-to-top order, exact final SHA-256 values, roles, asset rights and explicit actions. Try the original geometric breath/eye/mouth approximation:

```sh
node scripts/image-input.mjs layers examples/independent-layers/layers.json new-layer-model
node scripts/verify-core.mjs new-layer-model/editable/project.mesh2d.json new-layer-model/runtime ParamBreath /your/legally-obtained/core.js new-layer-core.json
```

The first command writes separate `editable/editable-project.zip` and `runtime/candidate-model.zip` plus local input/pixel/alpha reports. It retains all supported dynamic parameters. No PSD is required. Open the editable JSON in the compatible browser editor, edit/save/reopen, then generate and validate the actual runtime. Core acceptance is followed by real texture/source comparison, default/all endpoints/all-midpoints (18 states for four parameters), declared motion playback and ZIP reopening. A candidate ZIP is not a visual pass. The current exporter requires each mesh to have at most one driver and rejects masks, rotation, hierarchy, physics and complete articulated waving.

For PSD, use the existing browser's supported flat PSD importer, apply the PSD role manifest, inspect real layers and save mesh2d JSON; then use `cli.mjs source` and `cli.mjs export`. The CLI has no PSD parser. PSD is an optional exchange format, not a required internal step. Existing source originals stay untouched.

`MATERIAL-REPORT.json` checks decoded PNG CRC/type/bounds, final file/pixel hashes, roles, offsets, opacity, unique layer/parameter IDs and starter keyforms. It rejects transparent layers, escaping file paths, unsupported fields, out-of-canvas pixels and duplicated full-canvas composites. Matching pixel hashes on smaller parts produce a warning, because symmetric eyes may legitimately share pixels. Alpha-supported bounding grids cover every nonzero component with a bounded 3px margin; they preserve original textures and offsets. This is a simple bounding grid, not a contour/Delaunay mesh or a trained motion predictor. Reports leave hidden-region completion and visual approval unverified.

## B. One image / PNG

First choose a capability that exists in your agent/session. An agent with only code/file tools can write or package a PSD but cannot thereby infer real hidden organ layers. The optional data-only request is:

```sh
node scripts/image-input.mjs tool-request your-image.png new-image-request your-rights.txt
```

Read `tool-request.json` and `PROMPT.md`, identify an actually available authorized local image editing/segmentation/inpainting tool, and use it to create real separated RGBA layers and concealed material. Manual painting is also valid. Store exact tool/provenance and review records locally. The package never executes the request or a user-supplied command. No particular vendor/API/key is required. Private remote processing is a separate destination decision. Inspect the output, create the final PNG manifest, then continue A.

If no such tool is available, report that separation/hidden fill is unavailable. For an explicitly chosen limited demonstration:

```sh
node scripts/image-input.mjs single-demo examples/original-geometric.png new-whole-image-demo LICENSE
```

This executable fallback retains one whole-image layer and only a breathing mesh. It writes source/runtime candidate ZIPs and a LIMITS.txt stating that splitting, hidden fill, true blink and mouth opening were not performed. Even an opaque background bends with the whole image. It never claims a complete character rig. RGB/RGBA 8-bit non-interlaced PNG is supported; other image formats require the user's own local conversion tool. Do not package a single PNG into a PSD and call it layered.

## Bunraku ideas and substitutions

[Bunraku §3, §5 and Appendix G](https://arxiv.org/html/2607.27348v1) motivates organ semantics, hidden-region RGBA completion, alpha-derived geometry in shared coordinates and coordinated multi-layer keyposes with linear runtime interpolation. We use an explicit role manifest, optional authorized image/manual tools, an alpha-support grid and reviewed deterministic presets. These replace its learned decomposition and joint regressor, and do not reproduce its training or results. Independent mesh drivers cannot model its general same-mesh combined fields. Its asset representation is separate from our limited MOC3 writer. The [official repository](https://github.com/SparcAI-Inc/Bunraku) exposed a README when checked on 2026-10-08; this implementation does not depend on unavailable weights. No paper illustrations, data or weights are bundled.

Known failures: missed/mislabelled or duplicate organs, unpainted concealed regions, eye/face/hair drift, closed-patch mouth stretching, transparent alpha noise, grid/crop mismatch, unsupported combined drivers and texture seams. Inspect neighboring layers together; do not infer coherence from parameter names. Every new source/output requires its own runtime and visual evidence.
