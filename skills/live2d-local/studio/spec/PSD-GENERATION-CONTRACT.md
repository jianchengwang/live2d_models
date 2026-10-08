# Character materials contract v1

This is a neutral materials handoff for Claude Code, Codex, or another generation pipeline.
It describes pixels and their intended roles. It does not claim that a PSD is already rigged,
that a name match passes a visual check, or that a MOC3 has been exported.

Deliver `character.psd`, a composite preview PNG, and `character.layers.json` conforming to
`character-layers.v1.schema.json`. Use `character-layers.v1.example.json` only as a structure
example; its paths and layer records are not proof that real pixels exist.

## PSD constraints for the current web importer

Use PSD v1, RGB, 8-bit, separate raster layers, and normal blending. Use raw or RLE channel
compression. Bake each layer's masks/effects into that layer's own RGBA pixels. No PSB,
ZIP-compressed channels, groups, clipping chains, adjustment layers, or live effects.
All layers share one canvas coordinate system, with individual cropped bounds and offsets.
Keep alpha clean; avoid tiny remote alpha islands that expand an eye/mouth layer's bounds.
Limit the canvas to 4096×4096, the PSD to 64 MiB, and the layers to 64. The editor also
limits total decoded texture pixels to 64 million; use cropped layer bounds and RLE.

Use unique, descriptive flat PSD names, such as `eye_left_iris`. Record exact names in the
manifest. Preserve the original generated PSD and hashes; write edited projects separately.

## Required roles and pixel content

| Area | Roles | Required pixel content |
| --- | --- | --- |
| Body | `torso.clothing`, `neck`, `head.face_fill`, `hair.back`, `hair.front` | A complete body/clothing layer for breath. Face skin must continue beneath eyes and mouth; neck/body/hair need overlap behind moving neighbors. |
| Each eye | `eye.left.sclera`, `.iris`, `.upper_lid`, `.lower_lid`, `.closed_line`; same for `eye.right` | Separate white, iris/pupil, upper/lower lids, and a clean closed-eye line. Skin/lid fill must cover the eye opening without leaving holes. Optional pupil and highlight layers may be separate. A flattened open-eye patch alone supports only a squashing approximation. |
| Mouth | `mouth.outer_upper`, `mouth.outer_lower`, `mouth.inner`, optional `.teeth`, `.tongue`, `.closed_line` | Upper/lower contours, real mouth interior, and optional teeth/tongue. Provide enough concealed interior to reveal an opening; stretching a closed line cannot create an interior. |
| Optional waving arm | `arm.left.upper`, `.forearm`, `.hand`, `.backfill`; optionally corresponding right roles | Separate upper arm, forearm, and hand; complete pixels behind shoulder, elbow, wrist, sleeve, torso, and other occluders. No permanently cut-off joints. Record pivots and intended parent relationships. |

All role names above are exact strings; the `left`/`right` suffix describes the character's
own side, not the viewer's side. Record screen coordinates separately if required. Existing flat layers explicitly named
`Eye_Viewer_Left_Complete` map to the character right open-eye patch; viewer-right maps
to the character left. This name inference is a candidate and must remain marked approximate.

## Optional arm pivots and overlap

Store pivots in source canvas pixels, x rightwards, y downwards. Upper-arm pivot is shoulder,
forearm pivot is elbow, hand pivot is wrist. `parentId` references the corresponding layer's
stable manifest ID. Record `occlusionComplete` only after inspecting behind the occluder;
the generator must not set visual approval merely because an expected name exists.

The current web mesh renderer has no arm skeleton, rotation hierarchy, clipping-mask rig,
or automatic high-quality wave. Arm roles and pivots are a future handoff, not an implemented
wave control. A generic sway mesh preset is not equivalent to articulated waving.

## Action semantics and readiness

| Desired action | Parameter semantics | Current starter route |
| --- | --- | --- |
| Breath | `ParamBreath`: 0 rest, 1 inhale | Body/clothing mesh deformation; inspect silhouette and overlaps. |
| Blink | `ParamEyeLOpen`, `ParamEyeROpen`: 0 closed, 1 open; default 1 | Open-eye-only material can be explicitly marked approximate. Full lids/closed line require supported occlusion/visibility rigging before claiming complete blink. |
| Mouth | `ParamMouthOpenY`: 0 closed, 1 open; default 0 | Closed-mouth-only material can be explicitly marked approximate. Interior and contours are required for a complete open-mouth rig. |
| Optional wave | `ParamWave`: 0 rest, 1 configured wave pose | Missing separate parts/pivots is a materials gap. Having them is still not a working skeleton. |

Use action states `missing-materials`, `unbound`, `approximate`, and `usable`. Role matching
can establish a material candidate and prerequisites only. `usable` requires actual endpoint
geometry changes, visible rendered changes, clean 0/1 silhouettes and occlusion, successful
save/reopen, and explicit visual review. Never turn a name match into visual approval.

Existing mesh2d v1 projects may have `ParamEyeLOpen` with reversed legacy behavior: 0 open,
1 squashed closed. Preserve their rendered behavior; do not reinterpret an old parameter
solely by its ID. New projects must declare their semantics. A future MOC3 exporter must
explicitly map legacy close01 keyforms to standard open01, including default values and
motion curves, before naming them as standard eye-open parameters.

## Suggested generation instruction

Generate the original character as flat raster PSD layers using the roles above. Ensure face
skin behind eyes/mouth is complete, eye/mouth pixels are independently usable, and optional
arm joints have hidden overlap. Produce real missing material or report it; do not duplicate
a composite image into differently named layers. Export a composite PNG and an exact layer
manifest, compute the PSD SHA-256 after saving, and leave visual approval false until review.
This materials step must not claim automatic binding or MOC3 export.
