# 卡頓調查與 three.js 升級規劃（2026-11-05）

## 一、量測方式

- 建置版 `dist/mech-cordon.html`（main 7717788），headless Edge＋顯示卡算繪（ANGLE D3D11），1600×900、像素比 1，貨運集散場，預設畫質（SSAO 開）。
- 腳本：新存檔 → 出擊 → 往前走、射擊、QB，每 5 秒把玩家移到最近的敵人旁邊並擊破兩台（觸發擊破特效、增援）。
- 逐格記錄：`loop` 的 CPU 時間與兩格的間隔、各段耗時（包裝 Game 的方法與管線的各段）、`renderer.info` 的程式／幾何／貼圖數量變化、JS heap 下降（GC）；包裝 `gl.linkProgram`／`getProgramParameter` 記下每次著色器連結的耗時與關鍵的 define；CDP 的 CPU 取樣與記憶體配置取樣（含已回收的物件）；把 three.js 換成未壓縮版、在 `setProgram` 記錄每次呼叫 `getProgram` 的原因。
- 腳本在 `C:\Users\loren\AppData\Local\Temp\claude\…\scratchpad\`（hitch-probe.js、probe2～4.js），第 0 期會整理成 `scripts/perf-probe.js`。

## 二、結果摘要

| 項目                     | 數值                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| 每格 CPU（loop）         | p50 18.2 ms、p90 25.7 ms、p99 39.4 ms                                                       |
| 任務中最長的影格         | 2515 ms、1105 ms、726 ms、348 ms、293 ms（出擊第一格 3050 ms）                              |
| 著色器連結               | 整段 143 個、合計 12.4 秒；單個 150～425 ms，原始碼約 74 KB                                 |
| `getProgram`（不必要的） | 300 格 24,457 次（每格約 80 次）                                                            |
| JS 記憶體配置            | 約 52 MB／秒（45 秒內 GC 回收約 2 GB，64 次明顯的回收）                                     |
| 場景                     | 4461 個物件、2759 個網格（可見 1962）、747 個材質、1307 個投射陰影、4314 個每格自動更新矩陣 |
| 出擊載入                 | 8 秒（其中第一格約 3 秒是著色器編譯）                                                       |

## 三、卡頓的原因（依影響排序）

### 1. 著色器在戰鬥中才編譯（最嚴重：0.3～2.5 秒的凍結）

- 長影格全部對得上「這一格有新的著色器程式」：例如擊破第一批敵人那格 prog +10、2.5 秒；之後 +4、1.1 秒；+3、0.7 秒。
- 每個程式 150～425 ms。原因：所有 `MeshStandardMaterial` 共用渲染風格的著色器（`render/style/shader.js` 的 `onBeforeCompile`），原始碼約 74 KB，ANGLE 要把 GLSL 轉成 HLSL 再交給 D3D 編譯，很慢。
- 變體多：同一份風格著色器依 `FLAT_SHADED`、`DOUBLE_SIDED`、`USE_COLOR`、`USE_MAP`／`USE_NORMALMAP`、`USE_SKINNING`、`USE_INSTANCING`、`MeshPhysicalMaterial`、霧、光源數各組合各編一份（整段 143 個）。`flatShading: true` 就有 35 處。
- 沒有預熱：程式裡沒有 `renderer.compile`；r128 的編譯是同步的（`checkShaderErrors` 開著，連結後立刻查狀態），第一次畫到某個變體的那一格就整個停住。
- 觸發點：第一次擊破（碎片、殘骸、焦痕的材質）、第一次出現某種敵人／Boss 部位、第一次某種特效、增援波次帶來新的模型。

### 2. 每格約 80 次不必要的 `getProgram`（每格的 CPU 與大量記憶體配置）

- 軟粒子（`pipeline.js` 的 `renderSoft`）第二次算繪把鏡頭的圖層設成只看 `FX_LAYER`；three.js 只收集鏡頭圖層看得到的光源，所以這一次「沒有光源」，`lights.state.version` 改變，下一格主場景又改回來。
- 結果：每個受光的材質每格都被判定「光源變了」→ `getProgram` 重新產生參數表與程式快取鍵（約 60 個欄位串成字串），雖然最後找到快取不會重編，但每格約 80 次，佔了 JS 記憶體配置的約四分之一。
- SSAO 的法線（`renderNormals`）用同一個覆蓋材質畫 `InstancedMesh` 與一般網格，兩者切換也會每次 `getProgram`。
- 這一點升級 three.js 不會消失（新版的判斷邏輯相同），要自己修。

### 3. GC（每隔一段時間 25～35 ms 的小卡頓）

約 52 MB／秒的配置，主要來源：

| 來源                                                          | 比例   |
| ------------------------------------------------------------- | ------ |
| three.js 的 `getProgram`（上一項）                            | 約 25% |
| 地圖上的小人：`crowdTick` → `World.collide`、`hypot`          | 約 15% |
| 敵人 AI：`move`／`collide`／`senseIdle`／`updateAI`           | 約 10% |
| 鏡頭遮擋 `updateOcclusion`（每格 `new Set`、查表）            | 約 9%  |
| `destructibles()` 每次組新陣列                                | 約 3%  |
| SSAO 法線的 `traverseVisible` 閉包、`reticlePoint` 的地形射線 | 數 %   |

### 4. 穩態的 CPU 負擔（平均影格偏重，讓偶發的負擔更容易掉幀）

- `renderMain` 平均 16 ms（loop 18 ms 中的大部分），主要是 three.js 送出繪製的 CPU 成本。
- 每格走訪整個場景約 4 次：主場景、軟粒子第二次、陰影貼圖、SSAO 法線（水面高畫質再加一次平面反射）。`projectObject`＋陰影的 `renderObject`＋`updateMatrixWorld`＋視錐判定約佔 CPU 取樣的 20%。
- 4461 個物件裡 4314 個每格重算世界矩陣，大部分是不會動的地圖物件。
- 1307 個網格投射陰影，陰影貼圖每格重畫。

### 5. 其他觀察

- 文字演出 `tfxTick` 偶爾一格 10～16 ms（APNG 引擎畫到畫布）。
- 擊破時碎片產生大量幾何（一格 +200～400 個），之後陸續釋放（每格 −2～−15），伴隨 20～40 ms 的影格，推測是 GPU 端的上傳與爆炸、煙霧的填充率（無法在瀏覽器裡量 GPU 時間，待第 0 期以關掉特效比較確認）。

## 四、升級 three.js 的評估

### 版本

- 目前 r128（2021），最新 r187（2026-10-30），相差 59 版。

### 升級真正能帶來的效能

| 功能                                                              | 版本          | 對本專案                                                              |
| ----------------------------------------------------------------- | ------------- | --------------------------------------------------------------------- |
| `renderer.compileAsync`＋`KHR_parallel_shader_compile`            | r158 起       | **最重要**：載入時在背景執行緒編譯所有變體、不卡畫面，直接對應第 1 項 |
| `BatchedMesh`（不同幾何、同一材質合成一次繪製，可個別隱藏／刪除） | r159 起       | 地圖物件數千個網格可以大幅減少繪製次數；可破壞物件仍能個別處理        |
| `matrixWorldAutoUpdate`、屬性與貼圖的部分更新 `addUpdateRange`    | r144／r159 起 | 不動的物件不算矩陣、粒子只上傳改過的部分                              |
| KTX2／Basis 壓縮貼圖                                              | 已有          | GLB 貼圖上傳更快、顯示記憶體更少                                      |
| 只支援 WebGL2、內部的各種最佳化                                   | r163 起       | 小幅                                                                  |

**不會自動變快的部分**：第 2 項（光源版本抖動）、第 3 項（GC 是遊戲程式）、著色器的大小與變體數，升級後一樣存在。「最新版效能比較好」對這個專案的意思是：多了幾個好工具，要改程式才拿得到；單純換版本，影格時間不會明顯變好。

### 會碰到的破壞性變更（依本專案實際用到的）

1. **載入方式**：`examples/js`（r148）、UMD 的 `build/three.js`（r160）、`three.min.js`（r186）都已移除，只剩 ES module。為了維持「全域 `THREE`、`lib/` 不內嵌、file:// 可開、IIFE 的一般 `<script>`」的規則：建置時用 esbuild 把 `three.module.js`＋用到的 addons（GLTFLoader、DRACOLoader、SkeletonUtils、RoundedBoxGeometry、EffectComposer 系列、UnrealBloomPass、SSAOPass、FXAA／Copy／SSAO 等 shader、SimplexNoise；模型庫另加 OrbitControls、TransformControls、GLTFExporter）打包成 `dist/lib/three/three.js`，掛成 `window.THREE`，`src/index.html` 與 `src/library/index.html` 的 script 標籤改指這一份。
2. **色彩管理（r152）**：`ColorManagement.enabled` 預設開啟，`Color.set(hex)` 會從 sRGB 轉成線性。專案多處假設「r128 的 `Color.set(hex)` 不做轉換」（`PALETTES.white` 是線性值、內建機甲的灰階換色）。`outputEncoding`→`outputColorSpace`、`texture.encoding`→`colorSpace`（`sRGBEncoding` 11 處、`.encoding` 9 處）。
3. **光照單位（r155，r165 移除舊模式）**：方向光／半球光／環境光／點光／聚光的強度意義改變，點光源預設衰減 2。27 處燈光、各主題的 `sunI`／`hemiI`、火光、閃光都要重調。
4. **色調映射**：新版畫到 render target 時不套用色調映射與輸出色彩空間（只在畫到畫面時套）。我們的管線先畫到 `rtScene` 再做後處理，所以色調映射與 sRGB 轉換要移到調色 pass 自己做（類似 `OutputPass`）。附帶的好處是 bloom 可以在線性 HDR 上做（場景 RT 改半浮點）。
5. **著色器 chunk**：`GeometricContext` 移除（`RE_Direct` 的參數改成 `geometryPosition`／`geometryNormal`／`geometryViewDir`…）、`encodings_fragment`→`colorspace_fragment`、`output_fragment`→`opaque_fragment`、貼圖座標改成每張貼圖自己的 `vMapUv` 等、`uv2`→`uv1`＋`aoMap.channel`。`render/style/shader.js` 的 `RE_Direct_Style` 與對 `lights_fragment_begin`、`normal_fragment_maps`、`map_fragment` 的改寫要重寫；22 個 `ShaderMaterial` 逐一檢查；GLB 貼花的 `ST_DECAL`；編輯器的 AO 貼圖（`uv2` 5 處）。
6. **其他 API**：`Scene.autoUpdate`→`matrixWorldAutoUpdate`（管線靠它只算一次世界矩陣）、`RGBFormat` 移除、`material.skinning` 移除（6 處）、`PCFSoftShadowMap` 在 r182 標成棄用（改用已經是柔邊的 `PCFShadowMap`）、`Clock` r183 棄用、GLTFLoader 的 `parser.associations` 格式、GLTFExporter 的參數、`SSAOPass` 的內部（管線借用它的法線與 AO 材質）、`SkeletonUtils` 改成函式。
7. **多人**：各端必須同一版本（子彈發射點依模型），升級要提高 `NET_VERSION`。
8. **不受影響**：貼圖繪製 `mech_cordon_paint/` 自帶 r128，可以不動；文字動畫 APNG 不用 three。

### 風險

- 畫面會整體改變：5 個內建渲染風格 × 13 個主題都要截圖比對（`testStyleThemes` 的亮度檢查）、機甲配色、GLB 貼花、水面、雲海、粒子。
- 自訂的後處理管線與 SSAO 借用的內部最容易壞。
- 範圍大：`THREE.` 用在 178 個檔案；完整 `npm test` 是最後的保障。

### WebGPU＋TSL 方案的評估

**做法**：改用 `WebGPURenderer`（有 WebGPU 時用 WebGPU，否則退回 WebGL 2 的後端），材質改成節點材質，著色器改用 TSL（以 JavaScript 寫、編譯成 WGSL／GLSL），後處理改用 `PostProcessing`＋節點（內建 GTAO、bloom、動態模糊、景深、輪廓等節點）。

**要重寫的範圍**（官方手冊：`ShaderMaterial`、`RawShaderMaterial` 與 `onBeforeCompile` 在 WebGPURenderer 都不支援）：

| 部分                         | 現況                                                                                                                                                      | 換成 TSL                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 渲染風格的著色器             | `render/style/shader.js` 以 `onBeforeCompile` 改所有標準材質（色階光照、影色、邊緣光、金屬反光帶、高度霧、水彩、貼花）                                    | 自訂的光照模型（`LightingModel`）＋每個材質的節點；所有 `MeshStandardMaterial` 換成 `MeshStandardNodeMaterial` |
| 後處理管線                   | `render/style/pipeline.js` 10 段 GLSL（合成、描線、動態模糊、調色、FXAA、景深、熱扭曲、光束、深度拷貝、比較），借用 SSAOPass 的內部                       | 整條改寫成節點的 `PostProcessing`（MRT 一次輸出顏色＋法線＋深度，SSAO 改 GTAO 節點，不用再畫一次法線）         |
| 其他自訂著色器               | 約 53 段 GLSL：顯示卡粒子 `fx/gpu.js`、噴流、帶狀軌跡、水面（模擬、焦散、表面）、雲海、天空與塵埃、天氣、全像戰略桌、六角護盾、描邊、邊界線、過場的場景…… | 逐一改寫成 TSL；粒子與水波模擬可以改用計算著色器                                                               |
| GLB 貼花、陣營換色、遮擋淡出 | 靠材質的 uniform 與 define                                                                                                                                | 節點的 uniform                                                                                                 |
| 模型庫、GLB 編輯器           | 同一套材質與管線                                                                                                                                          | 一起改；貼圖繪製 `mech_cordon_paint/` 可以留在 r128                                                                |

**好處**：

- WebGPU 的繪製提交與狀態切換比 WebGL 便宜，計算著色器可以把粒子、水波模擬、小人的動畫、剔除搬到顯示卡。
- 管線預先建立（render pipeline 的非同步編譯），理論上可以徹底避免戰鬥中的編譯卡頓。
- TSL 寫一次、兩種後端都能用；節點的後處理用 MRT，少畫一次場景（現在的 SSAO 法線那一次）。
- three.js 新功能（GTAO、SSR、體積霧、新的陰影）主要都在這條線上開發。

**壞處與風險**：

- **幾乎等於重做整個渲染**：自訂著色器 53 段＋風格著色器＋後處理管線全部改寫，工作量是升級 r187（第 1 期）的數倍；畫面一定會變，5 種風格 × 13 個主題、過場、作戰室、格納庫全部要重新調。
- **效能不一定更好**：論壇上有人回報同一個場景 WebGL 比 WebGPU 快 2～4 倍（r181），也有 WebGPURenderer 在繪製次數多的場景有效能問題的討論；維護者自己也說換渲染器不會白白變快。這個專案的瓶頸是著色器編譯、GC、繪製次數，換 WebGPU 只對最後一項有幫助，而那一項用 `BatchedMesh` 在 WebGL 也能解決。
- **退回 WebGL 2 時**：沒有 WebGPU 的環境（部分瀏覽器與平台、舊的內顯驅動）走 WebGPURenderer 的 WebGL 後端，效能與相容性不如成熟的 `WebGLRenderer`。官方手冊仍然建議純 WebGL 2 的應用使用 `WebGLRenderer`。
- **測試環境**：冒煙測試的 headless Edge 需要確認 WebGPU 能用；SwiftShader 只有 WebGL，`SMOKE_GPU=0` 時只能測 WebGL 後端。
- **多人**：子彈發射點依模型計算，各端照舊一致，不受影響；但新舊版畫面差很多，要提高 `NET_VERSION`。
- 現有的眼動追蹤（MediaPipe 用 WebGL）、文字演出（2D 畫布）不受影響。

**結論**：目前**不採用**。理由是量到的卡頓原因都不需要 WebGPU 就能解決，而 WebGPU＋TSL 的成本最高、畫面風險最大、效能收益不確定。等第 0～3 期做完、繪製次數仍然是瓶頸，或要做計算著色器才做得出來的效果（大量粒子的物理、顯示卡上的群體動畫）時再評估。到時候可以從**新的效果先用 TSL 寫**、`WebGPURenderer` 以 `forceWebGL` 測相容，逐步搬移，而不是一次換掉。

## 五、建議的方案與分期

原則：**先在 r128 修掉量到的原因（快、風險小、效果最大），再升級拿非同步編譯與 BatchedMesh**。每期前後用同一支量測腳本比較長影格、著色器編譯、`getProgram` 次數與配置量。

### 第 0 期：不升級，先修（預估效果最大）

1. **量測工具**：整理成 `scripts/perf-probe.js`（長影格與當格事件、著色器連結紀錄、`getProgram` 原因、CPU／配置取樣，`--map`、`--secs`、`--compare`）。
2. **光源版本抖動**：場景裡的光源也打開 `FX_LAYER`（軟粒子那一次的光源數和主場景相同），SSAO 法線對 `InstancedMesh` 用另一個覆蓋材質。預期每格 80 次 `getProgram` 歸零、配置量少約四分之一。
3. **著色器預熱**：出擊／轉場／Boss 關開場時，在轉場畫面還蓋著的時候建一個預熱場景：這一場會出現的敵人類型（含增援、Boss 與部位）、擊破的碎片與殘骸、掉落物、主要特效、陰影的深度材質，各放一份在鏡頭前，`renderer.compile` 後畫一格到小的 render target，再丟掉。把 0.3～2.5 秒的凍結移到載入時間。
4. **減少變體**：`flatShading` 的 35 處改成在幾何上烘好面法線（非索引＋面法線），不再產生 `FLAT_SHADED` 變體；檢查 `DOUBLE_SIDED`、`MeshPhysicalMaterial` 是否必要。目標把整段的程式數從 143 降到一半以下。
5. **GC 熱點**：小人的碰撞、敵人 AI 的移動與碰撞、`updateOcclusion`、`destructibles`、`reticlePoint` 改用重複使用的暫存物件與陣列。
6. **矩陣**：不會動的地圖物件 `matrixAutoUpdate = false`（建好時算一次；被破壞、倒塌時再打開）。

### 第 1 期：升級到 r187，維持現有外觀

- 建置產生 IIFE 的 `lib/three/three.js`（含 addons），遊戲與模型庫改用它。
- 先用相容設定：`ColorManagement.enabled = false`、輸出色彩空間照舊、燈光強度換算回舊單位、色調映射移到管線的調色 pass。
- 風格著色器與 chunk 改寫、API 改名、SSAO 的借用、GLTFLoader／Exporter、AO 的 `uv1`。
- 提高 `NET_VERSION`，同步 `CLAUDE.md`、`docs/glb-spec.md`。
- 驗收：各風格×主題的截圖與 r128 幾乎相同、完整 `npm test` 通過。

### 第 2 期：非同步編譯

- 第 0 期的預熱改用 `renderer.compileAsync`（`KHR_parallel_shader_compile`），在轉場畫面期間背景編譯、不卡畫面；遊戲中臨時出現的新模型也先非同步編好再加進場景。
- `checkShaderErrors` 只在 `?test` 開。

### 第 3 期：減少繪製次數

- 靜態地圖物件依材質合成 `BatchedMesh`（可破壞的物件以 `setVisibleAt`／換掉單一實例處理受損與殘骸，遮擋淡出改成每個實例的透明度）。
- 陰影：不動的物件改用不常更新的陰影（或依距離分級），只有機體與會動的物件每格重畫。

### 第 4 期（選擇，需要看截圖定案）

- 開啟正確的色彩管理與物理光照單位、HDR 的 bloom。畫面會變，所有渲染風格重調，由使用者看截圖決定。

## 六、參考

- three.js 遷移指南：<https://github.com/mrdoob/three.js/wiki/Migration-Guide>
- r182 的 `PCFSoftShadowMap` 棄用討論：<https://discourse.threejs.org/t/shadow-pixelation-issue-in-three-js-0-182-0/88746>
- WebGPURenderer 手冊（WebGL 2 的退回、不支援 ShaderMaterial／onBeforeCompile）：<https://threejs.org/manual/en/webgpurenderer>
- WebGPU 的效能討論：<https://discourse.threejs.org/t/webgpu-performance-issue/87939>

## 七、進度

### 第 0 期（2026-11-05，完成）

量測工具 `scripts/perf-probe.js`（說明在檔頭；`--learn` 帶入上一次記下的變體、`--gp` 記錄 getProgram 的原因、`--cpu` 取樣、`--compare` 比較）。做了：

1. **光源版本抖動**（`render/style/pipeline.js` 的 `fxLights`）：軟粒子那一次算繪前，場景裡的光源也加進 `FX_LAYER`（每 60 格掃一次場景）。每格約 80 次的 `getProgram` 歸零。SSAO 的法線一律逐個網格換材質，`InstancedMesh` 另用 `instN`，蒙皮用 `skinN`。
2. **火光與閃光不再是 three.js 的 PointLight**：`fx/effects.js` 的 4 盞（閃光 1＋火光 3）不加進場景，`lightTick` 以 `setFxLights` 寫進風格著色器的 `stFxP`／`stFxC`，著色器在 `lights_fragment_begin` 之後只算漫射（照 r128 非物理單位的衰減；色階風格照一般光源的色階加進 `stLit`；沒有高光）。實驗：風格材質一個變體的編譯 約 360 ms → 約 180 ms（每盞點光會讓風格光照多展開一次）。機甲庫與作戰室的畫面呼叫 `clearFxLights`。
3. **平面著色改成 uniform**：`MeshStandardMaterial.prototype.flatShading` 改成存取子，three.js 讀到的一律是 false，實際的值在 `_stFlat`，著色器以 `stFlat` 在 `normal_fragment_begin` 之後用導數算面法線（和 `FLAT_SHADED` 相同）；`copy` 一併複製。任務中的風格程式約 20 種 → 約 16 種。
4. **著色器預熱**（`game/render-setup.js` 的 `shaderWarm`）：新地圖第一次算繪前（出擊、主線換區段、自訂關卡、客機開局；關卡編輯器除外）以 `renderer.compile` 編好整個場景（含畫面外的）、後處理的各段與熱扭曲的場景（`StylePipeline.warm`）、SSAO 法線的兩個版本；render target 設成實際算繪的（程式的鍵含輸出編碼）；`material` 不是材質的物件（粒子批次的代理）略過。前一格先顯示「戰場準備中…」（`warmMsg`）。
5. **學習式預熱**（`render/shader-warm.js`）：任務中第一次出現的風格著色器變體（程式參數：貼圖、頂點色、雙面、蒙皮、instancing…，不含光源與霧）記在 localStorage `mech_cordon_shader_warm`（最多 48 筆），下次預熱時以假網格一起編好。碎片、殘骸等用完就移除的東西，遇過一次之後就不會在戰鬥中卡住。
6. **程式模型區塊的快取**（`render/mech-model.js` 的 `makeProcPiece`，只在遊戲裡開 `setPieceCache(true)`）：同一個區塊（零件＋配色＋重型核心）第一次建好後留作範本，之後複製；幾何共用並記在 `SHARED_GEO`（`fx.dispose`、`groundRef`、格納庫的掃描帶不釋放它），材質換成這台機甲自己的（mechMats 的對應、`red`），區塊自己建的材質每台複製一份，描邊共用。MT 的生成 約 50 ms → 約 11 ms。
7. **運輸車輛先建模**（`game/map-extras.js` 的 `vehPrebuild`／`vehClear`、`Vehicle.model`）：預熱時先建好（隱藏、在場景裡，一起預熱），車輛開出時取用；先建好的列車固定 5 節（不動亂數）。
8. **GC**：`World.collide` 回傳共用的陣列（呼叫端都立刻解構）；`updateOcclusion` 的射線重複使用、材質的目標不透明度記在材質上（`_occS`／`_occTo`，不再每格重建 Map），群組表只在遮擋物數量改變（或每 120 次）時重建；SSAO 法線的走訪回呼只建一次。

**結果**（貨運集散場，修改前／後交替各量兩次）：任務中最長的卡頓 1.7 s、1.5 s、0.84 s 與多次 0.3 s → 約 0.10～0.15 s；超過 100 ms 的影格 7、10 → 2、4（含出擊第一格）；GC 回收 1750／2124 MB → 1544／1157 MB；軟粒子那一段佔主要算繪的比例 約 69% → 約 47%（每格的絕對時間受機器狀態影響太大，同一版兩次 p50 可差到 12～20 ms，不拿來比）。出擊時集中預熱 4～6 秒（修改前出擊也要 5～8 秒，之後戰鬥中再卡）。

**還沒做、之後處理**：

- 擊破時一格新增上百到上千個碎片幾何（上傳顯示卡，0.1～0.15 s）：碎片改用 instancing 或共用幾何。
- 戰車、無人機、直升機、Boss 的模型（`buildVehicle`／`buildDrone`／`buildHeli`／`buildBossModel`）沒有快取，生成一台 30～100 ms。
- 不會動的地圖物件 `matrixAutoUpdate = false`（破壞、倒塌時要重新打開，牽涉的程式多）。
- 文字演出 `tfxTick` 偶爾一格 15～30 ms。
- 出擊的預熱時間：風格著色器的編譯本身（原生標準材質的 3 倍）；r128 只能同步編譯，平行要等第 2 期的 `compileAsync`。

### 第 1 期（2026-11-05，完成）：升級到 three.js r187，維持 r128 的畫面

**載入方式**：`scripts/three-bundle.js` 以 esbuild 打包成 IIFE 的 `dist/lib/three/three.js`（核心＋addons，掛在 `window.THREE`，addon 用舊名稱），頁面只載入這一個檔案；`DRACOLoader` 的 `import.meta.url` 以 `define` 給假的基底（`render/glb.js` 覆寫 `_loadLibrary`）；Draco 編碼器改用 `scripts/vendor/draco_encoder.js`（r128 附的那一份）。原本 6 個檔案 `import * as THREE from 'three'`，遊戲的 HTML 裡其實多打包了一份 three.js（類別也不是同一份），一併拿掉（HTML 少約 500 KB）。

**相容設定**（維持 r128 的畫面）：

- `ColorManagement.enabled = false`（`Color.set(hex)` 不轉換）。
- 光照 chunk（`lights_pars_begin`）：方向光、點光、聚光、半球光、環境光 ×π，點光與聚光的距離衰減用舊公式 (1－d／範圍)^decay。
- 一般 CubeTexture 環境貼圖的漫射 IBL 拿掉（`lights_fragment_maps`；r128 只有 PMREM 的環境貼圖才有漫射，r187 自動轉 PMREM，畫面整個變亮）。
- 畫場景的 render target 以 `render/legacy-rt.js` 的 `legacyTarget` 標成 `isXRRenderTarget`：r187 只在畫到畫面時做色調映射，這樣才會照 r128 每個材質自己做（`rtScene`／`rtPrev`／比較用的兩張、熱扭曲、水面反射、過場第 5 章、零件縮圖（縮圖讀回時在 JS 轉 sRGB））。
- 受控實驗（同一個場景，r128 與 r187 讀像素）：方向光、半球光、環境光、點光、陰影、環境貼圖都只差 1～5 階；`testStyleThemes` 72 張的平均亮度差 0.6。

**改寫**：風格著色器（`RE_Direct` 的新參數、`vMapUv`、`sRGBTransferEOTF`、`vFogDepth`、`totalDiffuse + totalSpecular`、陰影的 regex、平面著色插在算切線空間之前、色階路徑的光色 ÷π）；`encoding`→`colorSpace`、`Scene.autoUpdate`→`matrixWorldAutoUpdate`、`updateRange`→`addUpdateRange`、`encodings_fragment`→`colorspace_fragment`、`LinearTosRGB`→`sRGBTransferOETF`、`PCFSoftShadowMap`→`PCFShadowMap`（r182 起本身就是柔邊；風格的「硬／柔」陰影因此沒有差別）、`SSAOPass` 的 `_renderPass`／`_renderOverride`、`TransformControls` 加 `getHelper()`、`GLTFExporter.parse` 的錯誤回呼、GLTFLoader 的 `associations` 格式、AO 不再補 `uv2`；學習式預熱的參數名稱改 r187 的（localStorage 換成 `mech_cordon_shader_warm2`）；`NET_VERSION` 11.26。冒煙測試：`GLTFExporter`／`DRACOExporter` 的新寫法、AO 不檢查 `uv2`、鎖定測試拿掉地圖裝置（亂數取用次數一變陷阱就落在距離內）。完整 `npm test` 跑過，失敗的 21 項修正後重跑通過。

**效能（第 0 期的 r128 與 r187 交替量測兩次，貨運集散場 40 秒）**：

|                                                                  | 第 0 期（r128）     | r187                                           |
| ---------------------------------------------------------------- | ------------------- | ---------------------------------------------- |
| 出擊時最長的一格（預熱）                                         | 3.3 s、2.5 s        | 1.2 s、1.2 s                                   |
| 出擊載入（按下出擊到可以操作）                                   | 5.7 s、3.3 s        | 3.4 s、3.0 s                                   |
| 任務中超過 100 ms 的格（量測每次是新的瀏覽器，學習式預熱是空的） | 104、217 ms；360 ms | 127 ms；130、177、169 ms                       |
| GC 回收                                                          | 2334、1899 MB       | 1756、1407 MB                                  |
| 每格 CPU p50                                                     | 9.8、13.3 ms        | 14.1、9.0 ms（機器狀態的差異比版本大，不能比） |

- 出擊的預熱快了一半以上：r187 送出編譯後不會每個程式都停下來等，驅動程式在背景平行編譯（`renderer.compile` 本身 0.26～0.31 s，第一格畫面等剩下的約 0.9 s）。第 2 期改用 `compileAsync` 可以讓這段也不卡畫面。
- GC 少了約 25%（r187 內部的配置較少）。
- 任務中偶發的單一程式編譯（沒學過的變體）兩版差不多，r187 的峰值略低。
- 每格的平均負擔看不出差別：量測時機器本身的快慢差到 1.5 倍，要比要用更穩的量測（之後再做）。

### 第 2 期（2026-11-05，完成）：非同步的著色器預熱

- `Game.shaderWarm(root, async)`：`async` 時用 `renderer.compileAsync`（`KHR_parallel_shader_compile`，驅動程式在背景平行編譯），回傳全部完成的 Promise；子樹的預熱改用 r187 的 `compile(子樹, 鏡頭, 主場景)`（光源、霧、環境貼圖照主場景），不再需要假場景。`StylePipeline.warm(async)` 一樣（後處理各段、熱扭曲的場景）。
- 新地圖時（`renderMain`）：第一格顯示「戰場準備中…」，下一格送出編譯；完成前 `warmBusy` 讓主迴圈與畫面停住（遊戲時間不前進、頁面不凍結），完成後 `warmPrime` 在提示還蓋著時把整個場景（不做視錐剔除、連陰影）畫一次到 4×4 的 render target：幾何與貼圖上傳、陰影的深度材質編譯，第一個真正的畫面不再停住。保險：最多等 20 秒。
- 只在單人（`warmAsyncOk`：`net.role` 是 null）：多人時房主停住會讓客機以為房主失聯，照舊同步。自動化測試照舊同步（`__pump` 一次推進好幾格時 Promise 不會完成），`window.__warmAsync` 時走非同步：冒煙測試 `testWarmAsync`、量測腳本預設（`--sync` 改回同步）。
- `testSolo` 的「出擊後 HUD 顯示」時限 15 → 30 秒（沒帶 `?test` 時要經過出擊演出、建地圖、預熱，負載高時超過 15 秒）。

**結果**（量測腳本，每次是新的瀏覽器）：出擊時的停頓只剩送出編譯的 0.2～0.5 秒（提示已經顯示）；之後在背景編譯、上傳時畫面不凍結；預熱完成後的第一個畫面不再停住（第 1 期是 0.3～1.0 秒）。任務中剩下的長影格是沒學過的變體（學習式預熱記下後就不會再卡）與擊破時大量的碎片幾何（第 0 期留下的項目）。

### 第 3 期（2026-11-05）：評估後不做 BatchedMesh

固定一格、重複算繪比較（CPU 時間／每格的繪製次數，含陰影、軟粒子、SSAO 法線各次）：

| 地圖       | 正常        | 藏起地圖物件 | 藏起機體    | 都藏       |
| ---------- | ----------- | ------------ | ----------- | ---------- |
| 貨運集散場 | 4.0 ms／204 | 2.8 ms／186  | 2.3 ms／59  | 1.3 ms／41 |
| 技研都市   | 3.1 ms／221 | 2.4 ms／187  | 2.0 ms／76  | 0.8 ms／42 |
| 洋上都市   | 3.4 ms／254 | 2.3 ms／194  | 1.7 ms／109 | 0.8 ms／49 |

地圖物件有 800～1300 個網格，但俯視的鏡頭只看得到一小塊（視錐剔除），只佔 18～60 次繪製；全部合併最多省約 1 ms，卻要大改破壞、遮擋淡出、受損外觀。繪製次數主要來自機體（會動，不適合合併）。**結論：不做**，之後繪製次數真的成為瓶頸時再評估。

### 第 0 期留下的項目（2026-11-05）

- **增援的程式模型先建好**（`mission.js` 的 `typePrewarm`，`shaderWarm` 時呼叫，房主／單機）：後續波次裡用程式模型的類型（載具、直升機、無人機、Boss 的部位）各建一次並 `mergeRig`，填好建模與合併的快取、一起預熱著色器。第一台戰車：生成 72 ms＋下一格 616 ms → 14 ms＋19 ms；直升機 43 → 5 ms。無人機第一台仍要約 53 ms（第二台起 9 ms，成本不在模型），不處理。
- **擊破時的碎片**：學習式預熱記下變體之後，擊破那一格只剩約 45 ms（上傳一百多個碎片幾何）；以前看到的 0.1～0.3 秒其實是那一刻在編著色器。不另外處理。
- **不會動的物件不自動更新矩陣**：整個場景每格重算只要 0.13～0.34 ms，地圖物件全部關掉也只省 0.02～0.1 ms，破壞與倒塌時要重新打開的地方很多。**不做**。
- **文字演出**：中央訊息第一次約 9 ms、之後 1 ms 以下，橫幅 0.2 ms 以下；以前看到的 15～30 ms 是出擊剛開始字型第一次載入。不處理。
- **戰車、Boss 等的模型快取**：改成上面的預先建模（建模函式回傳的物件帶著動作用的節點參照，複製不安全）。

### 第 4 期（2026-11-05，完成）：HDR 與色彩管理（預設都開）

使用者看過對照截圖後定案：HDR 設為預設、不加環境漫射光；色彩管理開啟，以之前的畫面為基準重新調色（不用逐項確認，有問題直接修）。

**設定**：「畫面模式」HDR（預設）／經典、「色彩管理」開（預設）／關，存在 localStorage `mech_cordon_render`＝`{ mode, cm, iblK }`，由 `lib/three/three.js`（`scripts/three-bundle.js`）在頁面最一開始讀（色彩管理要在建立任何顏色之前決定），改了要重新整理；`THREE.MECH_CORDON_RENDER`＝`{ hdr, cm, iblK }`。冒煙測試以環境變數 `SMOKE_RENDER`（JSON）指定整套測試的模式。

**HDR**（`render/legacy-rt.js` 的 `HDR`、`render/style/pipeline.js`）：

- 畫場景的 render target 不再標 `isXRRenderTarget`，改成半浮點（材質不做色調映射，亮度可以超過 1）；粒子的加色混合在 HDR 裡疊加，爆炸、火光的核心更白熱。零件縮圖照經典（`legacyTarget(t, true)`，讀回 8 位元當圖片）。
- 色調映射是後處理裡獨立的一段（`TONEMAP_FRAG`，在 Bloom 之前；用 three.js 的色調映射函式，依風格的 `toneMap`、`renderer.toneMappingExposure`）：Bloom 照經典作用在色調映射後的值（一開始放在調色的最後，Bloom 吃到超過 1 的亮部，白色機體整個泛光）。
- 深度＝1 的像素（天空的球、背景色：不寫深度）不做色調映射與曝光，同 r128（天空著色器沒有色調映射；否則被曝光補償放大、整片過曝）。
- 後處理的四邊形一律 `toneMapped = false`。
- 環境貼圖的漫射光照（r187 的做法）可以用 `iblK` 打開，預設 0（加了陰影被提亮、畫面偏灰）。

**色彩管理**：

- `ColorManagement.enabled`：程式裡的色碼照 sRGB 解讀（以前是當線性值）→ 材質的顏色變深、變飽和（越暗的越多）。
- **光源的顏色照舊不轉換**（打包進入點把各種光源的 `color`／`groundColor` 換成 `RawColor`：`setHex`／`setStyle` 預設線性；`world.js` 套用時間時半球光的顏色以 `rawColor` 換回）：光色是照線性值調的，轉換後不同場景（夜晚、黃昏的過場）變暗的比例差很多。
- **天空的地平線、背景色**（不經過色調映射與曝光）以 `render/color-cm.js` 的 `rawColor` 換回原本的值。
- 程式裡手動把 sRGB 色碼換成線性的地方改用 `render/color-cm.js`（`linColor`、`srgbColor`、`hexForSet`、`toLinear`），色彩管理開關兩種情況都對。
- **重新調色**（亮度回到之前的水準，色調較深、較飽和）：
  - 主題的曝光補正 `world.js` 的 `CM_EXP`（雪地 1.62～集散場 2.73；空域 1.78）與線性色調映射時的 `CM_LIN_EXP`（技研都市 1.5、Grid 086 1.15）；
  - 渲染風格的參數「曝光（色彩管理）」`cmExp`（ac6 0.78、ghibli 0.88、gundam 0.91、sandland 0.9）與「飽和度（色彩管理）」`cmSat`（線性色調映射的 gundam 0.8、ghibli 0.85、sandland 0.8：暖色的主題不會太橘）；
  - 格納庫 1.69、作戰室 1.59、模型庫 1.7（管線的 `cmExp`），過場動畫自己的場景（太空、軌道站）1.4。
- 量測：72 張「渲染風格 × 主題」的截圖，五個風格的線性亮度比（之前／現在）中位數 0.95～1.05；格納庫 0.99、作戰室約 1；過場與空域大多在 ±20% 內。

**沒有做**：光照的物理單位（強度在著色器裡 ×π 和在各處 ×π 完全相同，畫面不會變，反而要改 25 處建立光源與 `intensity *= …` 的寫法）。

**原本不穩定的兩個測試（2026-11-06 修掉，都是測試本身的問題）**：`testRangedFeel` 的「霰彈打中：目標往後退」——測試在同一格裡出擊就開火，機體的網格還在原點（`move` 才把 `pos` 同步過去），子彈從原點射出，玩家生在原點 +Z 那側時方向就反了；開火前先把網格放到機體的位置。`testTraps`——陷阱的擺放、地圖、目標敵人都是隨機的：偶爾一個陷阱都放不下（orbit）、挑到盾牌 MT（陷阱傷害被盾擋掉）、玩家站上控制台前被還在飛的子彈打出失衡（按住互動鍵不算）；改成固定亂數（`seededRandom`，每個主題一個種子）、另外生成一台普通 MT 當目標、觸發前清掉子彈與地雷並解除失衡。各重複 6 次全部通過。

## 八、卡頓改善第二輪（2026-11-06）：grid086 與全部地圖

使用者回報畫面設定全開時，grid086 那一系列的每一關都很頓、常常卡。以 `scripts/perf-probe.js --full`（快速設定的「品質」：水面高、砲火華麗、機甲特效完整、殘影）與 `--variant`（主題變體）量了 13 張地圖與 grid086 的 6 種變體（1600×900，顯示卡算繪，每張 35 秒），找到三個原因：

1. **任務中才編譯的半透明著色器**（每張地圖 1～4 次，每次 140～300 ms，玩幾次都不會好）：鏡頭遮擋的淡出（`World.fadeMeshes`）、可破壞物件拋出的碎塊、受損掉板都是即時複製材質並設成半透明；r187 的程式參數有 `opaque`，半透明是另一個變體，第一次出現就要現場編譯。淡出完 `dispose` 複製的材質時，three.js 連同程式一起刪掉，下次再擋住又重新編譯；學習式預熱（`shader-warm.js`）也沒有記半透明。
2. **鏡頭遮擋的射線**：每 3 格對所有候選網格的每個三角形打 3 條射線；grid086 有約 1,970 個網格、177 萬個三角形，在平台底下時一次 5～23 ms；荒涼工業荒野有 23 個橫跨整張地圖的合併網格（半徑 314 m、共 35 萬個三角形），一次 40～70 ms。
3. **記憶體配置**：40 秒 1.5～3.4 GB（grid086 最多），一半來自地圖上的小人每格呼叫 `collide`／`groundAt`（每次掃過全部約 600 個障礙物），兩成來自遮擋射線的命中結果。

分四期改善，每期量測後提交。

### 第 5 期：半透明的著色器

- `render/shader-warm.js` 的 `transpWarm(root)`：出擊預熱時，場景（與增援的模型、記下的變體）裡每一種風格材質的變體各做一個半透明的複本一起編譯；複本留著不釋放，程式就一直在快取裡，之後即時複製的半透明材質直接用它。
- 學習式預熱多記 `transparent`（程式參數 `opaque` 為 false 的），紀錄上限 48 → 96。
- `World.fadeMeshes` 的淡出複本每個網格一份、留著重複使用（原材質換了才重新複製，重用時 `copy` 一次），不再 `dispose`。
- 結果（grid086，第一次玩、沒有紀錄）：任務中超過 100 ms 的停頓 4 → 1（剩下的是隨機組裝的敵對 AC 的機甲材質，玩過一次就學到）；學到之後連續兩次都是 0。

### 第 6 期：鏡頭遮擋的射線

- `World.fadeMeshes` 每格只打一條射線（輪流檢查機體的頭、中心、腳），各點的結果分開記、合併成擋住的網格；以前每 3 格一次打全部，那一格特別重。
- `fadeRay`：候選群組先用快取的世界外框（`occBox`，根的矩陣改變時重算，另外每格輪流更新 12 個）篩選，射線沒穿過外框的不逐一檢查三角形；命中結果用同一個陣列。
- 結果：荒涼工業荒野超過 50 ms 的影格 163 → 4、最慢的 1% 77 → 24.5 ms；grid086 鏡頭的尖峰（每 3 格 5～20 ms）消失；水壩最慢的 1% 51.8 → 35.8 ms（同一時間、同一台電腦的前後比較）。

### 第 7 期：地圖小物件的合併依區域分開

- `mergeStatic` 的 `opts.cell`／`cellTris`：三角形超過 5 萬的合併再依世界座標的 XZ 方格分開；`World` 的 `decorG`（地圖的小物件，`noFade`）用 4×4 格。以前合併成橫跨整張地圖的網格，視錐剔除永遠剔不掉、陰影也要整張畫。小的合併照舊一個，不增加繪製次數。
- 荒野另外那些半徑 300 m 以上的網格是真的橫跨地圖的長條物件（管線），不拆；它們造成的遮擋射線問題已在第 6 期由外框篩選解決（three.js 的 `Mesh.raycast` 也會先檢查幾何的外框）。
- 量測（停住主迴圈、24 個固定位置各畫 4 格，每張 3 次取中位數）：荒野每格的三角形 2.08M → 1.68～1.77M；其他地圖的差異在雜訊內（場景裡的敵人、特效每次不同，同一版的繪製次數就會差 ±25%）。

### 第 8 期：障礙物的空間格子

- `World.obsGrid`／`obsAt(x, z, r)`：障礙物依外框（加寬 `OG_PAD`＝6 MS）登記到邊長 `OG_C`（8 WS）的格子，格子裡照陣列的順序；障礙物陣列換掉、數量或最後一個改變時重建（增減障礙物的地方很多，不一一通知；沒有原地改位置的）。認不得的形狀或查詢半徑超過 `OG_PAD` 時退回整個陣列。
- `collide`（被推出所在的格子時用新的格子再檢查一次）、`groundAt`、`hitsWorld` 只看所在那一格；以前每次掃過全部約 600 個障礙物，地圖上的小人每格每人呼叫好幾次。
- 結果（grid086，15 秒的取樣）：記憶體配置 945 → 466 MB、GC 回收 1,825 → 956 MB、每格 CPU 的中位數 13.6 → 11.6 ms；`collide`、`hitsWorld` 不再出現在耗時的前幾名。

## 九、伺服器預設組的讀取（2026-11-07）

- **調查**：比對機制原本就有（清單 `rev`＋每個 GLB 的雜湊＋網址帶雜湊的 immutable 快取：重開網頁時 139 個 GLB 全部從瀏覽器快取拿，同一頁再讀只抓清單 5 ms），真正每次都在做的是**解析**（結果只在這一頁的記憶體，重開網頁 3.5～5 秒）；剖析：約 1.4 秒是一個一個解析時等貼圖在背景解碼的空檔、1.2 秒是原生的貼圖解碼與 Blob、0.4 秒是描邊的法線。而且第一次讀是在進機甲庫／作戰室／出擊時才開始，作戰室、模擬器、自訂關卡、訓練課程的出擊不等它（開遊戲後馬上出擊，第一段可能還是程式模型）。
- **A**：開遊戲就在背景讀（`lmInit`），標題列下方顯示小進度條 `#srvLoad`；出擊入口開頭的 `srvGate` 在還沒讀完時顯示讀取視窗、讀完再進來。
- **B**：同時解析 4 個（`PARSE_N`），同一個雜湊只解析一次；內建的玩家預設機甲（`BuiltinMech._load`）也改成同時解析 4 個（開遊戲時兩者一起解析，原本一個一個解析的內建預設機甲會晚好幾秒才讀完，機甲庫換模型組要等它：testServerModels 量到 4.7 → 0.7 秒）。開網頁到讀完（含載入頁面約 1.2 秒）：第二次開網頁 6.5 → 3.7 秒。
- **E**：伺服器 `saveManifest` 之後停手 1 秒經 WebSocket `/ws-models` 送 `rev`（另開一條 WebSocket，不佔 HTTP/1.1 每個主機 6 條連線的名額），遊戲在選單畫面時背景重新讀取（只下載解析改過的檔案），任務中等回到選單畫面；斷線後重連（2 秒起、最多 60 秒）。
- **沒做**：解析結果存進 IndexedDB（解碼後的貼圖像素比 GLB 大好幾倍，讀回也要時間）、需要時才解析（`providedModel` 是同步的，要先列出出擊用到的槽位）。

## 十、主線出擊的卡頓（2026-11-07）：宇宙港外圍 — 聖域的撤離

使用者回報這次出擊的每一段都很卡。`scripts/perf-probe.js` 多了 `--sortie=<出擊> --seg=<段>`（轉場畫面直接出擊那一段），6 段都量過（畫面設定全開、1600×900）：

- **擊破機甲時現場編譯半透明著色器**（每次 150～300 ms）：機甲的模型合併成蒙皮網格（`render/mesh-merge.js` 的 `mergeRig`），擊破時 `unmerge` 拿回原本的網格、碎片複製成半透明。`transpWarm` 以前略過蒙皮網格，也看不到合併前的原本網格。改成蒙皮網格也做半透明版、合併前的原本網格（`RIG_SRC`）做不透明＋半透明版。
- **任務中才建立的機體**（增援、友軍 AC、Boss 的部位、換模型）：`MechEntity` 建立時呼叫 `Game.warmLate(mesh)`，地圖已經預熱過時把它的材質與半透明版丟給 `compileAsync` 在背景編譯。
- **增援一次生成好幾台**（每台建模 30～70 ms）：`waveTick` 改成一格生成一台，生成完之前 `wavePend` 還在、不算清除。
- 結果：grid086 那一段擊破時的停頓消失；宇宙港各段剩 1 次（程式模型的頂點色材質、Boss 換型態時一次生成 3～4 台的雜兵）。
- **一次生成好幾台的其他地方**：共用的生成佇列（`waves.js` 的 `spawnLater`／`spawnQTick`，主迴圈每格生成一台，佇列還有東西時不算清除，`clearMission` 清掉）：Boss 換型態的增援、Boss 改版的雜兵小隊與空降兵、主線突破區段的定時增援、護送的襲擊、舊式的全滅後增援。
- **grid086 主線區段平時偏重**：主線的地圖比自由出擊大（960 m 對 690 m），場上同時 20 幾台敵人；同一個畫面每格 1,577 次繪製（自由出擊 737），地圖物件的網格裡甲板格子的支柱就佔 344 個（一根一個網格）。`World.mergeGridPillars` 把支柱依區域（4×4 格）與材質合併成少數幾個網格（原本的隱藏），某一根損毀時 `propUnmerge` 把它在合併網格裡的頂點縮成一點、原本的網格顯示回來，之後照原本的做法切開；自訂關卡與編輯器不合併。同一個畫面 1,577 → 660 次繪製、每格 16.3 → 11.2 ms；40 秒的量測每格 CPU 中位數 19.8 → 17.5 ms。
- **文字演出的疊加畫布**（`render/textfx.js`）：沒有項目時不再每格清空整張全螢幕畫布。
- **開場第一個橫幅**（每段一次 70～160 ms）：疊加畫布的項目在字型載好時就先建好場景（出擊時主迴圈在預熱、停著，這時建），不再等到第一次畫。
- **DOM 標題的檢查**：`hostTick` 每格讀轉場、結果畫面標題的 `offsetParent`／`clientWidth`，讓瀏覽器每格重新排版（CPU 取樣約 5%）；任務中不檢查。
- **擊破時第一次出現的材質**：乘員跳傘的降落傘、血跡（`crowd.js` 的 `crowdWarm`）加進出擊的預熱；增援裡的具名敵對 AC 在 `typePrewarm` 先建一次。
- **背景預熱不佔生成那一格**：`warmLate` 改成排隊，瀏覽器有空檔時（`requestIdleCallback`）一台一台做。
- 量測方法的注意：同一個種子跑 40 秒的遊玩，新舊版本只要有一個地方多用或少用一次亂數（文字演出的特效、預熱建模型），之後的戰況就不同，每格的平均不能直接比。新舊比較用固定條件：同一個種子、敵人不動、玩家放在 12 個固定位置各畫 8 格（各 3 次）。結果 grid086 的兩段新版每格中位數 13～18 ms、舊版 15～19 ms；40 秒遊玩裡超過 60 ms 的停頓（擊破 150～175 ms、Boss 段生成 90～215 ms）大多消失，剩一次 70 ms 左右。
- **地圖物件的合併池**（`World.mergeProps`，使用者定案：改淡出方式）：地圖物件（甲板、棚屋、油桶、貨櫃…）各有自己的材質（鏡頭遮擋單獨淡出、受擊閃光、焦黑），以前不能合併。改成依區域（4×4 格）與材質的「外觀」（顏色、粗糙度、貼圖…，不看是不是同一個材質物件）合併成少數網格，原本的網格隱藏（群組照常顯示，依距離切換的小細節 `fineReg` 不合併）；要動到某一個物件時才「拿出來」（`poolOut`：它在合併網格裡的頂點縮成一點、原本的網格顯示）：鏡頭遮擋（`updateOcclusion` 的 occluders 與 `fadeMeshes` 打到的網格）拿出來、淡回不透明 1 秒後放回去（`poolTick`→`poolIn`）；受擊閃光、受損階段、倒塌、損毀（`propUnmerge`）之後一直在外面。自訂關卡與編輯器不合併。
- **遠處的敵群延後生成**（使用者定案：減少同時在場的敵人；`docs/map-pacing-design.md` 的 B）：主線 grid086 第 1 段開場在場的敵人 26 → 8 台；延後生成的類型也放進出擊時的 `typePrewarm`（機甲型的雜兵也建一次），所以生成那一格每台 5～10 ms。
- **地圖物件的碎片**（`fx.propDebris`）：以前每片新建一個幾何、用完不釋放（大的倒塌一次上千個），改成共用的單位幾何以縮放決定大小；甲板落地的碎裂最多分 4 區。
- **結果**（固定條件：同一個種子、敵人不動、12 個固定位置各畫 8 格，各 3 次）：grid086 第 2 段每格中位數 14.2～14.9 → 9.0～9.3 ms、每格繪製約 1,370 → 660 次；第 1 段 16.6～17.5 → 12.5～14.1 ms、約 1,630 → 790 次。

## 十一、進作戰室的卡頓（2026-11-08）

使用者回報「進入作戰室很卡頓」。量測工具 `node scripts/perf-hub.js`（`--ch=8` 第 1～7 章完成的存檔、`--again` 回機甲庫再進一次、`--reload` 重新整理後停在標題 8 秒再從「主線」進去、`--nopre` 不在標題先建作戰室、`--sync` 照自動化測試的同步編譯、`--cpu` CPU 取樣（先 `node scripts/build.js --dev` 才看得到函式名稱））。

第 8 章的存檔第一次進作戰室（改善前）：

| 項目 | 時間 |
|---|---|
| 第一格：作戰室的模型（格納庫的外部素材、機體、指揮室）第一次畫到才同步編譯 28 個著色器 | 6.5 秒（每個約 0.4 秒） |
| 戰略桌的 8 個區域地形：一格建一張真的關卡（World）取樣 | 每格 0.25～0.9 秒，共約 4.5 秒，中間一次 323 MB 的 GC |
| 第二次進去（同一頁） | 不卡，每格約 8 ms |

取樣的 4.4 秒裡約 3.1 秒是地圖物件的頂點色烘焙（`PK.buildTint`），0.5 秒是遠景地形，取樣根本用不到這些網格。

改善（`game/hub-holo.js`）：

- **取樣的輕量模式**：`hubHoloSample` 以 `world/prop-models.js` 的 `setPropLite(true)`（`PK.build` 不烘焙，照一般零件合併）＋World 的 `opt.sample`（生成完就停：不登記可破壞物件、不合併、沒有遠景、邊界線、天氣）建圖。這些都不呼叫地圖的亂數，所以地形與障礙物和正式出擊完全相同（冒煙測試「第一段的地形和戰略桌上的一樣」照樣通過）。每塊降到 0.07～0.34 秒。
- **取樣結果存在瀏覽器**：localStorage `mech_cordon_hub_tiles`（版本＝`NET_VERSION`＋格式，最近用過的 16 塊；高度 Uint16＋base64、障礙物四位小數，8 塊約 100 KB）。同一份「主題｜種子｜選項」之後開網頁直接拿（`hubTileGet`）。
- **著色器在背景預熱**：場景的內容改了（`hubGen`：建立、換上細緻素材、換機體、放上區域地形）時 `hubWarm` 把整個場景交給 `compileAsync`（含後處理的各段），完成前 `hubTick` 不畫（畫面留著上一格；這次進來還沒畫過時顯示「作戰室準備中…」），完成後 `hubPrime` 連陰影畫一次到很小的 render target（陰影的深度材質與 SSAO 法線）。多人與自動化測試照舊同步。
- **在標題畫面先建好**：停在標題或存檔畫面 1.5 秒（格納庫的外部素材讀好之後、單人）時 `hubPrewarmTick` 建作戰室並背景編譯；主線有進度時接著把戰略桌的區域地形每 0.3 秒取樣一塊。

改善後（第 8 章的存檔）：

| 情況 | 第一次畫出作戰室 | 卡頓 |
|---|---|---|
| 重新整理後停在標題再進去（最常見） | 0.23 秒 | 沒有（最長一格 0.15 秒，是第一次按鈕時音效系統的初始化） |
| 標題沒停就進去、瀏覽器還沒存過區域地形 | 約 2.6～3.5 秒（「作戰室準備中…」） | 8 塊區域的取樣 0.07～1 秒（只有這一次） |
| 同一頁第二次進去 | 0.03 秒 | 沒有 |

還沒處理：完成一個出擊後，那一區換成下一個委託的地形，第一次進作戰室時取樣那一塊（約 0.1～0.3 秒、只有一次）。
