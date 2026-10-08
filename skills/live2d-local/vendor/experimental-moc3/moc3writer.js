// Bounded independent direct-ArtMesh adapter. Validated with official Core 6.
// Upstream: MangoLion/stretchystudio @ 24a83a27ba43e43e9d2e3de5e33994594e6199c2
// Copyright (c) 2026 Nguyen Phan; MIT license in LICENSE.MIT.
/**
 * Minimal .moc3 binary writer for Live2D Cubism export.
 *
 * Generates a valid .moc3 binary file from Stretchy Studio project data.
 * The binary layout follows the format documented by py-moc3 and moc3ingbird:
 *
 *   [0..64)      Header: "MOC3" magic + version + endian flag + padding
 *   [64..704)    Section Offset Table (SOT): 160 x uint32 (640 bytes)
 *   [704..832)   Count Info Table: 23 x uint32 + padding (128 bytes)
 *   [832..1984)  Reserved / padding
 *   [1984..)     Body: count info, canvas info, then typed-array sections
 *
 * Each body section is 64-byte aligned. The SOT stores absolute offsets
 * from file start. Byte order is little-endian.
 *
 * Reference: py-moc3 _core.py (Ludentes/py-moc3) — verified read+write
 *
 * @module io/live2d/moc3writer
 */

// Source: [ref][py-moc3] — format constants from reference file + py-moc3
const MAGIC = [0x4D, 0x4F, 0x43, 0x33]; // "MOC3"
const HEADER_SIZE = 64;
const SOT_COUNT = 160;
const SOT_SIZE = SOT_COUNT * 4; // 640 bytes
const COUNT_INFO_ENTRIES = 23;
const COUNT_INFO_SIZE = 128; // 23 * 4 = 92, padded to 128
const CANVAS_INFO_SIZE = 64;
const DEFAULT_OFFSET = 1984; // body starts here
const ALIGN = 64;
const RUNTIME_UNIT_SIZE = 8;
const STRING_FIELD_SIZE = 64; // MOC3Id is a 64-byte null-padded UTF-8 string

// Source: [py-moc3] — version enum
const MOC_VERSION = {
  V3_00: 1,
  V3_03: 2,
  V4_00: 3,
  V4_02: 4,
  V5_00: 5,
};

// Source: [py-moc3] — count info indices
const COUNT_IDX = {
  PARTS: 0,
  DEFORMERS: 1,
  WARP_DEFORMERS: 2,
  ROTATION_DEFORMERS: 3,
  ART_MESHES: 4,
  PARAMETERS: 5,
  PART_KEYFORMS: 6,
  WARP_DEFORMER_KEYFORMS: 7,
  ROTATION_DEFORMER_KEYFORMS: 8,
  ART_MESH_KEYFORMS: 9,
  KEYFORM_POSITIONS: 10,
  KEYFORM_BINDING_INDICES: 11,
  KEYFORM_BINDING_BANDS: 12,
  KEYFORM_BINDINGS: 13,
  KEYS: 14,
  UVS: 15,
  POSITION_INDICES: 16,
  DRAWABLE_MASKS: 17,
  DRAW_ORDER_GROUPS: 18,
  DRAW_ORDER_GROUP_OBJECTS: 19,
  GLUES: 20,
  GLUE_INFOS: 21,
  GLUE_KEYFORMS: 22,
};

// Source: [py-moc3] — element types and their byte sizes
const ELEM = {
  I32:     { size: 4, write: 'writeI32Array' },
  F32:     { size: 4, write: 'writeF32Array' },
  I16:     { size: 2, write: 'writeI16Array' },
  U8:      { size: 1, write: 'writeU8Array' },
  BOOL:    { size: 4, write: 'writeBoolArray' },  // stored as i32
  STR64:   { size: 64, write: 'writeStringArray' },
  RUNTIME: { size: RUNTIME_UNIT_SIZE, write: 'writeRuntime' },
};

/**
 * Section layout definition — order matches py-moc3's SECTION_LAYOUT exactly.
 * Each entry: [name, elemType, countIdx, alignment]
 *
 * Source: [py-moc3] _core.py lines 319–466
 */
const SECTION_LAYOUT = [
  // Parts (count_idx=0)
  ['part.runtime_space',                ELEM.RUNTIME, COUNT_IDX.PARTS, ALIGN],
  ['part.ids',                          ELEM.STR64,   COUNT_IDX.PARTS, 0],
  ['part.keyform_binding_band_indices', ELEM.I32,     COUNT_IDX.PARTS, ALIGN],
  ['part.keyform_begin_indices',        ELEM.I32,     COUNT_IDX.PARTS, ALIGN],
  ['part.keyform_counts',               ELEM.I32,     COUNT_IDX.PARTS, ALIGN],
  ['part.visibles',                     ELEM.BOOL,    COUNT_IDX.PARTS, ALIGN],
  ['part.enables',                      ELEM.BOOL,    COUNT_IDX.PARTS, ALIGN],
  ['part.parent_part_indices',          ELEM.I32,     COUNT_IDX.PARTS, ALIGN],

  // Deformers (count_idx=1)
  ['deformer.runtime_space',                   ELEM.RUNTIME, COUNT_IDX.DEFORMERS, ALIGN],
  ['deformer.ids',                             ELEM.STR64,   COUNT_IDX.DEFORMERS, 0],
  ['deformer.keyform_binding_band_indices',    ELEM.I32,     COUNT_IDX.DEFORMERS, ALIGN],
  ['deformer.visibles',                        ELEM.BOOL,    COUNT_IDX.DEFORMERS, ALIGN],
  ['deformer.enables',                         ELEM.BOOL,    COUNT_IDX.DEFORMERS, ALIGN],
  ['deformer.parent_part_indices',             ELEM.I32,     COUNT_IDX.DEFORMERS, ALIGN],
  ['deformer.parent_deformer_indices',         ELEM.I32,     COUNT_IDX.DEFORMERS, ALIGN],
  ['deformer.types',                           ELEM.I32,     COUNT_IDX.DEFORMERS, ALIGN],
  ['deformer.specific_indices',                ELEM.I32,     COUNT_IDX.DEFORMERS, ALIGN],

  // Warp Deformers (count_idx=2)
  ['warp_deformer.keyform_binding_band_indices', ELEM.I32, COUNT_IDX.WARP_DEFORMERS, ALIGN],
  ['warp_deformer.keyform_begin_indices',        ELEM.I32, COUNT_IDX.WARP_DEFORMERS, ALIGN],
  ['warp_deformer.keyform_counts',               ELEM.I32, COUNT_IDX.WARP_DEFORMERS, ALIGN],
  ['warp_deformer.vertex_counts',                ELEM.I32, COUNT_IDX.WARP_DEFORMERS, ALIGN],
  ['warp_deformer.rows',                         ELEM.I32, COUNT_IDX.WARP_DEFORMERS, ALIGN],
  ['warp_deformer.cols',                         ELEM.I32, COUNT_IDX.WARP_DEFORMERS, ALIGN],

  // Rotation Deformers (count_idx=3)
  ['rotation_deformer.keyform_binding_band_indices', ELEM.I32, COUNT_IDX.ROTATION_DEFORMERS, ALIGN],
  ['rotation_deformer.keyform_begin_indices',        ELEM.I32, COUNT_IDX.ROTATION_DEFORMERS, ALIGN],
  ['rotation_deformer.keyform_counts',               ELEM.I32, COUNT_IDX.ROTATION_DEFORMERS, ALIGN],
  ['rotation_deformer.base_angles',                  ELEM.F32, COUNT_IDX.ROTATION_DEFORMERS, ALIGN],

  // ArtMeshes (count_idx=4)
  ['art_mesh.runtime_space_0',                ELEM.RUNTIME, COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.runtime_space_1',                ELEM.RUNTIME, COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.runtime_space_2',                ELEM.RUNTIME, COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.runtime_space_3',                ELEM.RUNTIME, COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.ids',                            ELEM.STR64,   COUNT_IDX.ART_MESHES, 0],
  ['art_mesh.keyform_binding_band_indices',   ELEM.I32,     COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.keyform_begin_indices',          ELEM.I32,     COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.keyform_counts',                 ELEM.I32,     COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.visibles',                       ELEM.BOOL,    COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.enables',                        ELEM.BOOL,    COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.parent_part_indices',            ELEM.I32,     COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.parent_deformer_indices',        ELEM.I32,     COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.texture_indices',                ELEM.I32,     COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.drawable_flags',                 ELEM.U8,      COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.position_index_counts',          ELEM.I32,     COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.uv_begin_indices',               ELEM.I32,     COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.position_index_begin_indices',   ELEM.I32,     COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.vertex_counts',                  ELEM.I32,     COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.mask_begin_indices',             ELEM.I32,     COUNT_IDX.ART_MESHES, ALIGN],
  ['art_mesh.mask_counts',                    ELEM.I32,     COUNT_IDX.ART_MESHES, ALIGN],

  // Parameters (count_idx=5)
  ['parameter.runtime_space',                    ELEM.RUNTIME, COUNT_IDX.PARAMETERS, ALIGN],
  ['parameter.ids',                              ELEM.STR64,   COUNT_IDX.PARAMETERS, 0],
  ['parameter.max_values',                       ELEM.F32,     COUNT_IDX.PARAMETERS, ALIGN],
  ['parameter.min_values',                       ELEM.F32,     COUNT_IDX.PARAMETERS, ALIGN],
  ['parameter.default_values',                   ELEM.F32,     COUNT_IDX.PARAMETERS, ALIGN],
  ['parameter.repeats',                          ELEM.BOOL,    COUNT_IDX.PARAMETERS, ALIGN],
  ['parameter.decimal_places',                   ELEM.I32,     COUNT_IDX.PARAMETERS, ALIGN],
  ['parameter.keyform_binding_begin_indices',    ELEM.I32,     COUNT_IDX.PARAMETERS, ALIGN],
  ['parameter.keyform_binding_counts',           ELEM.I32,     COUNT_IDX.PARAMETERS, ALIGN],

  // Part Keyforms (count_idx=6)
  ['part_keyform.draw_orders', ELEM.F32, COUNT_IDX.PART_KEYFORMS, ALIGN],

  // Warp Deformer Keyforms (count_idx=7)
  ['warp_deformer_keyform.opacities',                      ELEM.F32, COUNT_IDX.WARP_DEFORMER_KEYFORMS, ALIGN],
  ['warp_deformer_keyform.keyform_position_begin_indices',  ELEM.I32, COUNT_IDX.WARP_DEFORMER_KEYFORMS, ALIGN],

  // Rotation Deformer Keyforms (count_idx=8)
  ['rotation_deformer_keyform.opacities',   ELEM.F32,  COUNT_IDX.ROTATION_DEFORMER_KEYFORMS, ALIGN],
  ['rotation_deformer_keyform.angles',      ELEM.F32,  COUNT_IDX.ROTATION_DEFORMER_KEYFORMS, ALIGN],
  ['rotation_deformer_keyform.origin_xs',   ELEM.F32,  COUNT_IDX.ROTATION_DEFORMER_KEYFORMS, ALIGN],
  ['rotation_deformer_keyform.origin_ys',   ELEM.F32,  COUNT_IDX.ROTATION_DEFORMER_KEYFORMS, ALIGN],
  ['rotation_deformer_keyform.scales',      ELEM.F32,  COUNT_IDX.ROTATION_DEFORMER_KEYFORMS, ALIGN],
  ['rotation_deformer_keyform.reflect_xs',  ELEM.BOOL, COUNT_IDX.ROTATION_DEFORMER_KEYFORMS, ALIGN],
  ['rotation_deformer_keyform.reflect_ys',  ELEM.BOOL, COUNT_IDX.ROTATION_DEFORMER_KEYFORMS, ALIGN],

  // ArtMesh Keyforms (count_idx=9)
  ['art_mesh_keyform.opacities',                      ELEM.F32, COUNT_IDX.ART_MESH_KEYFORMS, ALIGN],
  ['art_mesh_keyform.draw_orders',                    ELEM.F32, COUNT_IDX.ART_MESH_KEYFORMS, ALIGN],
  ['art_mesh_keyform.keyform_position_begin_indices',  ELEM.I32, COUNT_IDX.ART_MESH_KEYFORMS, ALIGN],

  // Keyform Positions (count_idx=10) — vertex XY pairs
  ['keyform_position.xys', ELEM.F32, COUNT_IDX.KEYFORM_POSITIONS, ALIGN],

  // Keyform Binding Indices (count_idx=11)
  ['keyform_binding_index.indices', ELEM.I32, COUNT_IDX.KEYFORM_BINDING_INDICES, ALIGN],

  // Keyform Binding Bands (count_idx=12)
  ['keyform_binding_band.begin_indices', ELEM.I32, COUNT_IDX.KEYFORM_BINDING_BANDS, ALIGN],
  ['keyform_binding_band.counts',        ELEM.I32, COUNT_IDX.KEYFORM_BINDING_BANDS, ALIGN],

  // Keyform Bindings (count_idx=13)
  ['keyform_binding.keys_begin_indices', ELEM.I32, COUNT_IDX.KEYFORM_BINDINGS, ALIGN],
  ['keyform_binding.keys_counts',        ELEM.I32, COUNT_IDX.KEYFORM_BINDINGS, ALIGN],

  // Keys (count_idx=14) — parameter values at keyform stops
  ['keys.values', ELEM.F32, COUNT_IDX.KEYS, ALIGN],

  // UVs (count_idx=15) — texture coordinates (XY pairs)
  ['uv.xys', ELEM.F32, COUNT_IDX.UVS, ALIGN],

  // Position Indices (count_idx=16) — triangle indices
  ['position_index.indices', ELEM.I16, COUNT_IDX.POSITION_INDICES, ALIGN],

  // Drawable Masks (count_idx=17)
  ['drawable_mask.art_mesh_indices', ELEM.I32, COUNT_IDX.DRAWABLE_MASKS, ALIGN],

  // Draw Order Groups (count_idx=18)
  ['draw_order_group.object_begin_indices',  ELEM.I32, COUNT_IDX.DRAW_ORDER_GROUPS, ALIGN],
  ['draw_order_group.object_counts',         ELEM.I32, COUNT_IDX.DRAW_ORDER_GROUPS, ALIGN],
  ['draw_order_group.object_total_counts',   ELEM.I32, COUNT_IDX.DRAW_ORDER_GROUPS, ALIGN],
  ['draw_order_group.min_draw_orders',       ELEM.I32, COUNT_IDX.DRAW_ORDER_GROUPS, ALIGN],
  ['draw_order_group.max_draw_orders',       ELEM.I32, COUNT_IDX.DRAW_ORDER_GROUPS, ALIGN],

  // Draw Order Group Objects (count_idx=19)
  ['draw_order_group_object.types',         ELEM.I32, COUNT_IDX.DRAW_ORDER_GROUP_OBJECTS, ALIGN],
  ['draw_order_group_object.indices',       ELEM.I32, COUNT_IDX.DRAW_ORDER_GROUP_OBJECTS, ALIGN],
  ['draw_order_group_object.group_indices', ELEM.I32, COUNT_IDX.DRAW_ORDER_GROUP_OBJECTS, ALIGN],

  // Glues (count_idx=20)
  ['glue.runtime_space',               ELEM.RUNTIME, COUNT_IDX.GLUES, ALIGN],
  ['glue.ids',                         ELEM.STR64,   COUNT_IDX.GLUES, 0],
  ['glue.keyform_binding_band_indices', ELEM.I32,    COUNT_IDX.GLUES, ALIGN],
  ['glue.keyform_begin_indices',       ELEM.I32,     COUNT_IDX.GLUES, ALIGN],
  ['glue.keyform_counts',             ELEM.I32,      COUNT_IDX.GLUES, ALIGN],
  ['glue.art_mesh_index_as',          ELEM.I32,      COUNT_IDX.GLUES, ALIGN],
  ['glue.art_mesh_index_bs',          ELEM.I32,      COUNT_IDX.GLUES, ALIGN],
  ['glue.info_begin_indices',         ELEM.I32,      COUNT_IDX.GLUES, ALIGN],
  ['glue.info_counts',                ELEM.I32,      COUNT_IDX.GLUES, ALIGN],

  // Glue Infos (count_idx=21)
  ['glue_info.weights',          ELEM.F32, COUNT_IDX.GLUE_INFOS, ALIGN],
  ['glue_info.position_indices', ELEM.I16, COUNT_IDX.GLUE_INFOS, ALIGN],

  // Glue Keyforms (count_idx=22)
  ['glue_keyform.intensities', ELEM.F32, COUNT_IDX.GLUE_KEYFORMS, ALIGN],
];


// ---------------------------------------------------------------------------
// Binary writer helper
// ---------------------------------------------------------------------------

class BinaryWriter {
  constructor() {
    /** @type {number[]} */
    this._buf = [];
  }

  get pos() { return this._buf.length; }

  writeU8(v)  { this._buf.push(v & 0xFF); }
  writeI16(v) { const b = new ArrayBuffer(2); new DataView(b).setInt16(0, v, true); this._pushBytes(b); }
  writeI32(v) { const b = new ArrayBuffer(4); new DataView(b).setInt32(0, v, true); this._pushBytes(b); }
  writeU32(v) { const b = new ArrayBuffer(4); new DataView(b).setUint32(0, v, true); this._pushBytes(b); }
  writeF32(v) { const b = new ArrayBuffer(4); new DataView(b).setFloat32(0, v, true); this._pushBytes(b); }

  writeI32Array(vals)  { for (const v of vals) this.writeI32(v); }
  writeU32Array(vals)  { for (const v of vals) this.writeU32(v); }
  writeF32Array(vals)  { for (const v of vals) this.writeF32(v); }
  writeI16Array(vals)  { for (const v of vals) this.writeI16(v); }
  writeU8Array(vals)   { for (const v of vals) this.writeU8(v); }
  writeBoolArray(vals) { for (const v of vals) this.writeI32(v ? 1 : 0); }

  writeString(s, fieldSize = STRING_FIELD_SIZE) {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(s);
    if (encoded.length >= fieldSize) {
      throw new Error(`String "${s}" too long for ${fieldSize}-byte field`);
    }
    for (const byte of encoded) this._buf.push(byte);
    // Null-pad to fieldSize
    for (let i = encoded.length; i < fieldSize; i++) this._buf.push(0);
  }

  writeStringArray(vals) { for (const s of vals) this.writeString(s); }

  writeRuntime(count) {
    // Runtime space: zeroed bytes
    this.fill(count * RUNTIME_UNIT_SIZE);
  }

  fill(count, value = 0) {
    for (let i = 0; i < count; i++) this._buf.push(value);
  }

  padTo(alignment) {
    const rem = this._buf.length % alignment;
    if (rem !== 0) this.fill(alignment - rem);
  }

  /** Patch a uint32 value at a previously known position. */
  patchU32(offset, value) {
    const b = new ArrayBuffer(4);
    new DataView(b).setUint32(0, value, true);
    const bytes = new Uint8Array(b);
    for (let i = 0; i < 4; i++) this._buf[offset + i] = bytes[i];
  }

  toArrayBuffer() {
    return new Uint8Array(this._buf).buffer;
  }

  _pushBytes(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    for (const b of bytes) this._buf.push(b);
  }
}


// ---------------------------------------------------------------------------
// Data preparation — convert project data to moc3 section arrays
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Moc3Input
 * @property {object}  project      - projectStore.project snapshot
 * @property {Map<string, import('./textureAtlas.js').PackedRegion>} regions - Atlas regions
 * @property {number}  atlasSize    - Atlas dimension
 * @property {number}  numAtlases   - Number of texture atlas sheets
 */

/**
 * Build all section data arrays from project data.
 *
 * @param {Moc3Input} input
 * @returns {{ sections: Map<string, any[]>, counts: number[], canvas: object }}
 */
function buildSectionData(input) {
  const { project, regions, atlasSize, numAtlases } = input;

  const canvasW = project.canvas?.width ?? 800;
  const canvasH = project.canvas?.height ?? 600;

  const sections = new Map();
  const counts = new Array(COUNT_INFO_ENTRIES).fill(0);

  // Collect parts (groups → Live2D Parts)
  const groups = project.nodes.filter(n => n.type === 'group');
  // Always have at least one root part
  const partNodes = groups.length > 0 ? groups : [{ id: 'PartRoot', name: 'Root', parent: null, opacity: 1, visible: true }];

  // Collect art meshes (parts with meshes → Live2D ArtMeshes).
  // Sort by draw_order (descending) to maintain correct depth ordering (upstream fix).
  const meshParts = project.nodes
    .filter(n =>
      n.type === 'part' && n.mesh && n.visible !== false && regions.has(n.id)
    )
    .sort((a, b) => (b.draw_order ?? 0) - (a.draw_order ?? 0));

  // Collect parameters
  const params = project.parameters ?? [];

  const paramList = params.length > 0
    ? params
    : [{ id: 'ParamOpacity', min: 0, max: 1, default: 1 }];

  // --- Warp deformer analysis (needs paramList) ---
  const wdNodes = (project.nodes ?? []).filter(n => n.type === 'warpDeformer');
  const wdVertsMap = new Map(); // wdId → keyframes from mesh_verts tracks
  for (const anim of (project.animations ?? [])) {
    for (const track of (anim.tracks ?? [])) {
      if (track.property === 'mesh_verts' && track.keyframes?.length >= 1
          && !wdVertsMap.has(track.nodeId)
          && wdNodes.some(n => n.id === track.nodeId)) {
        wdVertsMap.set(track.nodeId, track.keyframes);
      }
    }
  }
  const wdInfo = wdNodes.map((wd, wdIdx) => {
    const col = wd.col ?? 2;
    const row = wd.row ?? 2;
    const gridPts = (col + 1) * (row + 1);
    const kfs = wdVertsMap.get(wd.id) ?? [];
    const numKf = Math.max(1, kfs.length);
    const param = wd.parameterId ? paramList.find(p => p.id === wd.parameterId) : null;
    const paramIdx = param ? paramList.indexOf(param) : -1;
    return { wd, col, row, gridPts, kfs, numKf, param, paramIdx, wdIdx };
  });
  const numWarpDeformers = wdInfo.length;
  const totalWarpKfs = wdInfo.reduce((s, d) => s + d.numKf, 0);
  const totalWarpGridXYs = wdInfo.reduce((s, d) => s + d.numKf * d.gridPts * 2, 0);

  // Bound warp deformers sorted by paramIdx so each parameter owns a contiguous binding range
  const sortedBoundWd = wdInfo
    .filter(d => d.param !== null)
    .sort((a, b) => a.paramIdx - b.paramIdx);
  const numBoundWd = sortedBoundWd.length;
  const wdBindingPosMap = new Map(); // wdIdx → position in sortedBoundWd
  for (let j = 0; j < sortedBoundWd.length; j++) {
    wdBindingPosMap.set(sortedBoundWd[j].wdIdx, j);
  }
  const totalBoundWarpKfs = sortedBoundWd.reduce((s, d) => s + d.numKf, 0);

  // Ancestry walk: mesh part → nearest warp deformer ancestor
  const meshWdIndexMap = new Map(); // partId → wdIdx
  for (const part of meshParts) {
    let cur = part.parent ? project.nodes.find(n => n.id === part.parent) : null;
    while (cur) {
      if (cur.type === 'warpDeformer') {
        const wdIdx = wdNodes.findIndex(n => n.id === cur.id);
        if (wdIdx >= 0) meshWdIndexMap.set(part.id, wdIdx);
        break;
      }
      cur = cur.parent ? (project.nodes.find(n => n.id === cur.parent) ?? null) : null;
    }
  }

  // Build Part ID → index map
  const partIdMap = new Map();
  partNodes.forEach((p, i) => partIdMap.set(p.id, i));

  // --- Counts ---
  const numParts = partNodes.length;
  const numArtMeshes = meshParts.length;
  const numParams = params.length > 0 ? params.length : 1; // At least 1 parameter (ParamOpacity)
  if (numWarpDeformers) throw new Error('Independent mesh proof rejects deformers');
  const meshParamIndices = meshParts.map(p => p.moc3ParameterIndex ?? 0);
  if (meshParamIndices.some(i => !Number.isInteger(i) || i < 0 || i >= paramList.length)) throw new Error('Invalid mesh parameter ownership');
  const meshBindingOrder = meshParts.map((_, i) => i).filter(i => meshParts[i].moc3Keyforms?.length > 1).sort((a,b) => meshParamIndices[a]-meshParamIndices[b] || a-b);
  const meshBindingIndex = new Map(meshBindingOrder.map((meshIndex,bindingIndex) => [meshIndex,bindingIndex]));
  const meshFrames = meshParts.map(p => p.moc3Keyforms ?? [p.mesh.vertices]);
  const meshFrameBegins = []; let frameCursor = 0;
  for (const frames of meshFrames) { meshFrameBegins.push(frameCursor); frameCursor += frames.length; }
  const numArtMeshKeyforms = frameCursor; // Direct ArtMesh endpoints, no deformers.
  const numPartKeyforms = numParts;

  // Compute UV and vertex counts
  //
  // IMPORTANT: Field names in .moc3 are COUNTERINTUITIVE (confirmed via Hiyori RE):
  //   art_mesh.vertex_counts       = FLAT TRIANGLE INDEX COUNT (mesh.triangles.length * 3)
  //   art_mesh.position_index_counts = RENDERING VERTEX COUNT (mesh.vertices.length)
  //   art_mesh.uv_begin_indices    = cumulative(position_index_counts * 2)
  //   art_mesh.position_index_begin_indices = cumulative(vertex_counts)
  //   counts[15] (UVS)             = sum(position_index_counts * 2)
  //   counts[16] (POSITION_INDICES) = sum(vertex_counts) = total flat indices
  //
  // In Hiyori: sum(vertex_counts) == counts[16] (POSITION_INDICES),
  //            uv_begin = cumul(position_index_counts * 2).
  // csmGetDrawableVertexCounts returns position_index_counts values.

  let totalUVs = 0;
  let totalFlatIndices = 0;
  let totalKeyformPositions = 0;

  const meshInfos = meshParts.map((part, mi) => {
    const mesh = part.mesh;
    // vertices is Array<{x, y}> — the rendering vertex count
    const renderVertCount = mesh.vertices ? mesh.vertices.length : 0;
    // triangles is Array<[i, j, k]> — flat index count = triangles * 3
    const flatIndexCount = mesh.triangles ? mesh.triangles.length * 3 : 0;

    const info = {
      renderVertCount,                          // → position_index_counts
      flatIndexCount,                           // → vertex_counts
      uvBeginIndex: totalUVs,                   // cumul(renderVertCount * 2)
      positionIndexBeginIndex: totalFlatIndices, // cumul(flatIndexCount)
      keyformPositionBeginIndex: totalKeyformPositions,
    };

    totalUVs += renderVertCount * 2;
    totalFlatIndices += flatIndexCount;
    totalKeyformPositions += renderVertCount * 2 * meshFrames[mi].length;

    return info;
  });

  counts[COUNT_IDX.PARTS] = numParts;
  counts[COUNT_IDX.DEFORMERS] = numWarpDeformers;
  counts[COUNT_IDX.WARP_DEFORMERS] = numWarpDeformers;
  counts[COUNT_IDX.ART_MESHES] = numArtMeshes;
  counts[COUNT_IDX.PARAMETERS] = numParams;
  counts[COUNT_IDX.PART_KEYFORMS] = numPartKeyforms;
  counts[COUNT_IDX.WARP_DEFORMER_KEYFORMS] = totalWarpKfs;
  counts[COUNT_IDX.ART_MESH_KEYFORMS] = numArtMeshKeyforms;
  // Keyform positions: art mesh verts + warp deformer grid points
  counts[COUNT_IDX.KEYFORM_POSITIONS] = totalKeyformPositions + totalWarpGridXYs;
  counts[COUNT_IDX.UVS] = totalUVs;
  counts[COUNT_IDX.POSITION_INDICES] = totalFlatIndices;

  // Binding system:
  //   Bands 0..M-1            : mesh bands (1 binding each)
  //   Bands M..M+P-1          : part null bands
  //   Bands M+P..M+P+W-1      : deformer null bands (deformer-level props, unused)
  //   Bands M+P+W..M+P+2W-1   : warp deformer real bands (grid keyform driver)
  const numBands = numArtMeshes + numParts + numWarpDeformers * 2;
  counts[COUNT_IDX.KEYFORM_BINDINGS] = meshBindingOrder.length + numBoundWd;
  counts[COUNT_IDX.KEYFORM_BINDING_BANDS] = numBands;
  counts[COUNT_IDX.KEYFORM_BINDING_INDICES] = meshBindingOrder.length + numBoundWd;
  counts[COUNT_IDX.KEYS] = meshBindingOrder.reduce((n,i) => n+meshFrames[i].length,0) + totalBoundWarpKfs;

  // Drawable masks: 1 dummy entry (SDK requires begin < total, can't use -1 with total=0)
  counts[COUNT_IDX.DRAWABLE_MASKS] = 1;

  // Draw order groups: 1 root group
  counts[COUNT_IDX.DRAW_ORDER_GROUPS] = 1;
  counts[COUNT_IDX.DRAW_ORDER_GROUP_OBJECTS] = numArtMeshes;

  // --- Part sections ---
  sections.set('part.ids', partNodes.map(p => p.id));
  // Parts use null bands (count=0) at indices after the mesh bands
  sections.set('part.keyform_binding_band_indices', partNodes.map((_, j) => numArtMeshes + j));
  sections.set('part.keyform_begin_indices', partNodes.map((_, i) => i));
  sections.set('part.keyform_counts', partNodes.map(() => 1));
  sections.set('part.visibles', partNodes.map(p => p.visible !== false));
  sections.set('part.enables', partNodes.map(() => true));
  sections.set('part.parent_part_indices', partNodes.map(p => {
    if (p.parent && partIdMap.has(p.parent)) return partIdMap.get(p.parent);
    return -1;
  }));

  // --- ArtMesh sections ---
  sections.set('art_mesh.ids', meshParts.map((p, i) => `ArtMesh${i}`));
  // Each mesh gets its own binding band (band i → mesh i)
  sections.set('art_mesh.keyform_binding_band_indices', meshParts.map((_, i) => i));
  sections.set('art_mesh.keyform_begin_indices', meshFrameBegins);
  sections.set('art_mesh.keyform_counts', meshFrames.map(f => f.length));
  sections.set('art_mesh.visibles', meshParts.map(p => p.visible !== false));
  sections.set('art_mesh.enables', meshParts.map(() => true));
  sections.set('art_mesh.parent_part_indices', meshParts.map(p => {
    if (p.parent && partIdMap.has(p.parent)) return partIdMap.get(p.parent);
    return 0; // default to first part
  }));
  sections.set('art_mesh.parent_deformer_indices', meshParts.map(p =>
    meshWdIndexMap.has(p.id) ? meshWdIndexMap.get(p.id) : -1
  ));
  sections.set('art_mesh.texture_indices', meshParts.map(p => regions.get(p.id)?.atlasIndex ?? 0));
  sections.set('art_mesh.drawable_flags', meshParts.map(() => 4)); // flag 4 like Hiyori
  // COUNTERINTUITIVE: position_index_counts = render vertex count, vertex_counts = flat index count
  sections.set('art_mesh.position_index_counts', meshInfos.map(m => m.renderVertCount));
  sections.set('art_mesh.uv_begin_indices', meshInfos.map(m => m.uvBeginIndex));
  sections.set('art_mesh.position_index_begin_indices', meshInfos.map(m => m.positionIndexBeginIndex));
  sections.set('art_mesh.vertex_counts', meshInfos.map(m => m.flatIndexCount));
  sections.set('art_mesh.mask_begin_indices', meshParts.map(() => 0)); // valid index (not -1)
  sections.set('art_mesh.mask_counts', meshParts.map(() => 0));

  // --- Parameter sections ---
  sections.set('parameter.ids', paramList.map(p => p.id));
  sections.set('parameter.max_values', paramList.map(p => p.max ?? 1));
  sections.set('parameter.min_values', paramList.map(p => p.min ?? 0));
  sections.set('parameter.default_values', paramList.map(p => p.default ?? 0));
  sections.set('parameter.repeats', paramList.map(() => false));
  sections.set('parameter.decimal_places', paramList.map(() => 1));
  // parameter.keyform_binding_begin_indices and parameter.keyform_binding_counts are set
  // after the warp deformer sections below, where parameter → binding ownership is resolved.

  // --- Part Keyform sections ---
  // Draw orders: all 500.0 (Hiyori pattern — actual order via draw_order_group_object)
  sections.set('part_keyform.draw_orders', partNodes.map(() => 500.0));

  // --- ArtMesh Keyform sections ---
  sections.set('art_mesh_keyform.opacities', meshParts.flatMap((p, i) => meshFrames[i].map(() => p.opacity ?? 1)));
  sections.set('art_mesh_keyform.draw_orders', meshParts.flatMap((p,i) => meshFrames[i].map(() => 500.0 + (p.draw_order ?? 0))));
  sections.set('art_mesh_keyform.keyform_position_begin_indices', meshInfos.flatMap((m, i) => meshFrames[i].map((_, k) => m.keyformPositionBeginIndex + k * m.renderVertCount * 2)));

  // --- Keyform positions (vertex coordinates in normalized model space) ---
  // Cubism SDK returns positions to Ren'Py which then multiplies by PPU in the shader:
  //   gl_Position = a_position.xy * u_live2d_ppu
  // So positions must be stored NORMALIZED: (pixelPos - origin) / PPU
  // This way position * PPU reconstructs pixel-space coordinates.
  // TRAPDOOR: canvasW/canvasH are declared at top of buildSectionData().
  // The `canvas` object is declared BELOW — never reference it here.
  // See docs/live2d-export/DECISIONS.md — this caused two identical crashes.
  const ppu = Math.max(canvasW, canvasH);
  const originX = canvasW / 2;
  const originY = canvasH / 2;
  const allKeyformPositions = [];
  for (const frames of meshFrames) {
    for (const vertices of frames) {
      for (const vert of vertices) {
        allKeyformPositions.push((vert.x - originX) / ppu);
        allKeyformPositions.push((vert.y - originY) / ppu);
      }
    }
  }

  // Warp deformer grid positions — appended after art mesh keyform positions.
  // Stored in PPU-normalized space (same as art mesh vertices).
  // Grid point order: row-major (row outer, col inner) matching WarpLatticeOverlay.
  const wdKfPosBegins = []; // flat index per warp-deformer keyform → begin offset in allKeyformPositions
  for (const { wd, col, row, gridPts, kfs, numKf } of wdInfo) {
    const gx = wd.gridX ?? 0;
    const gy = wd.gridY ?? 0;
    const gw = wd.gridW ?? canvasW;
    const gh = wd.gridH ?? canvasH;
    for (let ki = 0; ki < numKf; ki++) {
      wdKfPosBegins.push(allKeyformPositions.length);
      if (ki < kfs.length) {
        // Use authored keyframe positions
        for (let j = 0; j < gridPts; j++) {
          const pt = kfs[ki].value?.[j];
          if (pt) {
            allKeyformPositions.push((pt.x - originX) / ppu, (pt.y - originY) / ppu);
          } else {
            const c = j % (col + 1), r = Math.floor(j / (col + 1));
            allKeyformPositions.push(
              (gx + (col > 0 ? c * gw / col : 0) - originX) / ppu,
              (gy + (row > 0 ? r * gh / row : 0) - originY) / ppu,
            );
          }
        }
      } else {
        // Identity (rest) grid
        for (let r = 0; r <= row; r++) {
          for (let c = 0; c <= col; c++) {
            allKeyformPositions.push(
              (gx + (col > 0 ? c * gw / col : 0) - originX) / ppu,
              (gy + (row > 0 ? r * gh / row : 0) - originY) / ppu,
            );
          }
        }
      }
    }
  }
  sections.set('keyform_position.xys', allKeyformPositions);

  // --- Keyform binding system ---
  // Band layout:
  //   0..M-1        : mesh bands (1 real binding each)
  //   M..M+P-1      : part null bands
  //   M+P..M+P+W-1  : deformer null bands (deformer-level keyforms, unused)
  //   M+P+W..M+P+2W-1: warp deformer real bands (grid keyform driver via parameter)
  const bandBegins = [];
  const bandCounts = [];
  for (let i = 0; i < numArtMeshes; i++) { const binding = meshBindingIndex.get(i); bandBegins.push(binding ?? 0); bandCounts.push(binding === undefined ? 0 : 1); }
  for (let i = 0; i < numParts; i++) { bandBegins.push(0); bandCounts.push(0); }
  for (let i = 0; i < numWarpDeformers; i++) { bandBegins.push(0); bandCounts.push(0); } // deformer null
  for (let k = 0; k < numWarpDeformers; k++) {
    const bindPos = wdBindingPosMap.get(k); // position in sortedBoundWd, or undefined
    if (bindPos !== undefined) {
      bandBegins.push(numArtMeshes + bindPos); // points to binding M+bindPos
      bandCounts.push(1);
    } else {
      bandBegins.push(0); // unbound — null band
      bandCounts.push(0);
    }
  }
  sections.set('keyform_binding_band.begin_indices', bandBegins);
  sections.set('keyform_binding_band.counts', bandCounts);

  // Binding indices: mesh bindings 0..M-1, then warp deformer bindings M..M+W_bound-1
  const bindingIndices = meshBindingOrder.map((_,i) => i);
  for (let j = 0; j < numBoundWd; j++) bindingIndices.push(numArtMeshes + j);
  sections.set('keyform_binding_index.indices', bindingIndices);

  // Bindings: mesh bindings (1 key each) + warp deformer bindings (N keys each)
  let meshKeyCursor = 0; const keysBeginIndices = meshBindingOrder.map(i => { const begin = meshKeyCursor; meshKeyCursor += meshFrames[i].length; return begin; });
  const keysCounts = meshBindingOrder.map(i => meshFrames[i].length);
  let warpKeyCursor = numArtMeshKeyforms;
  for (const d of sortedBoundWd) {
    keysBeginIndices.push(warpKeyCursor);
    keysCounts.push(d.numKf);
    warpKeyCursor += d.numKf;
  }
  sections.set('keyform_binding.keys_begin_indices', keysBeginIndices);
  sections.set('keyform_binding.keys_counts', keysCounts);

  // Keys: art mesh keys (at first param default), then warp deformer keys (evenly spaced param range)
  const paramDefault = paramList[0]?.default ?? 0;
  const keyValues = meshBindingOrder.flatMap(i => { const frames = meshFrames[i], p = paramList[meshParamIndices[i]]; return frames.map((_, k) => frames.length > 1 ? (p.min ?? 0) + k * ((p.max ?? 1) - (p.min ?? 0)) / (frames.length - 1) : (p.default ?? 0)); });
  for (const d of sortedBoundWd) {
    const pMin = d.param.min ?? 0;
    const pMax = d.param.max ?? 1;
    for (let ki = 0; ki < d.numKf; ki++) {
      keyValues.push(d.numKf > 1 ? pMin + ki * (pMax - pMin) / (d.numKf - 1) : (d.param.default ?? pMin));
    }
  }
  sections.set('keys.values', keyValues);

  // --- Drawable masks (1 dummy entry) ---
  sections.set('drawable_mask.art_mesh_indices', [-1]);

  // --- UV data ---
  const allUVs = [];
  for (let mi = 0; mi < meshParts.length; mi++) {
    const part = meshParts[mi];
    const mesh = part.mesh;
    const region = regions.get(part.id);
    if (mesh.uvs && region) {
      // Remap UVs from full-PSD space to atlas space.
      // UV is normalized to full source image (0..1 over srcWidth × srcHeight).
      // 1. Convert UV to source pixel: srcPx = uv * srcSize
      // 2. Offset from crop origin: cropLocal = srcPx - cropOrigin
      // 3. Scale to atlas region: atlasLocal = cropLocal / cropSize * regionSize
      // 4. Add atlas position and normalize: finalUV = (regionPos + atlasLocal) / atlasSize
      for (let i = 0; i < mesh.uvs.length; i += 2) {
        const srcPxX = mesh.uvs[i] * region.srcWidth;
        const srcPxY = mesh.uvs[i + 1] * region.srcHeight;
        const localX = (srcPxX - region.srcX) / region.cropW * region.width;
        const localY = (srcPxY - region.srcY) / region.cropH * region.height;
        // Clamp to [0, 1] — mesh vertices can extend slightly outside crop
        // due to 2px dilation in mesh generation (contour.js)
        allUVs.push(Math.max(0, Math.min(1, (region.x + localX) / atlasSize)));
        allUVs.push(Math.max(0, Math.min(1, (region.y + localY) / atlasSize)));
      }
    }
  }
  sections.set('uv.xys', allUVs);

  // --- Position indices (triangle indices) ---
  const allIndices = [];
  for (const part of meshParts) {
    if (part.mesh?.triangles) {
      // triangles is Array<[i, j, k]> — flatten to flat index list
      for (const tri of part.mesh.triangles) {
        allIndices.push(tri[0], tri[1], tri[2]);
      }
    }
  }
  sections.set('position_index.indices', allIndices);

  // --- Draw order groups (Hiyori pattern) ---
  sections.set('draw_order_group.object_begin_indices', [0]);
  sections.set('draw_order_group.object_counts', [numArtMeshes]);
  sections.set('draw_order_group.object_total_counts', [numArtMeshes]);
  sections.set('draw_order_group.min_draw_orders', [1000]);
  sections.set('draw_order_group.max_draw_orders', [200]);

  // --- Draw order group objects ---
  // Render order: reverse of draw_order (highest draw_order = rendered first = behind)
  sections.set('draw_order_group_object.types', meshParts.map(() => 0)); // 0 = ArtMesh
  sections.set('draw_order_group_object.indices',
    meshParts.map((_, i) => numArtMeshes - 1 - i));
  sections.set('draw_order_group_object.group_indices', meshParts.map(() => -1)); // -1 like Hiyori

  // --- Deformer sections (all warp deformers; no rotation deformers for now) ---
  if (numWarpDeformers > 0) {
    sections.set('deformer.ids', wdNodes.map(n => n.id));

    // Deformer-level null bands: M+P+k
    sections.set('deformer.keyform_binding_band_indices',
      wdNodes.map((_, k) => numArtMeshes + numParts + k));

    sections.set('deformer.visibles', wdNodes.map(n => n.visible !== false));
    sections.set('deformer.enables', wdNodes.map(() => true));

    // Parent part: walk up from warp deformer's parent to find nearest group
    sections.set('deformer.parent_part_indices', wdNodes.map(wd => {
      let cur = wd.parent ? project.nodes.find(n => n.id === wd.parent) : null;
      while (cur) {
        if (cur.type === 'group' && partIdMap.has(cur.id)) return partIdMap.get(cur.id);
        cur = cur.parent ? (project.nodes.find(n => n.id === cur.parent) ?? null) : null;
      }
      return 0;
    }));

    // All warp deformers are root-level deformers (no nested deformer hierarchy for now)
    sections.set('deformer.parent_deformer_indices', wdNodes.map(() => -1));

    // type 0 = warp deformer, specific_index = position in warp_deformer table
    sections.set('deformer.types', wdNodes.map(() => 0));
    sections.set('deformer.specific_indices', wdNodes.map((_, k) => k));

    // --- Warp deformer sections ---
    const wdKfBegins = [];
    let wdKfCursor = 0;
    for (const { numKf } of wdInfo) {
      wdKfBegins.push(wdKfCursor);
      wdKfCursor += numKf;
    }
    // Warp deformer real bands: M+P+W+k
    sections.set('warp_deformer.keyform_binding_band_indices',
      wdInfo.map((_, k) => numArtMeshes + numParts + numWarpDeformers + k));
    sections.set('warp_deformer.keyform_begin_indices', wdKfBegins);
    sections.set('warp_deformer.keyform_counts', wdInfo.map(d => d.numKf));
    sections.set('warp_deformer.vertex_counts', wdInfo.map(d => d.gridPts));
    sections.set('warp_deformer.rows', wdInfo.map(d => d.row));
    sections.set('warp_deformer.cols', wdInfo.map(d => d.col));

    // --- Warp deformer keyform sections ---
    const wdKfOpacities = [];
    const wdKfPosBeginsFlat = [];
    let flatKfIdx = 0;
    for (const { numKf } of wdInfo) {
      for (let ki = 0; ki < numKf; ki++) {
        wdKfOpacities.push(1.0);
        wdKfPosBeginsFlat.push(wdKfPosBegins[flatKfIdx++]);
      }
    }
    sections.set('warp_deformer_keyform.opacities', wdKfOpacities);
    sections.set('warp_deformer_keyform.keyform_position_begin_indices', wdKfPosBeginsFlat);
  }

  // --- Parameter keyform binding ownership ---
  // param[0] owns art mesh bindings [0..M-1].
  // Each native parameter that drives a warp deformer owns its binding [M+j].
  const paramBindingBegins = paramList.map(() => 0);
  const paramBindingCounts = paramList.map(() => 0);
  for (const [bindingIndex,meshIndex] of meshBindingOrder.entries()) { const p = meshParamIndices[meshIndex]; if (!paramBindingCounts[p]) paramBindingBegins[p] = bindingIndex; paramBindingCounts[p]++; }
  // Assign warp deformer bindings to their parameters (contiguous per param, ensured by sort)
  for (let j = 0; j < sortedBoundWd.length; j++) {
    const pIdx = sortedBoundWd[j].paramIdx;
    if (pIdx >= 0 && pIdx < paramList.length) {
      if (paramBindingCounts[pIdx] === 0) paramBindingBegins[pIdx] = numArtMeshes + j;
      paramBindingCounts[pIdx]++;
    }
  }
  sections.set('parameter.keyform_binding_begin_indices', paramBindingBegins);
  sections.set('parameter.keyform_binding_counts', paramBindingCounts);

  // --- Canvas info ---
  // WARNING: `canvas` is declared late. All code above MUST use canvasW/canvasH
  // (declared at top of buildSectionData), NOT canvas.* — JS const is not hoisted.
  // This caused two identical "Cannot access before initialization" crashes.
  const canvas = {
    pixelsPerUnit: Math.max(canvasW, canvasH),
    originX: canvasW / 2,
    originY: canvasH / 2,
    canvasWidth: canvasW,
    canvasHeight: canvasH,
    canvasFlag: 0,
  };

  return { sections, counts, canvas };
}


// ---------------------------------------------------------------------------
// Main writer
// ---------------------------------------------------------------------------

/**
 * Generate a .moc3 binary ArrayBuffer from project data.
 *
 * @param {Moc3Input} input
 * @returns {ArrayBuffer}
 */
export function generateMoc3(input) {
  const { sections, counts, canvas } = buildSectionData(input);

  // V4.00 matches Hiyori reference — confirmed working with Ren'Py 8.5 Cubism SDK
  const version = MOC_VERSION.V4_00;

  // Phase 1: Write body sections, record offsets
  const body = new BinaryWriter();
  const sotEntries = [];

  // SOT[0] — Count Info
  sotEntries.push(DEFAULT_OFFSET + body.pos);
  for (const c of counts) body.writeI32(c);
  // Pad to COUNT_INFO_SIZE
  body.fill(COUNT_INFO_SIZE - counts.length * 4);

  // SOT[1] — Canvas Info
  sotEntries.push(DEFAULT_OFFSET + body.pos);
  body.writeF32(canvas.pixelsPerUnit);
  body.writeF32(canvas.originX);
  body.writeF32(canvas.originY);
  body.writeF32(canvas.canvasWidth);
  body.writeF32(canvas.canvasHeight);
  body.writeU8(canvas.canvasFlag);
  body.fill(CANVAS_INFO_SIZE - (5 * 4 + 1));

  // SOT[2..] — Body sections
  for (const [name, elemType, countIdx, alignment] of SECTION_LAYOUT) {
    // Align if needed
    if (alignment > 0) body.padTo(alignment);

    sotEntries.push(DEFAULT_OFFSET + body.pos);

    const data = sections.get(name) ?? [];
    const count = elemType === ELEM.RUNTIME
      ? (countIdx >= 0 ? counts[countIdx] : 0)
      : data.length;

    writeSection(body, elemType, data, count);
  }

  // V3.03+ additional section: quad_transforms (Bool32 per warp deformer).
  // false = bilinear interpolation (default). true = quad (affine patch).
  if (version >= MOC_VERSION.V3_03) {
    body.padTo(ALIGN);
    sotEntries.push(DEFAULT_OFFSET + body.pos);
    const numWd = counts[COUNT_IDX.WARP_DEFORMERS];
    for (let i = 0; i < numWd; i++) body.writeI32(0); // false — bilinear
  }

  // Phase 2: Assemble header + SOT + padding + body
  const out = new BinaryWriter();

  // Header (64 bytes)
  out.writeU8(MAGIC[0]); out.writeU8(MAGIC[1]); out.writeU8(MAGIC[2]); out.writeU8(MAGIC[3]);
  out.writeU8(version);  // version
  out.writeU8(0);        // endian flag (0 = LE)
  out.fill(HEADER_SIZE - 6); // padding

  // SOT (160 x uint32) — fill remaining with the last valid offset (not 0!)
  // SDK validates that SOT entries for the current version are non-zero valid offsets.
  const lastValidOffset = sotEntries[sotEntries.length - 1] || DEFAULT_OFFSET;
  while (sotEntries.length < SOT_COUNT) sotEntries.push(lastValidOffset);
  out.writeU32Array(sotEntries.slice(0, SOT_COUNT));

  // Pad to DEFAULT_OFFSET
  out.fill(DEFAULT_OFFSET - out.pos);

  // Append body
  const bodyBuf = body.toArrayBuffer();
  const bodyBytes = new Uint8Array(bodyBuf);
  for (const b of bodyBytes) out.writeU8(b);

  // Final 64-byte alignment.
  // All SOT entries now point to valid offsets (filled with lastValidOffset above).
  // SDK requires SOT offsets <= file_size, so we pad to ensure the file extends
  // past the last referenced offset.
  out.padTo(ALIGN);

  return out.toArrayBuffer();
}

/**
 * Write a single section's data.
 *
 * @param {BinaryWriter} w
 * @param {object} elemType - One of the ELEM constants
 * @param {any[]} data
 * @param {number} count
 */
function writeSection(w, elemType, data, count) {
  if (elemType === ELEM.RUNTIME) {
    w.fill(count * RUNTIME_UNIT_SIZE);
  } else if (elemType === ELEM.I32) {
    w.writeI32Array(data);
  } else if (elemType === ELEM.F32) {
    w.writeF32Array(data);
  } else if (elemType === ELEM.I16) {
    w.writeI16Array(data);
  } else if (elemType === ELEM.U8) {
    w.writeU8Array(data);
  } else if (elemType === ELEM.BOOL) {
    w.writeBoolArray(data);
  } else if (elemType === ELEM.STR64) {
    w.writeStringArray(data);
  }
}
