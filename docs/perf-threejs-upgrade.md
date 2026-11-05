# 卡頓調查與 three.js 升級規劃（2026-11-05）

## 一、量測方式

- 建置版 `dist/rubicon-protocol.html`（main 7717788），headless Edge＋顯示卡算繪（ANGLE D3D11），1600×900、像素比 1，貨運集散場，預設畫質（SSAO 開）。
- 腳本：新存檔 → 出擊 → 往前走、射擊、QB，每 5 秒把玩家移到最近的敵人旁邊並擊破兩台（觸發擊破特效、增援）。
- 逐格記錄：`loop` 的 CPU 時間與兩格的間隔、各段耗時（包裝 Game 的方法與管線的各段）、`renderer.info` 的程式／幾何／貼圖數量變化、JS heap 下降（GC）；包裝 `gl.linkProgram`／`getProgramParameter` 記下每次著色器連結的耗時與關鍵的 define；CDP 的 CPU 取樣與記憶體配置取樣（含已回收的物件）；把 three.js 換成未壓縮版、在 `setProgram` 記錄每次呼叫 `getProgram` 的原因。
- 腳本在 `C:\Users\loren\AppData\Local\Temp\claude\…\scratchpad\`（hitch-probe.js、probe2～4.js），第 0 期會整理成 `scripts/perf-probe.js`。

## 二、結果摘要

| 項目 | 數值 |
| --- | --- |
| 每格 CPU（loop） | p50 18.2 ms、p90 25.7 ms、p99 39.4 ms |
| 任務中最長的影格 | 2515 ms、1105 ms、726 ms、348 ms、293 ms（出擊第一格 3050 ms） |
| 著色器連結 | 整段 143 個、合計 12.4 秒；單個 150～425 ms，原始碼約 74 KB |
| `getProgram`（不必要的） | 300 格 24,457 次（每格約 80 次） |
| JS 記憶體配置 | 約 52 MB／秒（45 秒內 GC 回收約 2 GB，64 次明顯的回收） |
| 場景 | 4461 個物件、2759 個網格（可見 1962）、747 個材質、1307 個投射陰影、4314 個每格自動更新矩陣 |
| 出擊載入 | 8 秒（其中第一格約 3 秒是著色器編譯） |

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

| 來源 | 比例 |
| --- | --- |
| three.js 的 `getProgram`（上一項） | 約 25% |
| 地圖上的小人：`crowdTick` → `World.collide`、`hypot` | 約 15% |
| 敵人 AI：`move`／`collide`／`senseIdle`／`updateAI` | 約 10% |
| 鏡頭遮擋 `updateOcclusion`（每格 `new Set`、查表） | 約 9% |
| `destructibles()` 每次組新陣列 | 約 3% |
| SSAO 法線的 `traverseVisible` 閉包、`reticlePoint` 的地形射線 | 數 % |

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

| 功能 | 版本 | 對本專案 |
| --- | --- | --- |
| `renderer.compileAsync`＋`KHR_parallel_shader_compile` | r158 起 | **最重要**：載入時在背景執行緒編譯所有變體、不卡畫面，直接對應第 1 項 |
| `BatchedMesh`（不同幾何、同一材質合成一次繪製，可個別隱藏／刪除） | r159 起 | 地圖物件數千個網格可以大幅減少繪製次數；可破壞物件仍能個別處理 |
| `matrixWorldAutoUpdate`、屬性與貼圖的部分更新 `addUpdateRange` | r144／r159 起 | 不動的物件不算矩陣、粒子只上傳改過的部分 |
| KTX2／Basis 壓縮貼圖 | 已有 | GLB 貼圖上傳更快、顯示記憶體更少 |
| 只支援 WebGL2、內部的各種最佳化 | r163 起 | 小幅 |

**不會自動變快的部分**：第 2 項（光源版本抖動）、第 3 項（GC 是遊戲程式）、著色器的大小與變體數，升級後一樣存在。「最新版效能比較好」對這個專案的意思是：多了幾個好工具，要改程式才拿得到；單純換版本，影格時間不會明顯變好。

### 會碰到的破壞性變更（依本專案實際用到的）

1. **載入方式**：`examples/js`（r148）、UMD 的 `build/three.js`（r160）、`three.min.js`（r186）都已移除，只剩 ES module。為了維持「全域 `THREE`、`lib/` 不內嵌、file:// 可開、IIFE 的一般 `<script>`」的規則：建置時用 esbuild 把 `three.module.js`＋用到的 addons（GLTFLoader、DRACOLoader、SkeletonUtils、RoundedBoxGeometry、EffectComposer 系列、UnrealBloomPass、SSAOPass、FXAA／Copy／SSAO 等 shader、SimplexNoise；模型庫另加 OrbitControls、TransformControls、GLTFExporter）打包成 `dist/lib/three/three.js`，掛成 `window.THREE`，`src/index.html` 與 `src/library/index.html` 的 script 標籤改指這一份。
2. **色彩管理（r152）**：`ColorManagement.enabled` 預設開啟，`Color.set(hex)` 會從 sRGB 轉成線性。專案多處假設「r128 的 `Color.set(hex)` 不做轉換」（`PALETTES.white` 是線性值、內建機甲的灰階換色）。`outputEncoding`→`outputColorSpace`、`texture.encoding`→`colorSpace`（`sRGBEncoding` 11 處、`.encoding` 9 處）。
3. **光照單位（r155，r165 移除舊模式）**：方向光／半球光／環境光／點光／聚光的強度意義改變，點光源預設衰減 2。27 處燈光、各主題的 `sunI`／`hemiI`、火光、閃光都要重調。
4. **色調映射**：新版畫到 render target 時不套用色調映射與輸出色彩空間（只在畫到畫面時套）。我們的管線先畫到 `rtScene` 再做後處理，所以色調映射與 sRGB 轉換要移到調色 pass 自己做（類似 `OutputPass`）。附帶的好處是 bloom 可以在線性 HDR 上做（場景 RT 改半浮點）。
5. **著色器 chunk**：`GeometricContext` 移除（`RE_Direct` 的參數改成 `geometryPosition`／`geometryNormal`／`geometryViewDir`…）、`encodings_fragment`→`colorspace_fragment`、`output_fragment`→`opaque_fragment`、貼圖座標改成每張貼圖自己的 `vMapUv` 等、`uv2`→`uv1`＋`aoMap.channel`。`render/style/shader.js` 的 `RE_Direct_Style` 與對 `lights_fragment_begin`、`normal_fragment_maps`、`map_fragment` 的改寫要重寫；22 個 `ShaderMaterial` 逐一檢查；GLB 貼花的 `ST_DECAL`；編輯器的 AO 貼圖（`uv2` 5 處）。
6. **其他 API**：`Scene.autoUpdate`→`matrixWorldAutoUpdate`（管線靠它只算一次世界矩陣）、`RGBFormat` 移除、`material.skinning` 移除（6 處）、`PCFSoftShadowMap` 在 r182 標成棄用（改用已經是柔邊的 `PCFShadowMap`）、`Clock` r183 棄用、GLTFLoader 的 `parser.associations` 格式、GLTFExporter 的參數、`SSAOPass` 的內部（管線借用它的法線與 AO 材質）、`SkeletonUtils` 改成函式。
7. **多人**：各端必須同一版本（子彈發射點依模型），升級要提高 `NET_VERSION`。
8. **不受影響**：貼圖繪製 `rubicon_paint/` 自帶 r128，可以不動；文字動畫 APNG 不用 three。

### 風險

- 畫面會整體改變：5 個內建渲染風格 × 13 個主題都要截圖比對（`testStyleThemes` 的亮度檢查）、機甲配色、GLB 貼花、水面、雲海、粒子。
- 自訂的後處理管線與 SSAO 借用的內部最容易壞。
- 範圍大：`THREE.` 用在 178 個檔案；完整 `npm test` 是最後的保障。

### WebGPU＋TSL 方案的評估

**做法**：改用 `WebGPURenderer`（有 WebGPU 時用 WebGPU，否則退回 WebGL 2 的後端），材質改成節點材質，著色器改用 TSL（以 JavaScript 寫、編譯成 WGSL／GLSL），後處理改用 `PostProcessing`＋節點（內建 GTAO、bloom、動態模糊、景深、輪廓等節點）。

**要重寫的範圍**（官方手冊：`ShaderMaterial`、`RawShaderMaterial` 與 `onBeforeCompile` 在 WebGPURenderer 都不支援）：

| 部分 | 現況 | 換成 TSL |
| --- | --- | --- |
| 渲染風格的著色器 | `render/style/shader.js` 以 `onBeforeCompile` 改所有標準材質（色階光照、影色、邊緣光、金屬反光帶、高度霧、水彩、貼花） | 自訂的光照模型（`LightingModel`）＋每個材質的節點；所有 `MeshStandardMaterial` 換成 `MeshStandardNodeMaterial` |
| 後處理管線 | `render/style/pipeline.js` 10 段 GLSL（合成、描線、動態模糊、調色、FXAA、景深、熱扭曲、光束、深度拷貝、比較），借用 SSAOPass 的內部 | 整條改寫成節點的 `PostProcessing`（MRT 一次輸出顏色＋法線＋深度，SSAO 改 GTAO 節點，不用再畫一次法線） |
| 其他自訂著色器 | 約 53 段 GLSL：顯示卡粒子 `fx/gpu.js`、噴流、帶狀軌跡、水面（模擬、焦散、表面）、雲海、天空與塵埃、天氣、全像戰略桌、六角護盾、描邊、邊界線、過場的場景…… | 逐一改寫成 TSL；粒子與水波模擬可以改用計算著色器 |
| GLB 貼花、陣營換色、遮擋淡出 | 靠材質的 uniform 與 define | 節點的 uniform |
| 模型庫、GLB 編輯器 | 同一套材質與管線 | 一起改；貼圖繪製 `rubicon_paint/` 可以留在 r128 |

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
5. **學習式預熱**（`render/shader-warm.js`）：任務中第一次出現的風格著色器變體（程式參數：貼圖、頂點色、雙面、蒙皮、instancing…，不含光源與霧）記在 localStorage `rubicon_shader_warm`（最多 48 筆），下次預熱時以假網格一起編好。碎片、殘骸等用完就移除的東西，遇過一次之後就不會在戰鬥中卡住。
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
