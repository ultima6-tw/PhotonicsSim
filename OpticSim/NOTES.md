# OpticSim — 操作筆記與當前狀態

## 快速上手

開啟：`04-integration/index.html`（直接用瀏覽器，不需 server）

## Phase 2 已完成的功能

### 2A — 拖拉元件
- 左鍵點住鏡片，沿 z 軸拖動即可移動
- 相鄰 free-space 段自動調整，系統總長不變
- 最小間距 20mm，釋放後重算光路

### 2B — 光斑截面
- 左側面板 > Spot Viewer > Show cross-section
- 圓盤顯示該 z 位置的高斯強度分布
- 可在面板輸入 z 值，或直接在 3D 中拖動圓盤
- 顯示 w(z) 數值（µm）

### 2C — 入射角度 θ₀
- 左側面板 > Beam Parameters > θ₀（單位 mrad）
- preset 按鈕：-20 / -10 / 0 / 10 / 20 mrad
- |θ₀| > 50mrad 會顯示 paraxial 警告
- 光束管道和幾何光線都會跟著偏轉

## 待查問題

**光路視覺異常**（使用者回報 tilt=0 時「看起來怪怪的」）

可能原因：
1. `envelope.js` 改成 custom BufferGeometry 後，tilt=0 的外觀與 Phase 1 不一致
2. 幾何光線顯示有問題（`rays.js` 沒改，但 `tiltAngle=0` 邏輯路徑有沒有動到？）
3. 相機/場景視角問題（非光路本身的問題）

建議查法：
1. 開 `04-integration/index.html`，確認 tilt=0 預設場景截圖
2. 開 `02-renderer/02-envelope/index.html`，確認 envelope tilt=0 外觀
3. 對比 `02-renderer/03-rays/index.html` 的光線顯示

## 檔案結構摘要

```
01-physics/
  01-matrices/matrices.js     — ABCD 矩陣（不需修改）
  02-gaussian/gaussian.js     — 高斯傳播 + centroid 追蹤
  03-raytrace/raytrace.js     — 幾何光線 + tiltAngle 初始角
  04-sampler/sampler.js       — 統一輸出 buildBeamData()

02-renderer/
  02-envelope/envelope.js     — custom BufferGeometry 管道（支援偏軸）
  05-drag/drag.js             — createElementDragger()
  06-spot/spot.js             — createSpotViewer()

04-integration/index.html     — 主入口，所有功能整合在此
```

## 關鍵 API 備忘

```javascript
// 物理計算
buildBeamData({ beam: {lambda, w0, waistZ, tiltAngle}, elements, sampling })
// → { gaussian: {samples, waists, meta}, rays: {paths}, optics, meta }

// gaussian.samples[i] 有：
// { z, w, Rcurv, qr, qi, rc, thetac, boundary }

// M.applyRay 回傳陣列（不是物件）
const [r_out, theta_out] = M.applyRay(mat, r_in, theta_in);

// 拖拉
createElementDragger(renderer, camera, controls, (opticIndex, rawZ, isDragging) => {...})
dragger.setGroups([{group: THREE.Group, opticIndex: number}])

// 光斑
createSpotViewer(scene) → {update(samples, tScale), setZ(z), getZ(), getW(), show(), hide()}
```
