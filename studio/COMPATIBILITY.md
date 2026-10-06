# MOC3 compatibility repair · 2026-10-06

Based on `jianchengwang/live2d_models` main `d36495d79df8201275ab37800f9553a5095e5924`. This repair does not modify model binaries, textures, original model entry URLs, the old vendor renderer, or the old Core. It adds one explicitly recorded homepage navigation revision.

## Confirmed causes and changes

- The existing Core reports **4.0.0**, supports MOC3 binary versions 1–3, and actually rejects ten repository models. Their files are not missing: they require newer binary support
- MOC3 versions 4–5 now route to the official **Cubism 5.2 hosting branch**: `https://cubism.live2d.com/sdk-web/core/05/live2dcubismcore.min.js`. The bytes tested on this date report Core **5.1.0** (`83951616`), maximum MOC version **5**. The hosting label and Core binary version are different identifiers
- `v2/runtime.json` records an SHA-384 Subresource Integrity pin for the tested bytes. The branch URL itself is not immutable. If Live2D changes those bytes, loading fails visibly instead of silently executing an untested build. Review and retest before updating the pin
- Original MOC3 versions 1–3 continue using the existing same-site Core. The original renderer remains unchanged. No new Core binary is committed or included in export ZIPs
- Missing optional expressions, physics, pose, user data or invalid motions no longer abort an otherwise usable character. Skipped capabilities are removed from the controls and explained in diagnostics. Failed motion groups keep their original identifiers; entries are never silently renumbered
- `March 7th` declares eight missing expression files. Its body can proceed without them; the missing expressions are explicitly unavailable. The source model3.json is unchanged
- Reference resolution uses exact declared URLs/paths. Unsupported parent-directory or external optional references are skipped, never followed outside the allowlist. Required MOC and texture failures remain fatal and include the resource path
- Browser WebGL failure is detected before the legacy constructor destroys its document. It is reported as a browser/GPU issue rather than a generic Core or model error
- Texture errors show actual dimensions, the device limit, and the memory budget. `LiveroiD_A-Y01` and `LiveroiD_A-Y02` have **8192 × 16384** PNGs, each requiring approximately **512 MiB** of decoded RGBA memory. These remain outside the deliberate 8192-side / 256 MiB aggregate budget. A lower-resolution model package is still needed; this repair does not claim those two can render
- Full-repository PNG-header inspection on Mini additionally identifies oversized aggregate texture sets: **ANIYA 1536 MiB, Alexia 384 MiB, IceGirl 448 MiB, huohuo 1024 MiB, monv 384 MiB**, alongside the two **LiveroiD** models at **512 MiB each**. These seven remain unsupported by the unchanged 256 MiB decoded budget. The browser reports the reached aggregate, resource path and limits. Binary acceptance must not be presented as successful rendering for them
- The homepage now has a visible `./studio/` link that works at root, project and nested deployment bases

## Actual binary acceptance results

All 47 repository MOC3 binaries were downloaded from the exact base commit and checked against Git blob IDs before testing.

| Runtime | Actual Core load + model update | Old Framework load/update/drawable accessors |
| --- | --- | --- |
| Existing Core 4.0.0 | 37 accepted, 10 rejected | Unchanged legacy path |
| Official 5.2 hosting branch, measured Core 5.1.0 | 47 accepted, 0 rejected | 47 accepted, 0 rejected |

The ten old-Core failures are **ANIYA, Alexia, Gloria, IceGirl, March 7th, ariu, huohuo, monv, pachan 2.0, xgw**. `Alexia` and `monv` use MOC version 5; the other eight use version 4.

These results establish binary/Framework data compatibility. They are **not** proof of successful WebGL drawing, correct textures, clipping, motion playback or visual appearance for every model.

## Reproduce

From a complete checkout:

```sh
node --test studio/tests/*.test.mjs
python3 -B -m unittest discover -s studio/tests -p 'test_*.py' -v
python3 -B catalog/tools.py --verify --root .
python3 -B tools/build.py --base /live2d_models/ --site-addition --source .
node tools/audit_runtime.mjs
node tools/audit_runtime.mjs --core /path/to/already-approved/official-core.js --adapter
python3 tools/preview.py --port 8797
```

The audit tool never downloads or redistributes Core; use an already approved official file. `--adapter` exposes modules only in a temporary VM copy of the old bundle and checks original Framework data interfaces. It never writes to vendor code and does not simulate a successful WebGL draw.

## Local browser follow-up

The full Mini checkout passes 40 JavaScript and 22 Python checks and verifies the 1,385-file baseline with only the recorded homepage overlay. The first real WebGL run exposed the inherited parent CSP blocking the approved official Core inside srcdoc. Both Studio host pages now explicitly allow only the official `https://cubism.live2d.com` script origin in addition to self; no broad HTTPS script allowance was added. Real WebGL rendering is confirmed for March 7th, Gloria, ariu, pachan 2.0 and xgw on the approved new Core, plus lafei/6xb/yichui_2 on the unchanged old Core. March's eight missing expressions are reported and absent from controls. The seven oversized models above fail explicitly without decoding past the budget. Real motion, local-expression preview, rapid switching, cancel, required-texture 404/recovery and 390px layout checks pass. The downloaded 21-file code ZIP and the single bootstrap JS both load March on a second origin with the pinned official Core; neither contains the fake session-key canary, model binaries or a Core binary. Local evidence records these outcomes; it does not claim all 47 models were visually tested.

## Browser checks required before publication

1. At `/`, `/live2d_models/` and a nested preview base, confirm the visible homepage button reaches that same base's `studio/`
2. In a real WebGL-capable browser, visually test `lafei`, `6xb`, `yichui_2` (old Core), plus `ANIYA`, `Alexia`, `monv`, `March 7th` (new Core); inspect console/CSP/SRI failures
3. Confirm `March 7th` renders its body while its eight missing expressions are reported and absent from controls. Confirm LiveroiD failures clearly describe the oversized texture rather than claiming success
4. Switch rapidly between old/new models, cancel a load, reload, pause/resume, resize, hide/show, dispose and reopen; no stale model or old request may win
5. Check real motion, expression, transparency/masks, contain fitting and mouth parameters. Test downloaded code ZIP from a second origin, including modern Core SRI/CORS and an intentionally broken mandatory texture URL
6. Run the complete frozen-file verification with all original assets present. The cloud repair workspace has a verified source subset, so full 1385-file source verification was not run there

The cloud browser reproduced the published site's missing-dependency rejection and a WebGL initialization failure. Its local preview route returned `net::ERR_BLOCKED_BY_CLIENT`; repaired browser rendering therefore remains pending in an ordinary local development browser. Unit test doubles are labeled separately from actual Core tests.

## Licensing and paper scope

The publisher explicitly approved the official page's [Proprietary License](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html) and [Open Software License](https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html), and the consent checkbox was selected on 2026-10-06 before using the official hosting URLs. Model-specific rights remain unchanged. Each downstream deployment must satisfy the licenses applicable to it.

The referenced Bunraku paper's open asset bundle and custom renderer are a separate pipeline, not a MOC3 exporter. This repair adds no unimplemented image-to-MOC3 claim, AI provider request or key-bearing export.
