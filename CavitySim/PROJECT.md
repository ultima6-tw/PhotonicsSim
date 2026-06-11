# CavitySim — 雷射腔體模式設計工具

## 開發機器
Mac Studio M1 Max（主力）

## 目前狀態
**Phase 6 完成** — CavitySim 全部 6 個 Phase 完成 ✅

| Phase | 說明 | 狀態 |
|-------|------|------|
| Phase 1 | 元件 ABCD 矩陣 | ✅ 30/30 通過 |
| Phase 2 | 往返矩陣 + 穩定性 | ✅ 30/30 通過 |
| Phase 3 | 本徵模提取 w(z) | ✅ 27/27 通過 |
| Phase 4 | 穩定性圖掃描 | ✅ 29/29 通過 |
| Phase 5 | Solver API | ✅ 32/32 通過 |
| Phase 6 | 互動介面 | ✅ 目視確認，三個 preset 全部正常 |

## 定位與架構決策

### 為什麼是獨立模組（方案 B）
- OpticSim 是單向傳播（single-pass），CavitySim 是往返本徵值問題，性質根本不同
- 獨立模組可以各自驗證，不會互相破壞
- 最終整合點清楚：CavitySim 輸出本徵模 q 參數 → 直接當 OpticSim 輸入光束
- 與 NonlinearSim 的整合方式相同（先獨立、後整合）

### 與其他模組的關係
```
CavitySim（本模組）
    ↓ 輸出本徵模 q 參數
OpticSim（已有）— 單向傳播、3D 可視化
    ↓ 光束送進晶體
NonlinearSim（已有）— 非線性轉換效率
```

---

## 檔案結構

```
CavitySim/
├── PROJECT.md                    ← 本檔
├── 01-elements/
│   ├── elements.js               # 所有元件的 ABCD 矩陣
│   └── elements-results.html     # Phase 1 驗證頁
├── 02-physics/
│   ├── roundtrip.js              # 往返矩陣、穩定性
│   ├── eigenmode.js              # 本徵模求解、w(z)
│   ├── stability.js              # 穩定性圖掃描
│   ├── roundtrip-results.html    # Phase 2 驗證頁
│   ├── eigenmode-results.html    # Phase 3 驗證頁
│   └── stability-results.html   # Phase 4 驗證頁
├── 03-solver/
│   ├── cavity-solver.js          # CAVITY namespace（主 API）
│   └── solver-results.html       # Phase 5 驗證頁
└── 04-ui/
    └── index.html                # Phase 6 互動介面
```

---

## 核心物理

### ABCD 矩陣元件

| 元件 | ABCD 矩陣 | 參數 |
|------|-----------|------|
| 自由空間 | `[[1, L]; [0, 1]]` | L [m] |
| 薄透鏡 | `[[1, 0]; [-1/f, 1]]` | f [m] |
| 平面鏡 | `[[1, 0]; [0, 1]]` | — |
| 曲率鏡 | `[[1, 0]; [-2/R, 1]]` | R [m]（曲率半徑）|
| 增益介質 | `[[1, t/n]; [0, 1]]` | n（折射率）、t [m]（長度）|

注意：曲率鏡等效薄透鏡 f = R/2（反射用）。ABCD 行列式 = 1（無損耗元件）。

### 線性腔往返矩陣

從鏡 1 出發，往返一圈（參考平面設在鏡 1 內側）：

```
M_rt = M_mirror1 × M_prop(L) × M_mirror2 × M_prop(L)
```

矩陣相乘順序：**右邊先作用**（最後一個元件最右邊）。

### 穩定條件

```
|Tr(M_rt)| / 2 ≤ 1
```

等同於 g 參數條件：0 ≤ g₁g₂ ≤ 1，其中 g_i = 1 − L/R_i。

### 本徵模求解

往返矩陣 M = [A, B; C, D]，本徵模 q 滿足：

```
q = (Aq + B) / (Cq + D)
→ Cq² + (D−A)q − B = 0
→ q = [(A−D) ± √((A+D)²−4)] / (2C)
```

取 Im(q) > 0 的根（物理解）。

從 q 提取光束參數：

```
1/q = 1/R(z) − iλ/(πw²(z))
w(z) = √(−λ / (π × Im(1/q)))
R(z) = 1 / Re(1/q)
```

沿腔體傳播：q 在下一個元件後的值 = 利用 ABCD 傳播公式：

```
q_out = (A·q_in + B) / (C·q_in + D)
```

---

## Phase 計畫與驗證策略

### Phase 1 — 元件 ABCD 矩陣
**檔案**：`01-elements/elements.js`、`01-elements/elements-results.html`

**API**：
```javascript
makeElement(type, params)  // → {type, M: [[a,b],[c,d]], label}
// type: 'freeSpace' | 'thinLens' | 'flatMirror' | 'curvedMirror' | 'gainMedium'
matMul(M1, M2)   // 2×2 矩陣乘法
matDet(M)        // 行列式（應 = 1 for lossless）
```

**驗證測試（目標 ~15 tests）**：

| # | 測試 | 期望值 |
|---|------|--------|
| 1 | FreeSpace(L=0.1m): M[0][1] | 0.1 |
| 2 | FreeSpace(L=0.1m): M[1][0] | 0 |
| 3 | ThinLens(f=0.05m): M[1][0] | -20 |
| 4 | CurvedMirror(R=0.2m): M[1][0] | -10 (= -2/R) |
| 5 | FlatMirror: M = identity | [[1,0],[0,1]] |
| 6 | GainMedium(n=1.76, t=0.01m): M[0][1] | 0.01/1.76 ≈ 0.005682 |
| 7 | 行列式 FreeSpace | = 1 |
| 8 | 行列式 ThinLens | = 1 |
| 9 | 行列式 CurvedMirror | = 1 |
| 10 | 行列式 GainMedium | = 1 |
| 11 | 合成：ThinLens×FreeSpace M[0][0] | 1 − L/f |
| 12 | 合成：ThinLens×FreeSpace M[0][1] | L |
| 13 | 合成：ThinLens×FreeSpace M[1][0] | −1/f |
| 14 | 合成：ThinLens×FreeSpace M[1][1] | 1 |
| 15 | CurvedMirror = ThinLens(f=R/2) | M 完全相同 |

---

### Phase 2 — 往返矩陣與穩定性
**檔案**：`02-physics/roundtrip.js`、`02-physics/roundtrip-results.html`

**API**：
```javascript
roundTripMatrix(elements)  // elements: [{M}, ...] 按物理順序
// 線性腔：自動鏡像回程（forward + backward）
isStable(M_rt)      // → boolean
traceHalf(M_rt)     // → (A+D)/2，穩定條件 |value| ≤ 1
gParams(R1, R2, L)  // → {g1, g2, product}
```

**驗證測試（目標 ~12 tests）**：

標準測試腔體（λ=1064nm）：

| 腔體 | R₁ | R₂ | L | g₁g₂ | 穩定? |
|------|----|----|---|-------|-------|
| 半球形（hemispherical）| ∞ | 200mm | 100mm | 0.5 | ✅ |
| 同心（concentric）| 100mm | 100mm | 200mm | 1 | 邊界 |
| 共焦（confocal） | 100mm | 100mm | 100mm | 0 | 邊界 |
| 平行平面（planar） | ∞ | ∞ | 任意 | 1 | 邊界 |
| 不穩定 | 100mm | 100mm | 250mm | > 1 | ❌ |

各腔測試：
1. 半球形：isStable = true
2. 半球形：|Tr/2| < 1
3. 同心：|Tr/2| = 1（邊界）
4. 共焦：M_rt = -I（Tr = -2，|Tr/2| = 1）
5. 不穩定腔：isStable = false
6. gParams(∞, 200mm, 100mm): g1=1, g2=0.5, product=0.5
7. gParams(100mm, 100mm, 200mm): product=1（同心邊界）
8. 往返矩陣行列式 = 1（能量守恆）
9. 純自由空間腔（無鏡焦距）: M_rt = identity
10. 對稱腔 M_rt: A = D（對稱性）
11. 平行平面腔：M_rt = [[1, 2L]; [0, 1]]

---

### Phase 3 — 本徵模提取
**檔案**：`02-physics/eigenmode.js`、`02-physics/eigenmode-results.html`

**API**：
```javascript
solveEigenmode(M_rt, lambda_m)
// → {q, w_m, R_m, zR, stable}
// q: complex beam parameter 在參考平面（m）
// w_m: 在參考平面的光斑半徑（m）
// zR: Rayleigh 長度（m）

propagateQ(q, M)    // q 通過 ABCD 元件後的值
beamRadius(q, lambda_m)   // → w [m]
beamCurvature(q)          // → R [m]
modeProfile(q_ref, elements, lambda_m, N_samples)
// → [{z_m, w_m}, ...] 沿腔體的光斑分布
```

**解析驗證測試（目標 ~16 tests）**：

**測試腔 A：半球形腔**（R₁=∞, R₂=0.2m, L=0.1m, λ=1064nm）

M_rt 解析值（推導）：
```
M_rt = [[0, 0.1]; [-10, 0]]
q at flat mirror = 0.1i  (m)
z_R = 0.1 m = L  ✓
w₀ at flat mirror = √(λ·z_R/π) = √(1064e-9 × 0.1 / π) ≈ 5.82 µm
w at curved mirror: q(L) = 0.1 + 0.1i → w = 8.23 µm
Wavefront curvature at curved mirror: R = 0.2m = R₂  ✓（波前貼合鏡面）
```

| # | 測試 | 期望值 | 容差 |
|---|------|--------|------|
| 1 | Im(q) at flat mirror | 0.1 m | < 0.1% |
| 2 | Re(q) at flat mirror | 0 | < 1e-10 |
| 3 | w₀ at flat mirror | 5.82 µm | < 1% |
| 4 | zR | 0.1 m | < 0.1% |
| 5 | w at curved mirror (after propagate L) | 8.23 µm | < 1% |
| 6 | Wavefront R at curved mirror | 200 mm | < 1% |

**測試腔 B：對稱腔**（R₁=R₂=0.2m, L=0.1m, g=0.5, λ=1064nm）

```
g = 1 - L/R = 1 - 0.5 = 0.5
w at mirrors: w_m = (λL/π)^(1/2) × [g/(1-g²)]^(1/4) ...
w₀ at center: 通過 propagateQ 計算
```

| # | 測試 | 期望值 |
|---|------|--------|
| 7 | isStable | true |
| 8 | w at mirror 1 (對稱腔) | w at mirror 2（對稱性）|
| 9 | w at center < w at mirrors | true（腰在中心）|
| 10 | Wavefront R at mirror 1 | = R₁ = 200mm |
| 11 | Wavefront R at mirror 2 | = R₂ = 200mm |

**通用測試**：

| # | 測試 |
|---|------|
| 12 | Im(q) > 0（物理解）|
| 13 | Rayleigh 長度 z_R > 0 |
| 14 | w₀ > 0 |
| 15 | propagateQ 的行列式守恆 |
| 16 | 不穩定腔：solveEigenmode 返回 {stable: false} |

---

### Phase 4 — 穩定性圖掃描
**檔案**：`02-physics/stability.js`、`02-physics/stability-results.html`

**API**：
```javascript
scanStability(R1_m, R2_m, L_range_m, N_points)
// → [{L, g1, g2, product, stable, w_mirror1, w_mirror2}, ...]

g1g2Point(R1_m, R2_m, L_m)
// → {g1, g2, product, region}
// region: 'stable' | 'unstable' | 'boundary'
```

**驗證測試（目標 ~10 tests）**：

| # | 測試 | 期望 |
|---|------|------|
| 1 | L=0（腔長=0）→ g=1, stable | true |
| 2 | L=R（共焦）→ g=0, boundary | g₁g₂=0 |
| 3 | L=2R（同心）→ g=-1, boundary | g₁g₂=1 |
| 4 | L=2R+ε → unstable | false |
| 5 | Scan L: stable region = (0, 2R)（不含端點）| 連續穩定區間 |
| 6 | w_mirror → ∞ 當 L→2R（同心）| diverge |
| 7 | w₀ → ∞ 當 L→2R（同心）| diverge |
| 8 | g1g2Point 落在 g₁g₂ 平面正確位置 | product ≈ g1×g2 |
| 9 | 半球形在掃描中出現 w₀_min | w₀ 有極小值 |
| 10 | 掃描結果單調：L↑ → g↓ | monotone for fixed R |

---

### Phase 5 — 高階 Solver API
**檔案**：`03-solver/cavity-solver.js`、`03-solver/solver-results.html`

**Namespace**：`CAVITY`

**API**：
```javascript
CAVITY.solve({
  elements,      // [{type, params, label}, ...]
  lambda_nm,     // 波長 [nm]
  cavity_type,   // 'linear' | 'ring'（Phase 5 只做 linear）
})
// → {
//   stable: bool,
//   M_rt: [[a,b],[c,d]],
//   eigenmode: {q, w_m, R_m, zR},
//   profile: [{z_m, w_m, label}, ...],
//   g_params: {g1, g2, product},
//   trace_half: number,
// }

CAVITY.scanLength({
  R1_m, R2_m,
  intracavity_elements,   // 腔內其他元件
  lambda_nm,
  L_range: [L_min, L_max],
  N: 200,
})
// → [{L, stable, w1, w2, w0_center}, ...]

CAVITY.findWaist({
  cavity_config,
  target_w0_um,
  variable: 'lens_f' | 'separation',
})
// → {found: bool, value, actual_w0_um}
```

**驗證測試（目標 ~12 tests）**：
- 整合 Phase 1-4，確認 API 一致性
- 輸入驗證（無效腔體、缺少元件等）
- 單位換算一致（nm → m 自動轉換）

---

### Phase 6 — 互動介面
**檔案**：`04-ui/index.html`

**功能**：
- 新增/刪除/編輯腔體元件（表格式）
- 即時顯示穩定/不穩定（紅/綠指示）
- w(z) 剖面圖（SVG/Canvas）
- g₁g₂ 穩定性圖，標示目前工作點
- 匯出本徵模 q → 供 OpticSim 使用的格式
- 預設範例：半球形腔、對稱腔

**驗證**：瀏覽器目視確認，不做自動化測試。

---

### Phase 7 — 完成（2026-06-11）— OpticSim 整合

**實作**：
- `04-ui/index.html`：「EXPORT → OPTICSIM」區塊更新，顯示正確的 OpticSim beam params（w₀, waistZ, λ, w@M1）
- 「Copy OpticSim URL」按鈕：`navigator.clipboard.writeText(url)` 複製含 URL params 的路徑（`?lambda_nm=&w0_mm=&waistZ_cm=`）
- `OpticSim/04-integration/index.html`：init 時讀取 URLSearchParams，覆寫 `beamCfg`（w₀, waistZ, λ），並顯示 4s toast 通知

**物理轉換**（eigenmode at M1 → OpticSim beam）：
```
w₀  = √(zR × λ / π)         (beam waist size)
waistZ = −Re(q_M1)           (waist pos from M1; −=inside cavity, 0=at flat mirror)
```

**驗證**（hemispherical cavity, R₂=200mm, L=100mm, λ=1064nm）：
- CavitySim 輸出：w₀=184.03µm, waistZ=0mm（平面鏡 M1 → 腰徑就在 M1）
- OpticSim 載入後：w₀=0.18mm, z₀=0.0cm, zR=0.10m → 全部一致 ✓

**流程**：腔體設計 → 複製 URL → 貼到新分頁 → OpticSim 自動帶入光束尺寸進行後續光學設計

---

## 關鍵設計決策

### 複數運算
JavaScript 無內建複數，需實作：
```javascript
// 複數物件: {re, re} 或用 [re, im] 陣列
const C = {
  add: (a, b) => ({re: a.re+b.re, im: a.im+b.im}),
  mul: (a, b) => ({re: a.re*b.re-a.im*b.im, im: a.re*b.im+a.im*b.re}),
  div: (a, b) => { const d = b.re**2+b.im**2; return {re:(a.re*b.re+a.im*b.im)/d, im:(a.im*b.re-a.re*b.im)/d}; },
  sqrt: (a) => { const r=Math.sqrt(a.re**2+a.im**2); const th=Math.atan2(a.im,a.re)/2; return {re:Math.sqrt(r)*Math.cos(th), im:Math.sqrt(r)*Math.sin(th)}; },
}
```

### 線性腔的「展開」（Unfolding）
線性腔把光路展開成等效單向傳播：
```
[Mirror1] → [elements...] → [Mirror2] → [elements reversed] → [Mirror1]
```
程式實作：elements 正序 + 反序，各夾一個鏡子元件。

### 參考平面選擇
預設：參考平面設在 Mirror1 的內側面（光剛離開鏡面後）。
`modeProfile` 從 Mirror1 出發沿腔體採樣。

### 單位統一
所有內部計算用 SI 單位（m），API 邊界做換算：
- 輸入：params 用 mm 或 nm（對使用者友善）
- 內部：m
- 輸出：µm for spot sizes，mm for distances

---

## 待辦事項

- [x] Phase 1：elements.js + elements-results.html（30/30 ✓）
- [x] Phase 2：roundtrip.js + roundtrip-results.html（30/30 ✓）
- [x] Phase 3：eigenmode.js + eigenmode-results.html（27/27 ✓）
- [x] Phase 4：stability.js + stability-results.html（29/29 ✓）
- [x] Phase 5：cavity-solver.js + solver-results.html（32/32 ✓）
- [x] Phase 6：04-ui/index.html（互動介面，三 preset 目視確認）
- [x] Phase 7：OpticSim 整合 — export eigenmode → beam params，Copy URL → OpticSim URL params init（2026-06-11 ✓）
