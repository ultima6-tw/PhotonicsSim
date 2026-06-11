# OpticSim — 雷射光學模擬器

## 開發機器
Mac Studio M1 Max（主力）

## 目前狀態
**Phase 2 + Phase 3 + Phase 4 + NonlinearSim 接入 全部完成 + crystal 元件** ✓
最終入口：`04-integration/index.html`

功能：拖拉元件 / 光斑截面 / 入射角度 / 厚透鏡（ABCD 矩陣）/ 多波長 + Sellmeier 色差 / **非線性晶體搜尋與插入** / **crystal 平板元件（KTP/BBO/LBO/PPLN/ZnSe）**。

### crystal 元件（2026-06-11 新增）

新增 `crystal(n, t)` 元件，矩陣 `[[1, t/n], [0, 1]]`，用於非線性晶體的正確語義建模。
- `matrices.js`：M.crystal(n, t) + Element.crystal(n, t) + Element.thickLens wrapper
- `gaussian.js`：matrixFor() 新增 case 'crystal'
- `element-list.js`：XTAL badge（紫色）、預設 n=1.77 t=10mm
- `param-editor.js`：material 下拉（KTP/BBO/LBO/PPLN/ZnSe）+ n + t 編輯
- `NonlinearSim/solver.js`：toOpticSimElement 改為回傳 crystal 型別（原為 thickLens）
- NonlinearSim solver-results：77/77 ✓

### NonlinearSim 接入（2026-06-11）

`04-integration/index.html` 新增 "NONLINEAR CRYSTAL" panel section：
- 載入 NonlinearSim 全部 scripts（crystals + physics + solver，共 12 個 .js）
- 輸入 pump λ + L crystal → "Find SHG Combinations" 搜尋所有晶體（BBO/KTP/LBO/KDP/PPLN）
- 結果排列按效率，每列有 Apply 按鈕
- Apply 後：wavelengths 更新為 [pump, SH]，element list 換成標準 SHG 場景
  `[free 15cm] → [lens f=150mm] → [free 5cm] → [thickLens crystal] → [free 30cm]`
- 驗證：PPLN Apply 後 3D viewport 顯示雙色光束（1064nm + 532nm），聚焦至 w≈51µm

## 物理驗證（2026-06-11）

### Part A — ABCD 矩陣解析對照

| 案例 | 設定 | 解析期望 | OpticSim | 結果 |
|------|------|---------|---------|------|
| A1 | λ=1064nm, w₀=1mm, lens f=150mm | 50.7 µm @ z=149mm | 50.74 µm @ 149.6mm | ✅ <1% |
| A2 | λ=1064nm, w₀=2.5mm, lens f=100mm | 13.55 µm @ z=100mm | 13.55 µm @ 100mm | ✅ 0% |

**公式**：準直光束（z_R >> f）過薄透鏡：w₁ = λf/(πw₀)，像距 ≈ f

### Part B — Arizona OPTI511L KTP SHG 實驗（參考設定）

來源：University of Arizona OPTI511L 課程手冊（Experiment 3: SHG）
設定：λ=1064nm，P=150mW，入射束徑 5mm（w₀=2.5mm），KTP Type-II，L=5mm

| 項目 | f=100mm | f=50mm |
|------|---------|--------|
| 焦點腰徑（解析） | 13.55 µm | 6.77 µm |
| 焦點腰徑（OpticSim） | **13.55 µm ✅** | **6.77 µm ✅** |
| Rayleigh range z_R | 0.54 mm | 0.14 mm |
| Boyd-Kleinman ξ=L/(2z_R) | 4.61 | 18.52（最佳值 2.84） |
| SHG η（NonlinearSim） | 0.037% | 0.147% |
| P_SHG（150mW 泵浦） | 0.055 mW | 0.220 mW |

BK 最佳聚焦腰徑：w_opt = sqrt(Lλ/(2πn·2.84)) ≈ **12.9 µm**（對應 f≈108mm）

**驗證結論**：f=50mm 效率 4× 高於 f=100mm，與 Arizona 手冊預期結論一致（緊聚焦提高效率，但超過 BK 最佳後改善幅度遞減）。

## Bugfix 記錄
- **findWaists 腰徑線性插值 bug（2026-06-11）**：`gaussian.js` `findWaists()` 原本在 qr 符號變化的兩個取樣點間用線性插值算腰徑，但當 z_R' < 取樣間距時（高 NA 聚焦），線性插值嚴重高估腰徑（例：13.5 µm → 25.1 µm）。
  - 修正：改為插值 Im(q)=z_R'，再用物理公式 `w₁ = sqrt(z_R' · λ / π)` 算腰徑，精度提升到與解析值完全一致。
  - 觸發方式：找論文驗證光路架構時，以 w₀=2.5mm + f=100mm 測試案例暴露此問題。
  - 影響範圍：所有 z_R' < perSegment 取樣間距的聚焦案例（高功率 SHG、緊聚焦等）。
- _EL_META 全域命名衝突（element-list.js + param-editor.js）→ param-editor 改 _PE_EL_META
- lens aperture 用 w0×tScale×4.5 太大 → 改 maxBeamW×tScale×1.5，thickness 係數 0.18→0.42
- scene.js 相機距離不足（可見範圍只 76% 系統長）→ 係數 0.5/0.4 改 0.75/0.6
- elements.js lens material：DoubleSide→FrontSide，radialSegments 48→72，消除多邊形殘影

## 專案說明
基於 ABCD 矩陣的雷射光學模擬器，支援幾何光線追蹤與高斯光束傳播，Three.js 3D 互動視覺化。
純前端，單一 HTML 檔案，不需 build system。

## 子模組結構

```
01-physics/
├── 01-matrices/     # 各元件 ABCD 矩陣定義
├── 02-gaussian/     # 高斯光束 q 參數傳播
├── 03-raytrace/     # 幾何光線追蹤
└── 04-sampler/      # 整合輸出 beam data 陣列

02-renderer/
├── 01-scene/        # Three.js 場景、相機、燈光、OrbitControls
├── 02-envelope/     # 高斯包絡面 LatheGeometry
├── 03-rays/         # 幾何光線 LineSegments
└── 04-elements/     # 透鏡/反射鏡 3D mesh

03-ui/
├── 01-panel-shell/  # 整體佈局框架
├── 02-element-list/ # 元件列表（新增/刪除/排序）
└── 03-param-editor/ # 各元件參數編輯器

04-integration/      # 最後才做，串接全部
```

每個子項目：獨立 `index.html`，可直接瀏覽器開啟測試。

## 介面佈局（最終）
```
┌──────────────┬────────────────────────────────┐
│  UI Panel    │                                │
│  (300px)     │     Three.js 3D Viewport       │
│              │                                │
│  元件列表    │   [可旋轉 / 縮放 / 平移]        │
│              │                                │
│  [計算]      ├────────────────────────────────┤
└──────────────┘  Beam stats bar                │
```

## 使用的工具與套件
- Three.js r168（CDN）
- Three.js OrbitControls（CDN）
- 純 HTML/CSS/JS，無 build system

## Phase 2 功能規劃

### 三大功能
1. **2A — 拖拉元件**：在 3D 視圖直接拖動鏡片沿 z 軸移動，即時重算光路
2. **2B — 光斑截面**：可移動的截面圓盤，顯示該位置的高斯強度分布與光束半徑
3. **2C — 入射角度**：光束可設定傾斜角，追蹤光束質心，包絡管道跟著偏轉

### 新增/修改的檔案

| 檔案 | 操作 | 說明 |
|------|------|------|
| `02-renderer/05-drag/drag.js` | **新增** | pointer events + raycasting 拖拉邏輯 |
| `02-renderer/05-drag/index.html` | **新增** | 2A 驗證頁 |
| `02-renderer/06-spot/spot.js` | **新增** | 光斑截面 canvas texture + PlaneGeometry |
| `02-renderer/06-spot/index.html` | **新增** | 2B 驗證頁 |
| `01-physics/02-gaussian/gaussian.js` | **修改** | 加 centroid 追蹤（r_c, theta_c 每個 sample） |
| `01-physics/03-raytrace/raytrace.js` | **修改** | `makeParallelRays` 加 `tiltAngle` 參數 |
| `01-physics/04-sampler/sampler.js` | **修改** | beam.tiltAngle 傳遞到 gaussian + raytrace |
| `02-renderer/02-envelope/envelope.js` | **修改** | LatheGeometry → custom BufferGeometry，支援偏軸管道 |
| `04-integration/index.html` | **修改** | 載入 drag.js / spot.js，加 tiltAngle 輸入，加光斑 toggle |

### Phase 2A — 拖拉元件

**實作邏輯：**
- 建立 drag plane（y=0 水平面，含光軸），mouse ray 與此平面求交點 → 取 z 值
- `pointerdown` 時 raycast 判斷是否點中元件 mesh
- 拖拉期間停用 OrbitControls，顯示即時 z 值 tooltip
- `pointerup` 呼叫 `onDragEnd(opticIndex, newZ)`
- integration 端：計算相鄰 free-space `d` 值（前段 + 後段都調整，保持系統總長）
- 最小間距 `MIN_GAP = 0.02m`，不可拖出邊界
- `buildElements()` 建構時在每個 group.userData 存 `opticIndex`

**驗證項目：**
1. 拖拉後元件 mesh 移到正確 z 位置
2. element-list 中相鄰 free `d` 值正確更新（前+後之和不變）
3. 光束即時重算並重繪
4. 邊界夾緊：拖到太靠近相鄰元件時停止
5. 釋放後 OrbitControls 恢復正常

### Phase 2B — 光斑截面

**實作邏輯：**
- `createSpotViewer(scene)` → `{update(samples, tScale), setZ(z), show(), hide()}`
- Geometry：`PlaneGeometry(1,1)` 在 XY 平面，position.z 可調
- Canvas texture 128×128：`I(x,y) = exp(-2*(x²+y²)/w²)` 對應到 disc 半徑 ≈ 2.5w
- 顏色：中心白/青色 → 邊緣透明（`rgba(126,200,227, I)`）
- `setZ(z)` 時：用線性插值從 samples 取得 w(z)，重繪 texture
- 3D 中也可拖拉（和元件拖拉共用 drag plane）
- 面板加「截面」toggle 按鈕 + z 位置數字輸入

**驗證項目：**
1. z=waistZ 時 w 顯示 = w₀（輸入值）
2. z=waistZ+zR 時 w = w₀×√2 ±0.1%
3. 透過鏡片後焦點的 w 符合高斯光學公式
4. canvas texture 視覺上確實是高斯分布（中心亮、邊緣平滑消失）

### Phase 2C — 入射角度

**物理修改：**

`gaussian.js propagate()` 每個 sample 加 `r_c`（centroid 橫向位置）:
- centroid 初始條件：`(r₀=0, θ₀=tiltAngle)`
- 每個 free-space 段：`r_c(z) = r_c_prev + θ_c_prev * dz`
- 每個 optic：`[r_c, θ_c]_out = ABCD * [r_c, θ_c]_in`

`raytrace.js makeParallelRays(halfWidth, n, tiltAngle=0)`:
- 所有光線初始 θ = tiltAngle（偏置所有光線方向）

`sampler.js`:
- `beam.tiltAngle`（預設 0）→ 分別傳給兩個引擎

**渲染修改：**

`envelope.js buildEnvelope(samples, opts)` 中 samples 現在有 `r_c`：
- 改用自訂 BufferGeometry（取代 LatheGeometry）
- 每個 z-slice：建立半徑 w×tScale 的環，環心在 `(r_c×tScale, 0, z)`
- 相鄰兩環之間填 quad（兩個三角形）
- tilt=0 時行為與 LatheGeometry 完全一致（向後相容）

**驗證項目：**
1. tiltAngle=0 → 輸出與 Phase 1 完全相同（回歸測試）
2. θ₀=10 mrad，在 z=0.5m 處：centroid r = 0.5×0.01 = 5mm（±0.1%）
3. 通過薄鏡片（f=0.2m）：centroid 角度改變量符合公式 `Δθ = -r_c/f`
4. 大角度（>50 mrad）顯示 paraxial 警告

**UI 加入：**
- Beam Parameters 區塊加 `θ₀` 欄位，單位 mrad，範圍 ±100 mrad

### 開發順序

```
Phase 2A：drag.js → index.html → integrate  (不動物理層)
Phase 2B：spot.js → index.html → integrate  (不動物理層)
Phase 2C：gaussian.js → raytrace.js → sampler.js
        → envelope.js (自訂 BufferGeometry)
        → integration 加 tiltAngle UI
```

---

## Phase 3 — 厚透鏡

### 設計決策
- Type 名稱：`thickLens`（camelCase，與 `beamExpander` 一致）
- 參數：`{ R1, R2, d, n }`（R>0 曲率中心在右，flat=Infinity）
- 3D 形狀：Phase 1 依 EFL 正負用 biconvex/biconcave，**琥珀色**（與 ideal 藍色區分）
- 薄透鏡標籤改為「Thin Lens (ideal)」
- EFL 在 param-editor 以唯讀欄位即時顯示
- 預設：BK7 (n=1.5168)，R₁=+100mm，R₂=-100mm，d=5mm（EFL≈97mm）

### 修改的檔案
| 檔案 | 說明 |
|------|------|
| `01-physics/02-gaussian/gaussian.js` | `matrixFor()` 加 `case 'thickLens'` |
| `01-physics/03-raytrace/raytrace.js` | `matrixForEl()` 加 `case 'thickLens'` |
| `03-ui/02-element-list/element-list.js` | 加 thickLens defaults/meta/label/param，加 `_thickLensEFL()` helper |
| `03-ui/03-param-editor/param-editor.js` | 加 thickLens config（含 readOnly EFL 欄位），加 readOnly field 渲染，lens 標題改 ideal |
| `02-renderer/04-elements/elements.js` | `buildLensMesh` 加 EFL 計算 + 琥珀色，加 `_thickLensEFL()` helper |

### 注意
- `matrices.js` 的 `thickLens()` 和 `refractingSurface()` 早已存在，不需修改
- `elements.js` 原本就有 `el.type === 'thickLens'` 判斷，已對應
- R1/R2 允許 Infinity（flat surface），ABCD refractingSurface(∞, n1, n2) = flat interface ✓

## Phase 4 — 多波長 + Sellmeier 色散

### 設計決策
- **Sellmeier 資料庫**：BK7、N-SF11、Fused silica、ZnSe（`01-physics/00-sellmeier/sellmeier.js`）
- **thick lens 新欄位**：`material`（'custom'|'bk7'|'nsf11'|'fusedsilica'|'znse'）
  - Custom：手動輸入 n（原有行為，向後相容）
  - 具名材料：Sellmeier 每次模擬自動依 λ 算 n，並在 param-editor 顯示 n 為唯讀 + 灰色
  - n 欄位在切換材料時仍顯示（用 1064nm 參考值），但 disabled
- **Ideal thin lens**：所有波長共用同一 f（achromatic 語義）
- **多波長 UI**：Beam Parameters 改為 wavelength list（最多 4 個），各有 preset 按鈕（405/532/633/780/1030/1064/1310/1550 nm）
- **共用 tScale**：所有波長用相同比例，beam 寬窄可直接比較
- **顏色**：依波長自動分配（可見光接近物理色，IR 用象徵性紫色）
- **Spot viewer**：只顯示第一個波長（主波長）

### 修改的檔案
| 檔案 | 說明 |
|------|------|
| `01-physics/00-sellmeier/sellmeier.js` | **新增** Sellmeier DB + `sellmeierN(material, lambda_m)` |
| `01-physics/04-sampler/sampler.js` | 加 `resolveElements(elements, lambda)` — 依材料算 n(λ)，在 `buildBeamData` 使用 |
| `03-ui/02-element-list/element-list.js` | `_param()` 加材料標籤（如 `[BK7]`） |
| `03-ui/03-param-editor/param-editor.js` | 加 `type:'select'` 支援、`isDisabled` 支援；thickLens 加 `material` 下拉欄位 |
| `04-integration/index.html` | `beamCfg.wavelengths` 陣列、`renderBeam` 多波長迴圈、`buildBeamSection` 新 UI、波長顏色函數 |

### 物理效果
- **色差（chromatic aberration）**：thick lens + 具名材料 → 短波長 n 較大 → 焦距較短 → 焦點位置不同
- **Rayleigh range 差異**：`zR = πw₀²/λ`，短波長 zR 較大（更準直），兩者都可在 3D 中看到

## 待辦事項
- [x] 規劃模組結構、建立 PROJECT.md
- [x] 01-physics/01-matrices：ABCD 矩陣定義（24/24 tests pass）
- [x] 01-physics/02-gaussian：高斯光束傳播（15/15 tests pass，canvas 視覺正確）
- [x] 01-physics/03-raytrace：幾何光線追蹤（24/24 tests pass，彩色光線圖正確）
- [x] 01-physics/04-sampler：整合輸出（31/31 tests pass，combined preview 正確）
- [x] 02-renderer/01-scene：Three.js 場景（場景/相機/OrbitControls/燈光正常）
- [x] 02-renderer/02-envelope：光束包絡面（LatheGeometry 旋轉體 + waist ring，3D 正確）
- [x] 02-renderer/03-rays：幾何光線（rays.js + index.html，方位角 1–6 面/透明度滑桿，focus 位置顯示）
- [x] 02-renderer/04-elements：元件 3D mesh（biconvex/biconcave/mirror/interface，LatheGeometry profile，aperture scale 滑桿）
- [x] 03-ui/01-panel-shell：面板框架（createPanelShell() → panel/viewport/statsBar/addSection，可收合側欄，全管線整合 demo）
- [x] 03-ui/02-element-list：元件列表（add/remove/reorder、選取狀態、onChange(elements, selIdx, structural)、全管線 demo）
- [x] 03-ui/03-param-editor：參數編輯器（unit 轉換、preset 按鈕、輸入驗證，與 element-list.updateSelected() 串接，改值即時重算）
- [x] 04-integration：整合（beam 參數+元件列表+參數編輯器+3D 全管線，λ/w₀/z₀ presets，error banner）
- [x] **Phase 2A** — drag.js（拖拉元件，02-renderer/05-drag/）
- [x] **Phase 2A** — 整合進 04-integration（含驗證）
  - drag.js: createElementDragger, y=0 拖拉平面, hover cursor, isDragging preview/commit 兩段
  - _dragAdjust: prevZ/nextZ 用相鄰 optic 位置（非 currentZ），clamp MIN_GAP=0.02m
  - isDragging=true: mesh 即時移動（不重算光路）；false: setElements + renderBeam
  - 注意：setElements 不觸發 onChange，必須手動呼叫 renderBeam
- [x] **Phase 2B** — spot.js（光斑截面，02-renderer/06-spot/）
- [x] **Phase 2B** — 整合進 04-integration（含驗證）
  - spot.js: createSpotViewer, canvas Gaussian texture (I=exp(-2r²/w²)), disc + ring，可 3D 拖拉
  - 驗證：4/4 通過（w(waist)=w₀, w(zR)=w₀√2, w(2zR)=w₀√5, 任意 z 符合理論）
  - 整合：面板加 Spot Viewer 段落（toggle/z 輸入/w 顯示），80ms setInterval 同步 drag readout
  - 驗證測試用 w0=0.3mm（zR≈0.27m）確保測試位置落在 1.5m 系統內
- [x] **Phase 2C** — gaussian.js 加 centroid 追蹤（15/15 回歸 ✓ + centroid 新測試通過）
- [x] **Phase 2C** — raytrace.js 加 tiltAngle（24/24 回歸 ✓，makeParallelRays 第三參數預設 0）
- [x] **Phase 2C** — sampler.js 傳遞 tiltAngle（31/31 回歸 ✓）
  - 注意：M.applyRay 回傳陣列 [r,theta]，不是物件 {r,theta} → 用 ray[0], ray[1]
- [x] **Phase 2C** — envelope.js 改 custom BufferGeometry（偏軸管道）
  - LatheGeometry → 自訂 BufferGeometry，每個 slice 環心跟 rc*tScale 走
  - 向後相容：rc=0 時視覺與舊版完全一致
  - 偏軸驗證：10mrad tilt，z=1m 時 xLast=0.88 = cx(0.8) + w(0.08) ✓
- [x] **Phase 2C** — 整合進 04-integration（tiltAngle UI + 驗證）

**Phase 3 — 厚透鏡**
- [x] `gaussian.js` / `raytrace.js` — 加 `thickLens` case（呼叫 `M.thickLens`）
- [x] `element-list.js` — 加 thickLens 支援（+ button / label / EFL param / 琥珀色 badge）
- [x] `param-editor.js` — 加 thickLens editor（R₁/R₂/d/n + readOnly EFL），thin lens 標題加 (ideal)
- [x] `elements.js` — `buildLensMesh` 支援 thickLens params（EFL 計算、琥珀色 mesh）
- [x] **瀏覽器驗證** ✓
  - UI：THCK badge（琥珀）、EFL 唯讀欄位、R₁/R₂/d/n 全部正常
  - 物理：det=1、EFL=97.58mm（Lensmaker 公式 vs 矩陣 C 完全吻合）
  - BFD=95.92mm（比 EFL 短 1.66mm = 主平面位移，物理正確）
  - beamCfg 加 tiltAngle:0；buildBeamSection 加 θ₀ 欄位（mrad，±100 mrad）
  - commit 加 validate 屬性支援負值/零值；|θ₀|>50mrad 顯示 paraxial 警告 banner
  - preset 按鈕：-20/-10/0/10/20 mrad
  - stats bar 非零 tiltAngle 時顯示 θ₀=X mrad
  - 定量驗證通過：rc/tc 符合 ABCD 矩陣理論

**Phase 4 — 多波長 + Sellmeier**
- [x] `sellmeier.js` — BK7/N-SF11/fused silica/ZnSe Sellmeier 係數 + `sellmeierN(material, λ)`
- [x] `sampler.js` — `resolveElements()`，buildBeamData 依 λ 自動解析 thick lens 的 n
- [x] `element-list.js` — `_param()` 顯示材料標籤
- [x] `param-editor.js` — select field 支援、isDisabled 支援、thickLens 加 material 下拉
- [x] `index.html` — beamCfg.wavelengths 陣列、renderBeam 多波長、buildBeamSection 新 UI
- [x] **瀏覽器驗證** ✓
  - 多波長 UI：1064nm（IR 紫）+ 532nm（綠），顏色正確
  - zR 比值：5.91m / 2.95m = 2:1（∝ 1/λ）✓
  - 焦點光斑比：42µm / 85µm ≈ 2:1（∝ λ，ideal lens 無色差）✓
  - BK7 材料選擇：n 欄位 disabled=true，n@1064nm=1.5066，n@532nm=1.5195（Δn=0.013）✓
  - 材料切換後 EFL 即時更新（Custom n=1.5168 → BK7 n=1.5066，EFL: 97.6→99.5mm）✓
  - 最多 4 個波長，preset 按鈕（405/532/633/780/1030/1064/1310/1550 nm）✓

- [x] **Bug 調查**：tilt=0 default 場景光路視覺異常（使用者回報「看起來怪怪的」）
  - 調查結果：**非 bug，視覺正確**。
  - Envelope 幾何驗證：第一段（z=0→0.2m）所有 slice 的 r_world=0.01992（常數），完美圓柱 ✓
  - 物理驗證：waist=85µm@z=45cm 符合解析計算 ✓，s.rc 命名一致 ✓
  - 「看起來怪怪的」原因：相機 z=1.2m 在畫面左、z=0 在畫面右，左側大錐形是 output 端強發散（607µm→4818µm），屬正確物理；透視投影讓平行光線看起來像錐形（鐵軌效應）
