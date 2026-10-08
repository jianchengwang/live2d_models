# Embeddable Live2D companion

`studio/` is a static generator: select an existing moc3 entry, configure placement/chat/voice, preview the floating companion, then copy an embed snippet or download a bootstrap JS/code ZIP. `advanced.html` retains catalog diagnostics, action inspection and the honest manual image-to-model pipeline. The 14 legacy moc entries remain in that advanced catalog.

`v2/widget.js` exports `createLive2DWidget`. Each companion owns a Shadow DOM chat panel, renderer iframe, session credentials, requests and audio. `setModel`, `setAppearance`, `open` and `dispose` let a host control it. Mesh bounds determine default contain/center; zoom and offsets deliberately allow custom framing. The renderer reports mouth parameters and uses actual audio RMS for an owned TTS audio endpoint; device speech synthesis provides explicitly approximate mouth movement. Voice availability and microphone recognition depend on the browser. Microphone recognition starts only from its button.

The default export contains only authored component code, public configuration and an example. Models stay at their existing complete model3.json URL, and Core/renderer stay at existing runtime URLs. A local imported package is included only after the visitor separately confirms deployment rights; it never reaches this repository or a server. Deploy exported files over HTTP/HTTPS. Cross-origin components/resources require CORS and the host's CSP to permit them. Direct chat asks for a trusted endpoint and a session key at runtime; own-backend mode sends no browser Authorization header. No key field is included in exported configuration.

Open `/live2d_models/studio/` on the existing GitHub Pages site, or use the prominent “打开 Live2D Studio 模型工作台” link above the original homepage viewer. That relative `./studio/` link also works at `/` and nested deployment bases. The application uses static HTML, CSS, ES modules and catalog JSON; there are no runtime `/api/session`, `/api/catalog` or `/api/import` endpoints. Imports execute in a browser worker, models remain in Blob URLs, and BYOK calls go directly to the visitor's explicitly selected trusted HTTPS provider. Keys stay in memory and are cleared on refresh or explicit reset. CORS failures are shown without using public proxies.

The isolated iframe keeps the original same-site renderer and uses the original Core for MOC3 versions 1–3. Versions 4–5 use the official Cubism 5.2 hosting branch recorded in `v2/runtime.json`, with a tested SHA-384 integrity pin; no new Core binary is included. Catalog model references retain their existing asset URLs. Legacy moc entries are indexed; moc3 preview reports compatibility failures. Motion compatibility is an explicit option that changes allocation counts only in renderer memory. Local imports, motions, expressions, model switching and stream cancellation release their resources.

Image-to-model stages describe manual layer review, Editor rigging/export and validation of a real model package. They do not automatically produce moc3 or invoke a host CLI.

See [PUBLISHING.md](./PUBLISHING.md) for the authorized publication scope and preservation constraints. The offline Python catalog utilities are audit/test tools only. Run `node --test studio/tests/*.test.mjs` and `python3 -B -m unittest discover -s studio/tests -p 'test_*.py' -v` from the repository root. `python3 -B tools/build.py --site-addition --source .` builds the code addition plus the recorded homepage entry. It checks every original frozen path, allowing only the exact homepage revision recorded in `catalog/homepage-entry.json`; `catalog/frozen-files.json` remains unchanged. Never deploy that artifact as the complete old site.

See [compatibility and verification](COMPATIBILITY.md) for the exact runtime audit, remaining texture limits and browser verification checklist.

## Chat configuration and expanded layout

The launcher expands into one workspace: Live2D on the left and chat on the right. Narrow containers stack the character above chat; settings use their own scrolling area. Escape leaves settings first, then collapses chat and restores focus to the launcher. Enter sends, Shift+Enter inserts a newline, and IME composition never submits.

Demo replies require explicit `chat.mode: 'mock'`. Missing, cleared or invalid provider settings block sending instead of falling back to demo. HTTP/CORS/SSE errors remain visible and do not change the provider. Session keys stay in the Conversation instance only. Appearance and voice changes do not reset the configured conversation; changing the provider revokes its old session. Model switches, prompt changes and clearing chat cancel in-flight work and reset history; stale responses cannot repopulate the new conversation.

Set `chat.systemPrompt` (up to 12,000 characters) in the generator or runtime settings. It is sent as the first system message on every request and is part of the public configuration, so it must not contain secrets. Runtime Apply synchronizes public chat settings back into the generator. Download/import JSON preserves public appearance, model, LLM and voice settings while ignoring credentials, trust flags, history and unknown fields. Imported direct mode always needs a new session key and endpoint confirmation. API keys are never included in snippets, bootstrap JS or ZIP exports.

Automated chat tests use synthetic fetch responses and a DOM harness; they do not call a real provider or establish real-provider account validity. Actual desktop/mobile rendering and browser microphone/audio behavior still require browser QA.


## 我的角色与公开配置保存

生成器默认只展示少量常用角色。打开“管理常用角色”勾选仓库模型，按“保存选择”生效；取消保留原列表，不能保存空列表。每个角色按完整模型 URL 标识，名称和 system prompt 独立保存，改名不会改变模型资源路径。角色切换会取消旧回复并清空会话历史，所选可信供应商的内存会话凭据保持有效。

名称、prompt、常用列表、当前角色、外观、公开供应商参数和声音配置经过白名单后保存在浏览器 `live2d-studio-public-v1`。生成器可刷新恢复，也可下载/导入配置 JSON。角色设定是公开配置，请勿放入隐私。API key、信任授权、聊天记录、回调及本地 Blob 模型不会持久化；刷新或配置导入后 BYOK 需重新输入密钥并确认 endpoint。浏览器禁用存储时当前页仍可编辑和下载配置。

新配置在 `models[]` 中附带各自的 `systemPrompt`；`allowSwitch` 控制是否显示切换器，关闭切换不会删除其他已保存角色。旧配置可继续导入，选中角色继承旧的标题和 prompt，其他角色的 prompt 为空。ZIP 与引导 JS 都保留角色名单及独立 prompt，仍不复制仓库模型或 Core。

发送未配置的消息仅显示说明并保留草稿，不自动打开设置，也不自动回复 mock。设置只有按“应用对话设置”才改变有效会话；取消、Escape 或关闭聊天会丢弃未应用的修改。无效的 Apply 会撤销旧凭据并明确报错。显式选择本地演示仍可用于无网络体验。

展开、收起或调整屏宽时，iframe 内的 WebGL viewport 与 canvas drawing buffer 同步更新，避免保留旧 viewport 造成角色拉伸。原模型、纹理和旧 renderer/Core 字节不改。


## Lightweight mesh editor

Open `mesh-editor.html` from the Studio header. Import a local flat PSD or PNG, select a layer, create a parameter, and edit its 0/1 mesh endpoints with a preset or direct vertex dragging. The slider interpolates real textured triangle vertices. Layer visibility, opacity and draw order are editable; Undo/Redo covers geometry, bindings, parameter definitions and layer settings. Download the self-contained `.mesh2d.json` project, reopen it to continue editing, or select it in `mesh-player.html`. That player uses the same `createLive2DWidget` and `Live2DViewer` as the existing companion. Studio's complete-model URL field also accepts a hosted `.mesh2d.json` URL with CORS. The format embeds textures; local file import makes no upload request and does not persist private pixels in browser storage.

This first version supports PSD v1, 8-bit RGB, flat normal-blend pixel layers with Raw or PackBits compression. It rejects PSB, groups, layer masks, clipping layers, effects, unsupported blending and ZIP-compressed channels. Import order can be reversed manually after checking the image. The editor supports at most 64 layers and 16 parameters, with normalized 0–1 ranges and two endpoint shapes per layer/parameter. Multiple parameter offsets are added to the rest mesh. It has no rotation/warp hierarchy, automatic character segmentation, full facial rigging, texture atlas authoring, CMO3 or MOC3 export. Blink/mouth presets squash or stretch existing pixels; they do not paint missing closed-eye or open-mouth artwork.

`.mesh2d.json` version 1 uses `format: "studio-mesh2d"`, canvas `width`/`height`, `parameters`, and `layers`. Each layer contains an embedded PNG, texture dimensions, visibility/opacity, triangle `mesh.positions`/`uvs`/`indices`, and parameter `bindings` with two `{value, positions}` keys at 0 and 1. Imports validate dimensions, index bounds, declared parameters, embedded PNG-only textures and decode budgets. The mesh renderer loads no Cubism Core or external library. Existing MOC3 models retain their original renderer path.

`mesh-demo.js` generates an original geometric character for public demonstration. No private character pixels or project are distributed. Stretchy Studio (MIT, audited at commit `24a83a27ba43e43e9d2e3de5e33994594e6199c2`) was reviewed as a candidate; none of its source or dependencies is incorporated or executed here. The small PSD reader is authored against [Adobe's file-format specification](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/), and the new editor/renderer code uses this repository's MIT license. The separate existing Cubism runtime's recorded license conditions still apply to MOC3 playback.


## Move, scale and preview the current project

The editor defaults to **整层变换**. Drag within the selected layer's outline to move it; drag white handles to scale, with **锁定宽高比** enabled by default. **网格点编辑** supports blank-area marquee selection, Shift-click to add/remove points, group dragging and selection scaling. Arrow keys move the selection; Shift uses a larger step. Undo/Redo supports buttons and Cmd/Ctrl-Z / Shift-Cmd/Ctrl-Z.

**基础姿态（同步所有端点）** applies the same geometry transform to the rest mesh and every key, preserving existing parameter deformation. **当前参数端点** edits only the selected 0/1 key. Intermediate slider values are preview only and cannot silently be edited as a key. Reset explicitly restores the imported layer including its keys, or restores just the current endpoint to the rest mesh, according to the selected edit target; either operation can be undone.

Raw PSD/PNG import displays the actual artwork. Identical or missing endpoint shapes are reported as static. **一键呼吸并预览** adds a small breathing shape to a visible body/clothing layer when identifiable, otherwise the selected visible layer; it preserves an existing effective breathing rig. Presets do not infer segmentation or facial artwork.

**网页播放** sends a validated snapshot of the current in-memory project, including unsaved edits, to the player through a random same-origin BroadcastChannel. It uses no server upload or browser storage. Keep the editor open until the player confirms receipt. A handoff failure reports an error and leaves the editor project intact; it does not select the public demo. The player also accepts saved mesh2d JSON, marks unbound/static parameters, hides unavailable blink controls and shows real parameter values from its renderer. Manual parameter input pauses the corresponding auto control. An unbound project can add basic breathing in the player and download a separate bound project. The public geometric demo is loaded only by an explicit demo button.

These controls edit the repository's self-contained **studio-mesh2d v1 webpage format**. They do not edit/export standard Cubism MOC3 or CMO3. The existing Studio MOC3 playback remains supported.
