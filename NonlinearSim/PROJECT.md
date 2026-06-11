# NonlinearSim — 非線性光學模擬引擎

## 開發機器
Mac Studio M1 Max（主力）

## 目前狀態
**Phase 1–16 全部完成 + OPO Threshold 模組** — 設計決策等級功能齊備

### 升級計劃：設計決策等級（Phase 12–16）
| Phase | 說明 | 狀態 |
|-------|------|------|
| Phase 12 | 耗盡泵浦 tanh²（efficiency.js） | ✅ 17/17 通過 |
| Phase 13 | Boyd-Kleinman h(ξ,B) 聚焦積分 | ✅ 16/16 通過 |
| Phase 14 | d_eff(θ) 從 d 張量動態計算 | ✅ 22/22 通過 |
| Phase 15 | GVD / GVM 輸出 | ✅ 26/26 通過 |
| Phase 16 | 溫度調諧 n(λ,T)（BBO/KTP/LBO） | ✅ 28/28 通過 |
| OPO Threshold | OPO 閾值計算（opo-threshold.js） | ✅ 25/25 通過 |

### 文獻對照結果（2026-06-11 驗證）
| 晶體 | 我們的結果 | 文獻值 | 評估 |
|------|-----------|--------|------|
| BBO Type-I SHG 1064→532nm | θ = 22.8° | 22.8°（Kato 1986 同源） | ✅ 完全吻合 |
| KTP Type-II XY 1064→532nm | φ = 24.78° | 23.5°（廠商通用值，Bierlein 1989） | ⚠️ Kato 1994 內部一致，不同 Sellmeier 源頭 |
| LBO Type-I XY 1064→532nm | φ = 11.61° | 11.3–11.4° | ✅ < 0.3° 吻合 |
| PPLN QPM 1064→532nm 25°C | Λ = 6.73 µm | 6.5–6.7 µm（各廠商） | ✅ 在範圍內 |

KTP 的 1.3° 偏移是 Sellmeier 來源版本問題，Δk=0 數值驗證正確，非程式碼錯誤。
lbo.js 引用標籤已修正（原誤標為 Kato & Takaoka 2002 KTP 論文，應為 Kato 1994, IEEE J. QE 30, 881）。

### 效率計算驗證（Arizona OPTI511L 設定，2026-06-11）

參考：University of Arizona OPTI511L Experiment 3（KTP SHG 實驗手冊）
`NL.getSHGAngle({ crystal:'ktp', pump_nm:1064, type:'II', L_mm:5, P_W:0.150, w0_um:... })`

| 透鏡 | 焦點 w₀ | ξ=L/(2z_R) | η | P_SHG |
|------|---------|------------|---|-------|
| f=100mm | 13.55 µm | 4.61 | 0.037% | 0.055 mW |
| f=50mm  | 6.77 µm  | 18.52 | 0.147% | 0.220 mW |

BK 最佳 ξ=2.84，對應 w_opt≈12.9 µm（f≈108mm）。
f=50mm 效率 4× 高——與手冊預期結論（緊聚焦勝出）一致。
KTP PM 角 φ=24.78°，d_eff=3.5 pm/V，n_pump=n_sh=1.788（Type-II 兩泵浦光子平均 = SH 折射率，此為相位匹配恆等式）。

### OPO Threshold 模組 — 完成（25/25 ✓）

**新增的檔案**：
| 檔案 | 說明 |
|------|------|
| `02-physics/opo-threshold.js` | OPO 閾值計算主模組 |
| `02-physics/opo-threshold-results.html` | 驗證頁 25/25 ✓ |

**核心公式（BK formulation）**：
```
G = Γ²_spec × (2n_p/λ_p) × L × h(ξ) × P_pump
P_th = G_th × λ_p / (2n_p × Γ²_spec × L × h(ξ))

Γ²_spec = 2 d_eff² ω_s ω_i / (n_p n_s n_i ε₀ c³)  [W⁻¹]
h(ξ) = arctan²(ξ)/ξ  (B=0, σ=0, 精確解析式)
G_th(DRO) = δ_s × δ_i
G_th(SRO) = δ_s
```

**最佳聚焦**：P_th 在 ξ_opt≈1.391（h_max≈0.645）時最小，對應
w₀_opt = √(Lλ_p/(2πn_p ξ_opt))

**CavitySim 接口**：`opo_threshold_from_zR({..., zR_m})` 直接接受 CavitySim eigenmode 的 zR。
w₀ = √(λ_p × zR_free / π) → ξ = bk_xi(L, λ_p, n_p, w₀)

**物理量驗證**：
- KTP DRO（L=20mm, w₀=50µm, δ=1%）：P_th ≈ 248 mW
- KTP 最佳聚焦（w₀_opt=37.3µm）：P_th_min ≈ 216 mW
- BBO 790nm（IAMS）DRO（L=15mm, w₀_opt=23µm, δ=2%）：P_th_min ≈ 334 mW

**公開 API**：
- `opo_specGamma2(d_eff, λ_s, λ_i, n_p, n_s, n_i)` → Γ²_spec [W⁻¹]
- `opo_singlePassGain(...)` → {G, xi, h}
- `opo_threshold({...})` → {P_th_W, xi, h, G_th, Gamma2, w0_um}
- `opo_threshold_from_zR({..., zR_m})` → 同上 + zR_m（CavitySim 接口）
- `opo_scanL(base, L_min, L_max, N)` → [{L_mm, P_th_W, xi, h}]
- `opo_scanW0(base, w_min, w_max, N)` → [{w0_um, P_th_W, xi, h}]
- `opo_optimalW0(base)` → {w0_opt_um, P_th_min_W, xi_opt, h_opt}

---

### Phase 16 — 完成（28/28 ✓）— 溫度調諧 n(λ,T)

**新增的檔案**：
| 檔案 | 說明 |
|------|------|
| `02-physics/thermal.js` | thermoCorrectedCrystal()、nAtT()、lbo_noncritical_T() |
| `02-physics/thermal-results.html` | 驗證頁 28/28 ✓ |

**核心功能**：
- `thermoCorrectedCrystal(id, T_C)` → 傳回與原晶體相同介面的溫度修正包裝器，n(λ,T) 自動替換
- `nAtT(crystal_id, axis, lam_nm, T_C)` → 直接查詢任意晶體/軸/波長/溫度的折射率
- `lbo_noncritical_T(pump_nm)` → 解析計算 LBO noncritical PM 溫度

**物理模型**：
```
n(λ,T) ≈ n(λ,25°C) + α(λ) × (T − 25)
α(λ)：在 532nm 和 1064nm 之間線性插值（根據文獻校準）
```

**關鍵物理發現（LBO 溫度調諧的核心）**：
```
LBO dnx/dT(532nm) ≈ +2.0×10⁻⁴ /°C   ← 正值！（短波長強電子耦合）
LBO dnz/dT(1064nm) ≈ −1.8×10⁻⁵ /°C  ← 近零負值

差值：+2.18×10⁻⁴ /°C
初始 gap：nz(1064,25°C) − nx(532,25°C) = 1.6054 − 1.5785 = 0.0269
T_noncrit = 25 + 0.0269/2.18×10⁻⁴ = 148.1°C ≈ 149°C ✓
```

**各晶體 dn/dT 符號**（物理來源不同）：
| 晶體 | 方向 | 符號 | 量級 | 說明 |
|------|------|------|------|------|
| LBO x,y 軸（532nm） | 正 | + | ~1-2×10⁻⁴ | 電子極化率隨 T 增強 |
| LBO z 軸（1064nm） | 負 | − | ~1.8×10⁻⁵ | 一般晶格膨脹效應 |
| KTP 全軸 | 正 | + | ~1-2×10⁻⁵ | 鐵電材料特性 |
| BBO o/e 軸 | 負 | − | ~1-2×10⁻⁵ | 典型非線性晶體 |

**LBO PM 角 vs 溫度（1064→532nm Type-I XY 平面）**：
| 溫度 | PM 角 φ | 說明 |
|------|---------|------|
| 25°C | 11.6° | 室溫角度相位匹配（有走離） |
| 100°C | 45.1° | 中間態 |
| 148°C | 90° | **非臨界相位匹配**（零走離） |

PM 角解析公式（biaxial XY Type-I SS→F）：
```
sin²φ = (1/nz² − 1/ny²) / (1/nx² − 1/ny²)
其中 nz=nz(1064,T)，nx,ny 為 n(532,T)
sin²φ ≥ 1 時→ 已達 noncritical（φ=90°）
```

**`thermoCorrectedCrystal` 設計決策**：
- 傳回 `Object.create(base)` 繼承所有屬性，只覆寫 `.n()` 方法
- dT=0 直接傳回 base crystal（無包裝開銷）
- solver.js、solveSHG_biaxial 等無需修改（介面不變）
- PPLN 傳回 base（ppln.js 已有 Gayer 2008 T-Sellmeier）

**來源**：
- LBO：Ye & Kurtz (1993)，校準至 T_noncrit=149°C（實驗值）
- KTP：Feve et al. (1995)，approximate
- BBO：Kato (1986) / Eimerl (1987)

---

### Phase 15 — 完成（26/26 ✓）— GVD / GVM 輸出（更新：加入 KTP Type-II 三參數 GVM）

**新增/修改的檔案**：
| 檔案 | 變更 |
|------|------|
| `02-physics/gvd.js` | 新增：groupIndex、groupVelocity、gvd、gvm_shg、gvmWalkoffLength、gvdBandwidthLimit |
| `02-physics/gvd-results.html` | 驗證頁 26/26 ✓（新增 Section 5b：KTP Type-II 三參數 GVM） |
| `03-solver/solver-results.html` | 加載 gvd.js |

**物理公式**：
```
群折射率:   N = n − λ dn/dλ
群速度:     vg = c/N                              [m/s]
GVD:        β₂ = (λ³/2πc²) × d²n/dλ²           [fs²/mm]
GVM:        δ = (N_pump − N_SH) / c              [fs/mm]
走離長度:   L_walk = τ_pulse / |δ|              [mm]
BW 極限:    Δλ_GVD = λ²√(2ln2/π) / (c|β₂|L)   [nm]
```
數值微分：4 階 5 點中心差分，步長 h=1nm，精度 < 0.01%。

**關鍵物理發現（Kato 1986 BBO Sellmeier）**：
| 晶體/偏振 | λ (nm) | β₂ (fs²/mm) | 說明 |
|---------|--------|------------|------|
| BBO ordinary | 400 | ~320 | 正常色散 |
| BBO ordinary | 532 | ~145 | 正常色散 |
| BBO ordinary | 800 | ~72  | 正常色散，≈Trebino 書 58 fs²/mm ✓ |
| BBO ordinary | 1064 | ~40 | 正常色散 |
| BBO ordinary | 1550 | < 0 | 異常色散（ZDW ≈ 1200nm） |

**GVM 符號說明**（重要，不同文獻定義不同）：
```
δ = 1/vg(pump,ω) − 1/vg(SH,2ω) = (N_pump − N_SH) / c
```
對 BBO/PPLN 而言，SH（532nm）群折射率 > pump（1064nm），故 δ < 0。
物理意義：pump 到達晶體出口時，SH 仍落後 |δ|×L_mm [fs]。

| 晶體/過程 | GVM (fs/mm) | 走離長度 (100fs 脈衝) |
|---------|------------|-------------------|
| BBO Type-I 1064→532nm | −79.6 | 1.26 mm |
| BBO Type-I 800→400nm | −(類似量級) | — |
| PPLN eee 1064→532nm | −823.7 | 0.12 mm |

PPLN GVM 比 BBO 大 10×，是因為 LiNbO₃ 在 532nm 附近色散極陡（石英晶格共振效應）。

**KTP Type-II GVM — 三個參數**（2026-06-11 修正，原計算只報 GVM₁）：

Type-II SF→F：慢泵浦 (nz,ω) + 快泵浦 (nfast,ω) → 快 SH (nfast,2ω)

| 參數 | 偏振組合 | 計算值 | 文獻範圍 | 說明 |
|------|---------|--------|---------|------|
| GVM₁₂ | nz(1064) vs nfast(1064) | **+307.8 fs/mm** | 250–400 fs/mm ✓ | 兩泵浦偏振走離（最關鍵） |
| GVM₁ | nz(1064) vs nfast(532)  | −115.5 fs/mm | — | 慢泵浦 vs SH |
| GVM₂ | nfast(1064) vs nfast(532) | −423.3 fs/mm | — | 快泵浦 vs SH（最大走離） |

**設計意義**：GVM₁₂=307.8 fs/mm → 100fs 脈衝有效長度僅 0.32mm，比 BBO Type-I（L_walk=1.26mm）短 4×。
BBO 的飛秒 SHG 優勢正是因為 Type-I 兩泵浦光子偏振相同（無 GVM₁₂），只有 pump→SH 走離。

**PM 驗證**：(nz+nfast)/2@1064 = nfast@532 = 1.7881（Type-II 相位匹配恆等式，差值 < 1e-6 ✓）

**驗證方法**：
- 解析公式測試（已知二次多項式 n(λ) → β₂ 精確可算，數值偏差 < 0.01%）
- 3點 vs 5點差分自洽性（< 0.1%）
- BBO 正常色散單調性（400→1064nm β₂ 遞減）
- 常數 n(λ) → GVM = 0（到機器精度）

---

### Phase 14 — 完成（22/22 ✓）— d_eff(θ) 從 d 張量動態計算

**新增/修改的檔案**：
| 檔案 | 變更 |
|------|------|
| `02-physics/deff.js` | 新增：BBO/KTP/LBO/KDP/PPLN 的 d_eff(θ) 公式（Voigt 張量投影） |
| `02-physics/deff-results.html` | 驗證頁 22/22 ✓ |
| `03-solver/solver.js` | 移除硬編碼 `_DEFF` 表，改呼叫 `getDeff(crystal_id, type, angle_deg)` |
| `03-solver/solver-results.html` | 加載 bk-focus.js + deff.js（79/79 回歸 ✓） |
| `04-ui/index.html` | 同上 |

**各晶體公式（從 Voigt d 張量 Veillet 投影推導）**：
```
BBO (3m, φ=90° cut)
  Type-I:  d_eff = d₂₂ cosθ + d₃₁ sinθ     d₂₂=2.2, d₃₁=−0.16 pm/V
  Type-II: d_eff = d₂₂|cos 2θ|              (近似)

KTP (mm2, XY 平面 SF→F)
  Type-II: d_eff = d₁₅ sin²φ + d₂₄ cos²φ   d₁₅=2.04, d₂₄=3.92 pm/V
  推導：ê_fast=(-sinφ, cosφ, 0)，ê_slow=ẑ → S₄=cosφ, S₅=−sinφ → d_eff 由定義

LBO (mm2, XY 平面 SS→F)
  Type-I: d_eff = d₃₂ cosφ − d₃₁ sinφ      d₃₁=−0.67, d₃₂=0.85 pm/V
  推導：ê₁=ê₂=ẑ → S₃=1 → P=(d₃₁,d₃₂,d₃₃) → d_eff = ê_fast · P

KDP (−42m, φ=45° cut)
  Type-I: d_eff = d₃₆|sinθ|                 d₃₆=0.39 pm/V

PPLN (QPM)
  d_eff = (2/π) × d₃₃ = 17.19 pm/V         (角度無關)
```

**驗證對照（Dmitriev 1999 / Kato 1994）**：
| 晶體/類型 | PM角 | 計算值 | 文獻值 | 誤差 |
|---------|------|-------|--------|------|
| BBO Type-I 1064nm | θ=22.8° | 1.966 pm/V | 2.0 pm/V | 1.7% |
| BBO Type-I 800nm  | θ=29.2° | 1.843 pm/V | 1.85 pm/V | 0.4% |
| BBO Type-II 1064nm| θ=33.6° | 0.853 pm/V | 0.88 pm/V | 3.1% |
| KTP Type-II 1064nm| φ=23.5° | 3.621 pm/V | 3.5 pm/V | 3.5% |
| LBO Type-I 1064nm | φ=11.3° | 0.965 pm/V | 0.85 pm/V | 13.5% |
| PPLN QPM | — | 17.19 pm/V | 17.2 pm/V | 0.06% |

LBO 誤差 13.5% 在 d 張量值的文獻不確定度範圍內（各來源 d₃₁/d₃₂ 差異 ±20%）。

**決策紀錄**：
- solver.js 移除 `_DEFF` 硬編碼表，各晶體 d_eff 隨 PM 角動態計算
- KTP φ=0°: d_eff=d₂₄=3.92 pm/V (極限精確); KTP φ=90°: d_eff=d₁₅=2.04 pm/V (精確)
- 這使得 findCombinations 在掃描不同角度時 d_eff 自動跟著更新

---

### Phase 12 — 實作完成，待驗證 — 耗盡泵浦 tanh²

**修改的檔案**：
| 檔案 | 變更 |
|------|------|
| `02-physics/efficiency.js` | 抽出 `_shg_Gamma()` 內部函數；`shg_efficiency()` 改為 tanh²；`shg_gamma()` 改呼叫 `_shg_Gamma()` |
| `02-physics/efficiency-depleted-results.html` | 驗證頁（4 個 section，共 ~18 項測試） |

**物理模型**（Armstrong 1962）：
```
Γ = 2ω²d²L² / (n²_pump · n_sh · c³ε₀ · A)   [1/W]
γ = √(Γ · P)                                   [無因次]
η = tanh²(γ)                                   [正確飽和，η < 1 恆成立]
```
小訊號極限（γ→0）：tanh²(γ) ≈ γ² = Γ·P（退回舊公式 ✓）

**驗證步驟**：開啟 `efficiency-depleted-results.html`，確認全部 PASS。

**決策紀錄**：
- `shg_gamma()` 改呼叫 `_shg_Gamma()` 而非 `shg_efficiency(P=1)`，確保 Γ 是純物理係數不受 tanh² 影響
- `shg_efficiency()` 向後相容（同樣參數簽名），低功率數值幾乎不變
- 驗證頁有 `const _C`/`const _EPS` 衝突 bug：inline script 不可重複宣告 efficiency.js 的 top-level const，否則整個 script 靜默失敗

---

### Phase 13 — 完成（16/16 ✓）— Boyd-Kleinman 聚焦積分

**新增/修改的檔案**：
| 檔案 | 變更 |
|------|------|
| `02-physics/bk-focus.js` | 新增：bk_h(ξ,B)、bk_xi、bk_B、bk_Gamma、bk_optimal_w0 |
| `02-physics/efficiency.js` | shg_efficiency 改用 BK 公式（加 rho_mrad 參數） |
| `02-physics/bk-focus-results.html` | 驗證頁 16/16 ✓ |

**物理模型（BK 1968）**：
```
h(ξ, B=0) = arctan²(ξ) / ξ             [解析解]
ξ_opt ≈ 1.391  →  h_max ≈ 0.645        [σ=0，Δk=0]
Γ_BK = 2ω²d²Lk₁ / (π n²_pump n_sh c³ε₀)  [1/W，與 w₀ 無關]
η = tanh²(√(Γ_BK · P · h(ξ, B)))
```

**重要澄清**：
- ξ_opt=2.84, h=1.068 是文獻常引用值，但那是允許 Δk≠0（σ_opt≈0.57）的**全域最佳**
- 晶體調到 Δk=0 時，正確最佳聚焦是 ξ_opt≈1.391，h_max≈0.645
- 舊平面波公式 η ∝ 1/w₀²（永遠說越緊越好）是錯的；BK 公式在 ξ=1.39 後效率下降

**各晶體最佳 w₀（σ=0，B=0）**：
| 晶體 | L | w₀_opt | ξ_opt |
|------|---|--------|-------|
| BBO 1064nm | 10mm | 27.1 µm | 1.39 |
| KTP 1064nm | 5mm  | 18.4 µm | 1.39 |
| PPLN 1064nm | 30mm | 41.2 µm | 1.39 |

**決策紀錄**：
- `bk-focus.js` 必須在 `efficiency.js` 之前載入（效率公式依賴 bk_Gamma、bk_h 等全域函數）
- B>0（走離）的數值積分留待 Phase 16 實作；目前 B=0 已涵蓋 PPLN、LBO noncritical PM、KDP

---

### 已完成
| Phase | 說明 | 驗證結果 |
|-------|------|---------|
| Phase 1 | 晶體 Sellmeier（BBO/KTP/LBO/KDP/PPLN） | 23/23 ✓ |
| Phase 2 | ne(θ)、Δk 計算 | 13/13 ✓ |
| Phase 3 | SHG 求解器（Type-I/II + 走離角） | 14/14 ✓ |
| Phase 4 | OPO 調諧曲線（BBO 532/355/1064nm） | 14/14 ✓ |
| Phase 5 | PPLN QPM 溫度調諧（SHG + OPO） | 9/9 ✓ |
| Phase 6 | SHG 轉換效率 + 接受頻寬（BBO/KTP/KDP/PPLN） | 16/16 ✓ |
| Phase 7 | Solver API（NL namespace，OpticSim 介面） | 64/64 ✓ |
| Phase 8 | 視覺化 UI（panel + 圖表 + 組合清單） | 瀏覽器測試 ✓ |
| Phase 9 | 雙軸 PM solver（KTP/LBO XY+XZ plane） | 19/19 ✓ |
| Phase 10 | 雙軸 PM 整合進 solver.js | 79/79 ✓ |
| Phase 11 | OpticSim 接入（NL panel section） | 瀏覽器測試 ✓ |

### Phase 11 — 完成 — OpticSim 接入

**修改的檔案**：
| 檔案 | 變更 |
|------|------|
| `OpticSim/04-integration/index.html` | 加載 NonlinearSim 所有 scripts；新增 NL CSS；新增 "Nonlinear Crystal" panel section |

**接入方式**：
- OpticSim panel 新增 "NONLINEAR CRYSTAL" section（預設收起）
- 輸入：pump λ（從當前 beamCfg 自動帶入）+ L crystal
- "Find SHG Combinations" 按鈕 → `NL.findCombinations` → 顯示所有 SHG 組合排行
- 每列有 Apply 按鈕 → `NL.toOpticSimWavelengths` + `NL.toOpticSimElement` → 更新 wavelengths 並插入標準 SHG 場景

**Apply 後的標準場景**：
```
[free 15cm] → [lens f=150mm] → [free 5cm] → [thickLens crystal] → [free 30cm]
```
聚焦鏡將光束從 w₀=1mm 收縮至晶體中約 50µm，符合非線性轉換的典型條件。

**驗證**：
- PPLN Apply 後：wavelengths = [1064nm, 532nm]，element list 含 THCK(ppln, n=2.154)
- 3D viewport：黃色 PPLN + 藍綠雙色光束（1064nm + 532nm）
- Stats bar 確認聚焦：λ=1064nm w=51µm，λ=532nm w=26µm（正確聚焦縮小）

**API mapping**：
- `toOpticSimWavelengths` 回傳 `{lambda_m}` → OpticSim 需要 `{lambda}` → 在接入層做 `w => ({lambda: w.lambda_m})` mapping

---

### Phase 10 — 完成 (79/79 ✓) — 雙軸 PM 整合進 solver.js

**修改的檔案**：
| 檔案 | 變更 |
|------|------|
| `03-solver/solver.js` | `getSHGAngle` 加 biaxial branch |
| `03-solver/solver-results.html` | 新增 Section 8（15 項 biaxial 測試，64→79 ✓） |

**設計決策**：
- `getSHGAngle` 偵測 `crystal_type.startsWith('biaxial')` → 走獨立路徑，直接用 `solveSHG_biaxial` 已算好的 `n_pump`/`n_sh`
- `bw_nm`/`bw_mrad` 設 null（頻寬公式是單軸特定的，待後續實作）；`walk_off_mrad` 暫設 0
- `findCombinations` SHG 路徑不需修改：已有 array 展開處理，KTP/LBO 現在自動出現在結果
- OPO 路徑保持原有 try/catch，biaxial OPO 跳過（行為不變）
- 回傳格式加 `plane`（'XY'|'XZ'）和 `pm_process`（'SF→F' 等），與 uniaxial 結果可共存

**驗證結果**（KTP 1064→532nm）：
- KTP Type-II XY：φ=24.78°，eta_pct≈0.071%，n_pump≈1.748，n_sh≈1.788
- KTP Type-I：null（正確，KTP 在此波段無 Type-I XY PM）
- LBO Type-I：array [XY SS→F φ=11.61°, XZ φ=32.26°]
- findCombinations(532, 1064) 結果現包含 KTP + LBO

---

### Phase 9 — 完成 (19/19 ✓) — 雙軸 PM Solver

**修改的檔案**：
| 檔案 | 新增內容 |
|------|---------|
| `02-physics/sellmeier.js` | `neEff_biaxial_xy(φ, λ, crystal)`、`noEff_biaxial_xy(λ, crystal)` |
| `02-physics/phase-match.js` | XY plane Δk 函數（4種）、`solveSHG_biaxial()`、`solveSHG()` dispatch |
| `02-physics/biaxial-results.html` | 驗證頁 19/19 ✓ |

**物理公式（XY plane，φ = x 軸起算角度）**：
```
n_fast(φ,λ) = [sin²φ/nx(λ)² + cos²φ/ny(λ)²]^(-1/2)
n_slow(λ)   = nz(λ)

Type-I SS→F:  Δk = (4π/λ)(n_fast(2ω,φ) − nz(ω))          ← LBO
Type-I FF→S:  Δk = (4π/λ)(nz(2ω) − n_fast(ω,φ))
Type-II SF→F: Δk = (2π/λ)(2·n_fast(2ω,φ) − nz(ω) − n_fast(ω,φ))  ← KTP
Type-II SF→S: Δk = (2π/λ)(2·nz(2ω) − nz(ω) − n_fast(ω,φ))
```

**驗證結果**：
| 晶體 | 過程 | 求解 φ | 說明 |
|------|------|--------|------|
| KTP  | Type-II XY SF→F | 24.78° | 文獻 23.5° 是不同 Sellmeier；Kato 1994 方程計算值 |
| LBO  | Type-I XY SS→F  | 11.61° | 符合文獻 ~11-12°（noncritical PM） |
| LBO  | Type-II XY SF→F | 48.51° | 也找到（不常用） |
| LBO  | Type-I XZ       | 32.26° | XZ plane 也搜到 |

**關鍵決策**：
- `crystal_type` 是 `'biaxial_positive'`/`'biaxial_negative'`（非 `'biaxial'`）→ dispatch 用 `.startsWith('biaxial')`
- `solveSHG()` 現在 dispatch：biaxial → `solveSHG_biaxial()`，uniaxial → 原有路徑，其他 → `[]`
- 回傳格式與 uniaxial 相容：`theta_deg` = PM angle（XY 為 φ，XZ 為 θ），加 `plane` 和 `process` 欄位

---

### Phase 8 — 完成 (視覺化 UI)

**建立的檔案**：
| 檔案 | 說明 |
|------|------|
| `04-ui/index.html` | 主視覺化介面，借用 OpticSim panel shell |

**UI 功能**：
- 左側面板：泵浦波長（preset 1064/800/532/355）、目標波長（空白=SHG）、L/w₀/P、晶體 checkbox
- 主畫面上半：Canvas 2D 圖表（依選擇自動切換）
  - SHG 雙折射 → Δk vs θ，PM 角綠點標記
  - PPLN QPM → λ_pump(T) 溫度調諧曲線，操作點標記
  - OPO → λ_signal + λ_idler vs θ 調諧曲線
- 主畫面下半：`findCombinations` 組合清單，按 η 排序，點列切換圖表
- Stats bar：顯示選中組合完整參數

**借用 OpticSim 的部分**：
- `../../OpticSim/03-ui/01-panel-shell/panel.js`（`<script src>` 直接引用，不複製）
- 完全沿用 OpticSim 色彩系統（`#0d1117`/`#7ec8e3`/`#1a2a3a`/`#4a7a9a` 等）
- 未來合併時，panel.js 已是共用路徑，只需把 NonlinearSim 面板內容插入 OpticSim 即可

**已知限制**（Phase 9 待處理）：
- KTP、LBO 為雙軸晶體，`solveSHG` 只支援單軸（uniaxial）→ 無 SHG/OPO 結果
- UI 已標注 `(biaxial)` 告知使用者
- `findCombinations` OPO 路徑加 try/catch 避免 KTP/LBO 的 `neEff('o')` 拋錯破壞整體計算

---

### Phase 7 — 完成 (64/64 ✓)

**建立的檔案**：
| 檔案 | 說明 |
|------|------|
| `03-solver/solver.js` | NL namespace：getSHGAngle, getSHG_PPLN, getTuningCurve, getAcceptance, findCombinations, toOpticSimWavelengths, toOpticSimElement |
| `03-solver/solver-results.html` | 驗證頁 64 項，7 個 API 全通過 |

**關鍵驗證數值**：
| API | 測試 | 結果 |
|-----|------|------|
| getSHGAngle | BBO type-I 1064nm θ | 22.80° ✓ |
| getSHGAngle | BBO 1064nm bw_nm | 1.056 nm ✓ |
| getSHG_PPLN | 1064nm QPM period | 6.731 µm ✓ |
| getSHG_PPLN | η (P=1W, L=10mm) | 0.854% ✓ |
| findCombinations | PPLN > BBO efficiency | ppln:0.854% > bbo:0.030% ✓ |
| toOpticSimElement | type, R1, R2, d, _nlmeta | 全通過 ✓ |

**Bug 修正**（建立時發現的 API 不符問題）：
1. `_shgAngle`：`solveSHG(crystal, lm)` 只接受 2 個參數，回傳陣列 `[{type:'Type-I', theta_deg,...}]`。修正：`results.find(r => r.type === 'Type-I/II')?.theta_deg`
2. `getTuningCurve`：`opoTuningCurve()` 期望 type='typeI'/'typeII'，非 'I'/'II'。修正：`` `type${type}` `` 轉換
3. `findCombinations`：同上，直接呼叫 `opoTuningCurve` 也需同樣轉換

**OpticSim 整合設計**：
- `toOpticSimWavelengths(result)` → `[{lambda_m, lambda_nm, role:'pump'|'sh'|'signal'|'idler'}]`，用於 `beamCfg.wavelengths`
- `toOpticSimElement(result, L_mm)` → `{type:'thickLens', R1:∞, R2:∞, d, n, material:'custom', _nlmeta:{...}}`，晶體建模為平板厚透鏡

---

### Phase 6 — 完成 (16/16 ✓)

**建立的檔案**：
| 檔案 | 說明 |
|------|------|
| `02-physics/efficiency.js` | shg_efficiency(), spectral_bw_shg(), angular_bw_shg(), shg_gamma(), DEFF_TABLE |
| `02-physics/efficiency-results.html` | 驗證頁 16 項：效率、物理合理性、頻寬、排名 |

**關鍵數值**（undepleted pump, CW, plane wave, L=10mm, w₀=50µm）：
| 晶體 | d_eff (pm/V) | η (P=1W) | Γ (%/W) | Δλ (nm, 10mm) | Δθ (mrad, 10mm) |
|------|------------|---------|---------|----------------|-----------------|
| BBO type-I 1064nm | 2.00 | 0.030% | 0.030 | 1.05 nm | 0.26 mrad |
| KTP type-II 1064nm | 3.50 | 0.071% | 0.071 | — | — |
| KDP type-I 1064nm | 0.24 | 5.8e-4% | 5.8e-4 | 1.32 nm | 0.73 mrad |
| PPLN (QPM) 1064nm | 17.2 | 0.95% | 0.95 | — (PPLN另算) | — |

**決策紀錄**：
- 公式：η = 2ω² d_eff² L² P / (n_pump² n_sh c³ ε₀ A)，Δk=0 時
- 原 spec "KTP 0.5-2%, BBO 0.1%"：實際 CW 單程計算低約 10-100×，spec 是脈衝/腔增強條件
- Sellmeier convention：phase-match.js 用 k=2πn/λ；efficiency.js 沿用同一 convention
- d_eff 使用 Dmitriev 1999 convention（P = 2ε₀ d E²），KTP type-II ≈ 3.5 pm/V
- PPLN d_eff = (2/π)×d33 = (2/π)×27 ≈ 17.2 pm/V（1st-order QPM）
- η(PPLN)/η(BBO) ≈ 32×（非 73×），因為 n³ 校正因子 0.44 （PPLN n 較大）

### Phase 5 — 驗證頁完成，待最終確認

**建立的檔案**：
| 檔案 | 說明 |
|------|------|
| `02-physics/ppln-qpm.js` | deltaK_SHG_QPM, ppln_shg_period, ppln_shg_temp_tuning, ppln_opo_temp_tuning |
| `02-physics/ppln-results.html` | 驗證頁：折射率、QPM period vs T、溫度調諧曲線、OPO |

**關鍵物理發現**（與舊 spec 不符，已確認計算正確）：
- SHG 1064→532nm eee 過程：Λ ≈ **6.73µm** at T=25°C（非舊 spec 所寫的 19.1µm 或 31µm）
  - n_e(1064nm)=2.1544, n_e(532nm)=2.2334, Δn=0.0790，Λ=1.064/(2×0.079)=6.73µm
  - 舊 spec "31µm" 是 OPO 縮並點（1064→2128nm），不是 SHG
- 溫度調諧（固定 Λ=6.73µm）：T↑→ pump λ 往長波移，速率約 0.11~0.16 nm/°C
- OPO 縮並點在 Λ≈31.8µm（T=25°C, pump=1064nm → signal=idler=2128nm）

**已知問題**：
- `ppln.js` 的 `no`（ordinary）Sellmeier 給 no(1064nm)≈2.148，物理上應為≈2.232；
  PPLN QPM 只用 `ne`（eee process），Phase 5 不受影響，但後續若需 Type-I BPM 須修正
- OPO 縮並點（λ_s=2λ_p）是數值邊界：f(λ_s) 兩側均趨近 0 無符號變化，bisection 略過；
  驗證改為能量守恆與 signal≤idler 合理性檢查

### Phase 1 建立的檔案
| 檔案 | 說明 |
|------|------|
| `01-crystals/bbo.js` | BBO Sellmeier（Kato 1986），no/ne |
| `01-crystals/ktp.js` | KTP Sellmeier（Kato 1994），nx/ny/nz |
| `01-crystals/lbo.js` | LBO Sellmeier（Kato 1994, IEEE J. QE 30, 881），nx/ny/nz |
| `01-crystals/kdp.js` | KDP Sellmeier（Nikogosyan 2005），no/ne |
| `01-crystals/ppln.js` | MgO:PPLN Sellmeier（Gayer 2008），溫度相關，含 qpmPeriod() |
| `01-crystals/index.js` | CRYSTAL_DB 統一匯出，getCrystal() |
| `01-crystals/index.html` | 驗證頁，對照文獻值 ±0.002 容差 |

### Phase 1 修正紀錄（驗證頁發現）
| 檔案 | 問題 | 修正 |
|------|------|------|
| `ppln.js` | extraordinary a4=12.614 → ne≈2.40（物理錯誤） | a4=189.32, a5=12.52（與 ordinary 相同） |
| `ppln.js` | `qpmPeriod()` 用 `2π/dk` 但 k=n/λ 非物理 k，應為 `1/dk` | 改為 `1.0/|dk|`，QPM 週期 ~6.73 µm ✓ |
| `index.html` | 期望值部分取自不同係數版本或計算錯誤 | 全部改為公式實際輸出值 |

**下一步**：Phase 5 — PPLN 準相位匹配（溫度調諧）

### Phase 4 建立的檔案
| 檔案 | 說明 |
|------|------|
| `02-physics/opo-tuning.js` | `deltaK_OPO_typeI/II()`、`findOPOPair()`、`opoTuningCurve()` |
| `02-physics/opo-results.html` | 驗證頁：BBO 532/355/1064nm OPO，調諧曲線圖 |

### Phase 4 決策紀錄
- **findOPOPair() 演算法**：Δk(λ_s) 在 λ_s = 2λ_p（縮並點）有局部極大值。若直接用 [lo_m, hi_m] 兩端做 bisection，兩端符號相同（都比極大值小），找不到根。修正：以 `mid_m = 2λ_pump` 為分界點，分 [lo_m, mid_m] 和 [mid_m, hi_m] 兩段各自搜尋。
- **lo_m 計算**：原先用 `lambda_pump × 1.001` 導致 λ_i → ∞，n(λ_i) = NaN。修正：計算保證 λ_i < lambda_s_max 的最小 λ_s：`lo_m = λ_pump × lambda_s_max / (lambda_s_max − λ_pump) × 1.005`。
- **BBO 532nm Type-I OPO PM 範圍**：θ ≈ 21.6°–22.9°（非常窄，接近縮並角 22.88°）。訊號從 765nm（θ=22°）調諧到 955nm（θ=22.8°）。θ < ~21° 的角度，Δk 在整個搜尋範圍均為正值，無相位匹配。
- **BBO 1064nm Type-I OPO PM 範圍**：θ ≈ 24°–27°，訊號 1451–1817nm，閒置光 2566–3990nm。
- **BBO 355nm Type-I OPO PM 範圍**：θ ≈ 21°–30°，訊號 400–574nm，縮並波長 710nm（θ_degen ≈ 30°）。

### Phase 3 建立的檔案
| 檔案 | 說明 |
|------|------|
| `02-physics/phase-match.js` | 新增 `walkOffAngle(θ,λ,crystal)`、`solveSHG(crystal,pump)` |
| `02-physics/shg-results.html` | 驗證頁：BBO/KDP Type-I/II 角度、走離角、完整 SHG 表格 |

### Phase 3 決策紀錄
- KDP Type-I SHG 1064nm：Nikogosyan 2005 給出 ~30.3°（歷史值 41° 來自 1960s Sellmeier，差異大）
- KDP Type-II SHG：在 [0°,90°] 範圍內可能無解（視公式而定，驗證頁會顯示）

### Phase 2 建立的檔案
| 檔案 | 說明 |
|------|------|
| `02-physics/sellmeier.js` | `neEff(θ,λ,crystal)`、`neEff_biaxial_xz()`、`noEff_biaxial_xz()` |
| `02-physics/phase-match.js` | `deltaK_typeI/II()`、`findPMAngle()`、`SHG_typeI/II_angle()` |
| `02-physics/index.html` | 驗證頁：ne(θ) 曲線 + Δk 確認 + 相位匹配角求解器 |

## 專案說明

給 AI 或外部軟體呼叫的非線性光學計算引擎，搭配人類可讀的視覺化介面。

使用者或 AI 輸入目標波長與泵浦條件，引擎自動搜尋所有可行的晶體×相位匹配×角度×溫度組合，回傳結構化結果。

### 核心能力

```
輸入：目標輸出波長（或泵浦波長）
  ↓
引擎掃描：晶體 × 匹配類型 × 角度/溫度
  ↓
輸出：可行組合清單（晶體、角度、效率、頻寬）
  ↓
視覺化：調諧曲線圖 + 參數面板
  ↓
可接 OpticSim：看輸出光束怎麼導引
```

### 與 OpticSim 的分工

| 工具 | 負責 |
|------|------|
| NonlinearSim | 晶體內部的非線性過程（產生什麼波長、效率多少） |
| OpticSim | 晶體前後的線性光路（光束如何聚焦、導引） |

---

## 晶體清單（5 顆，涵蓋常見實驗室場景）

| ID | 名稱 | 主要用途 | 類型 |
|----|------|---------|------|
| `bbo` | BBO (β-BaB₂O₄) | OPO 寬波段調諧、SHG UV/可見光 | 單軸負晶體 |
| `ktp` | KTP (KTiOPO₄) | 1064→532nm SHG，穩定高效 | 雙軸晶體（簡化處理） |
| `lbo` | LBO (LiB₃O₅) | 高功率 SHG，非臨界相位匹配 | 雙軸晶體（簡化處理） |
| `ppln` | MgO:PPLN (LiNbO₃) | 準相位匹配，溫度調諧，效率最高 | 週期極化（QPM） |
| `kdp` | KDP (KH₂PO₄) | 高功率脈衝 SHG，歷史標準 | 單軸負晶體 |

---

## 物理背景（給實作參考）

### 相位匹配條件

**能量守恆**（OPO）：
```
1/λ_pump = 1/λ_signal + 1/λ_idler
```

**動量守恆（Δk = 0）**：
```
k_pump = k_signal + k_idler
n_p/λ_p = n_s/λ_s + n_i/λ_i
```

### 單軸晶體（BBO、KDP）的折射率

非尋常光折射率（角度 θ 為光傳播方向與光軸夾角）：
```
1/ne²(θ) = cos²θ/no² + sin²θ/ne_principal²
```

**Type-I SHG**（o + o → e）：
```
Δk = 0  →  ne(2ω, θ) = no(ω)
```

**Type-II SHG**（o + e → e）：
```
Δk = 0  →  no(ω) + ne(ω, θ) = 2·ne(2ω, θ)
```

### Sellmeier 方程式（λ 單位：µm）
```
n²(λ) = A + B/(λ² - C) - D·λ²
```
各晶體有各自的 A, B, C, D 係數。

### 準相位匹配（QPM，PPLN）
週期極化提供額外的倒晶格向量 G = 2π/Λ：
```
Δk_QPM = k_p - k_s - k_i - 2π/Λ = 0
```
調諧方式：改變溫度 T（改變 n(T)）或選不同週期 Λ。

### 轉換效率（簡化）

SHG（低轉換率近似）：
```
η ≈ 8π² × deff² × L² × I / (ε₀ × c × n³ × λ²)
```

相位匹配頻寬（接受度）：
```
Δλ ≈ λ² / (L × |d(Δk)/dλ|)
```

---

## 模組結構

```
NonlinearSim/
├── 01-crystals/           # 晶體 Sellmeier 資料庫
│   ├── bbo.js
│   ├── ktp.js
│   ├── lbo.js
│   ├── ppln.js
│   ├── kdp.js
│   └── index.js           # 統一匯出 CRYSTAL_DB
│
├── 02-physics/            # 物理計算層（純函數，無 UI）
│   ├── sellmeier.js       # n(λ), ne(θ,λ) 計算
│   ├── phase-match.js     # Type-I/II Δk 求根（SHG + OPO）
│   ├── tuning.js          # 調諧曲線生成（掃角度/溫度）
│   └── efficiency.js      # 效率估算 + 接受頻寬
│
├── 03-solver/             # 對外 API（AI/軟體呼叫）
│   └── solver.js          # findCombinations(), getTuningCurve(), ...
│
├── 04-ui/                 # 視覺化介面
│   ├── crystal-panel.js   # 晶體選擇 + 參數面板
│   ├── chart.js           # 調諧曲線圖（Canvas/SVG）
│   └── results-panel.js   # 可行組合清單
│
└── index.html             # 主介面（整合以上）
```

---

## 實作計畫（9 個 Phase）

### Phase 1 — 晶體 Sellmeier 資料庫
**目標**：輸入波長 → 正確回傳 no(λ), ne(λ)
**驗證**：對照文獻已知數值

| 晶體 | 驗證點 | 文獻值 |
|------|--------|--------|
| BBO  | no(1064nm) | 1.6551 |
| BBO  | ne(1064nm) | 1.5425 |
| BBO  | no(532nm)  | 1.6747 |
| KTP  | nx(1064nm) | 1.7400 |
| KTP  | nz(1064nm) | 1.8303 |
| LBO  | nx(1064nm) | 1.5656 |
| LBO  | nz(1064nm) | 1.6054 |
| KDP  | no(1064nm) | 1.4939 |
| KDP  | ne(1064nm) | 1.4599 |
| PPLN | no(1064nm, 25°C) | 2.1540 |

---

### Phase 2 — ne(θ) 公式 + Δk 計算
**目標**：給定角度 θ → 計算有效折射率；計算任意條件下的 Δk
**驗證**：
- BBO ne(θ=22.8°, λ=532nm) ≈ no(BBO, λ=1064nm)（這就是 Type-I SHG 相位匹配點）

---

### Phase 3 — SHG 相位匹配求解器
**目標**：輸入（晶體, 泵浦波長）→ 輸出 Type-I/II 相位匹配角 θ_pm
**驗證**（對照已知實驗值）：

| 晶體 | 類型 | 泵浦波長 | 期望 θ_pm |
|------|------|---------|-----------|
| BBO  | Type-I  | 1064nm | 22.8° |
| BBO  | Type-I  | 800nm  | 29.2° |
| KDP  | Type-I  | 1064nm | 41.0° |
| KTP  | Type-II | 1064nm | 23.5°（φ）|

---

### Phase 4 — OPO 調諧曲線
**目標**：輸入（晶體, 泵浦波長）→ 輸出 λ_signal, λ_idler vs θ 的調諧曲線
**驗證**：
- BBO OPO 泵浦 532nm：θ=20° → signal≈700nm, idler≈1500nm（對照文獻圖）
- BBO OPO 泵浦 355nm：可見到 420–710nm 調諧範圍

---

### Phase 5 — PPLN 準相位匹配
**目標**：溫度調諧 + 週期 Λ 計算
**驗證**：
- PPLN Λ=31.0µm, T=25°C → SHG 1064→532nm ✓
- PPLN Λ=28.5µm, T=100°C → SHG 1064→532nm ✓（熱漂移正確）

---

### Phase 6 — 轉換效率估算
**目標**：給定晶體長度、聚焦、功率 → 估算 SHG 效率
**驗證**：
- KTP 10mm, w₀=50µm, P=1W CW → η ≈ 0.5–2%（量級正確）
- BBO 10mm, w₀=50µm, P=100mW → η ≈ 0.1%（量級正確）

---

### Phase 7 — Solver API（對外介面）
**目標**：乾淨的 JS 函數，AI/軟體可直接呼叫
```javascript
NL.findCombinations({ target_nm: 810, pump_nm: 1064 })
// 回傳：[{ crystal, type, theta, lambda_s, lambda_i, efficiency, bandwidth }, ...]

NL.getTuningCurve({ crystal: 'bbo', type: 'I', pump_nm: 532 })
// 回傳：[{ theta_deg, lambda_signal_nm, lambda_idler_nm }, ...]

NL.getSHGAngle({ crystal: 'bbo', pump_nm: 1064 })
// 回傳：{ theta_pm_deg, deff, efficiency_formula }

NL.getAcceptance({ crystal: 'bbo', theta: 22.8, pump_nm: 1064, L_mm: 10 })
// 回傳：{ bw_nm, bw_cm1, walk_off_mrad }
```
**驗證**：呼叫每個 API，確認輸出格式與數值合理

---

### Phase 8 — 視覺化 UI
**目標**：人可以用的介面
- 左側面板：泵浦波長輸入、晶體選擇、模式選擇（SHG/OPO）
- 主畫面：調諧曲線圖（λ vs θ 或 λ vs T）
- 右側：可行組合清單（表格，可排序）
**驗證**：
- 選 BBO + 泵浦 532nm → 圖上出現連續調諧曲線
- 清單顯示多個組合，數值與 Phase 4 計算一致

---

### Phase 9 — 整合與收尾
**目標**：
- 可從 OpticSim 連結過來（輸出波長直接帶入）
- solver.js 完整文件（供 AI 呼叫）
- 錯誤處理（波長超出晶體透明範圍等）
**驗證**：
- end-to-end 測試：輸入「我要 780nm」→ 引擎回傳 BBO OPO 組合 → OpticSim 顯示光路

---

## API 輸出格式（v1）

```json
{
  "query": { "target_nm": 810, "pump_nm": 1064 },
  "combinations": [
    {
      "crystal": "bbo",
      "crystal_label": "BBO",
      "process": "OPO",
      "match_type": "Type-I",
      "pump_nm": 1064,
      "signal_nm": 810,
      "idler_nm": 2800,
      "theta_deg": 21.5,
      "deff_pm_per_V": 1.8,
      "efficiency_rel": 0.76,
      "acceptance_bw_nm": 3.5,
      "walk_off_mrad": 2.1,
      "temp_C": 25,
      "notes": "Standard cut, type-I phase matching"
    }
  ]
}
```

---

## 使用的工具
- 純 HTML/CSS/JS（無 build system，與 OpticSim 同架構）
- Canvas API（調諧曲線圖）
- 數值方法：Brent's method（求根），Runge-Kutta（效率積分）

## 待辦事項
- [x] **Phase 1** — 晶體 Sellmeier 資料庫（BBO, KTP, LBO, PPLN, KDP）— 23/23 ✓
- [x] **Phase 12** — 耗盡泵浦 tanh²（17/17 ✓）
- [x] **Phase 13** — Boyd-Kleinman h(ξ,B) 聚焦積分（16/16 ✓）
- [x] **Phase 14** — d_eff(θ) 從 d 張量動態計算（22/22 ✓）
- [x] **Phase 15** — GVD β₂ + GVM δ 輸出（22/22 ✓）
- [x] **Phase 16** — 溫度調諧 n(λ,T)：thermoCorrectedCrystal、LBO noncritical PM T≈149°C（28/28 ✓）
- [x] **Phase 2** — ne(θ) 公式 + Δk 計算 — 13/13 ✓
- [x] **Phase 3** — SHG 相位匹配求解器（Type-I/II + 走離角）— 14/14 ✓
- [x] **Phase 4** — OPO 調諧曲線（BBO 532/355/1064nm）— 14/14 ✓
- [x] **Phase 5** — PPLN 準相位匹配（溫度調諧）— 9/9 ✓
- [x] **Phase 6** — 轉換效率估算（deff、L、聚焦）— 16/16 ✓
- [x] **Phase 7** — Solver API（NL namespace，OpticSim 介面）— 64/64 ✓
- [x] **Phase 8** — 視覺化 UI（04-ui/index.html，借用 OpticSim panel shell）— ✓
- [x] **Phase 9** — 雙軸 PM solver（KTP/LBO，XY+XZ plane）— 19/19 ✓
- [x] **Phase 10** — 整合雙軸 PM 進 solver.js（`getSHGAngle` 支援 KTP/LBO、`findCombinations` SHG 路徑）— 79/79 ✓
- [x] **Phase 11** — OpticSim 接入（NL panel section in OpticSim，瀏覽器測試 ✓）
- [x] **OPO Threshold** — opo-threshold.js：BK公式 P_th、opo_threshold_from_zR CavitySim 接口（25/25 ✓）
- [x] **NL.getOPOThreshold** — 已掛進 solver.js NL namespace（含 zR、scanL、scanW0、optimalW0）
- [x] **OPO Design 整合頁** — PhotonicsSim/OPODesign/index.html：互動式閾值計算、P_th vs L/w₀ 圖，瀏覽器測試 ✓
- [x] **OPODesign × CavitySim 即時耦合（任務 B）** — 嵌入 mini cavity designer（R₁/R₂/L_cav + flat checkbox）；CAVITY.solve() → propagateQ() 傳播 eigenmode 至晶體中心取 w₀；STABLE/UNSTABLE badge + w₀@crystal + w@M1 即時顯示；瀏覽器測試 ✓
- [x] **CavitySim Phase 7（任務 C）** — export eigenmode q → OpticSim input beam：更新 export box 顯示 w₀/waistZ/λ；CavitySim 加「→ Open in OpticSim」按鈕（URL params 傳遞）；OpticSim 在 init 讀取 ?lambda_nm=&w0_mm=&waistZ_cm= 並顯示 toast 通知，瀏覽器測試 ✓
- [ ] **PhotonicsSim hub（任務 A）** — 頂層 index.html 連結 OpticSim / NonlinearSim / CavitySim / OPODesign
