# NonlinearSim — 使用者筆記與開發路線圖

## 這個工具能做什麼

NonlinearSim 是一個**瀏覽器執行**的非線性光學計算引擎，目標是「設計決策等級」：
給定晶體、泵浦波長、聚焦條件，快速算出相位匹配角度、轉換效率、群速度色散等參數，
讓使用者在進實驗室之前先做設計評估。

主要特色：
- **不需安裝**：純 JavaScript，在瀏覽器開 HTML 即用
- **OpticSim 整合**：非線性晶體可直接當成 OpticSim 的光學元件插入光路
- **API 可呼叫**：`NL.getSHGAngle()`、`NL.getAcceptance()` 等函數可供 AI 工具直接使用
- **透明計算**：每一步都可以在 DevTools 驗算，不是黑盒子

---

## 與 SNLO 的功能對照

[SNLO](https://as-photonics.com/products/snlo/) 是 AS-Photonics（源自 Sandia 國家實驗室）發布的免費桌面程式，是業界最廣泛使用的非線性光學設計工具（Windows only）。

| 功能 | NonlinearSim | SNLO | 說明 |
|------|:---:|:---:|------|
| **執行方式** | 瀏覽器（跨平台）| 桌面（Windows only）| NonlinearSim 優勢 |
| **API 整合** | ✅ JavaScript API | ❌ | NonlinearSim 獨有 |
| **光路模擬整合** | ✅ OpticSim | ❌ | NonlinearSim 獨有 |
| 晶體庫 | 5 種 | ~50 種 | SNLO 多：BIBO、CLBO、ZGP、AgGaS₂ 等 |
| SHG 相位匹配 | ✅ 單軸 + 雙軸 | ✅ | 功能相當 |
| OPO 調諧曲線 | ✅ 單軸（BBO/KDP）| ✅ | 雙軸 KTP/LBO 未實作 |
| d_eff 計算 | ✅ 從 d 張量動態算 | ✅ | 功能相當 |
| 接受頻寬（角度/光譜） | ✅ 單軸 / ❌ 雙軸 | ✅ | 雙軸目前傳回 null |
| 走離角 | ✅ 單軸 / ❌ 雙軸 | ✅ | 雙軸目前傳回 0 |
| GVD β₂ | ✅ | ✅ | 功能相當 |
| GVM δ（Type-I/II）| ✅ 含 Type-II 三參數 | ✅ | 功能相當 |
| Boyd-Kleinman 聚焦 | ✅ h(ξ,B) + 最佳 w₀ | ✅ | 功能相當 |
| 耗盡泵浦效率 | ✅ tanh²（解析）| ✅ | 功能相當 |
| 溫度調諧 n(λ,T) | ✅ 線性模型 | ✅ 完整 T-Sellmeier | SNLO 精度較高，我們適合 ±100°C 範圍 |
| PPLN QPM | ✅ | ✅ | 功能相當 |
| **SFG / DFG** | ❌ | ✅ | 缺口（見下） |
| **OPA** | ❌ | ✅ | 缺口 |
| **雙軸 OPO** | ❌ | ✅ | 缺口（KTP/LBO OPO）|
| 數值脈衝傳播 | ❌ | ❌ | 兩者都不做（需另外工具） |
| 數值光束傳播（2D）| ❌ | 部分 | SNLO 有簡化 Gaussian 傳播 |

---

## 已知限制（目前設計邊界）

這些是有意識的邊界，不是 bug，已記錄在 PROJECT.md：

1. **雙軸晶體（KTP/LBO）OPO 調諧**：`opoTuningCurve` 目前只支援單軸，KTP/LBO 的 OPO 需要完整的雙軸相位匹配面計算。

2. **雙軸接受頻寬 / 走離角**：`bw_nm`、`bw_mrad`、`walk_off_mrad` 對雙軸晶體傳回 null / 0。角度接受度公式（∂Δk/∂θ）需要擴展到雙軸形式。

3. **溫度 Sellmeier 精度**：目前用一階線性模型 n(λ,T) ≈ n₀ + α(λ)×ΔT，適合 ±100°C 估算。要在更大溫度範圍或更高精度（如 PPLN 相位匹配溫度），需要各晶體的完整溫度 Sellmeier 方程。

4. **SFG / DFG 未實作**：目前只有 SHG（ω+ω→2ω）。和頻（SFG, ω₁+ω₂→ω₃）與差頻（DFG）是框架的自然延伸，但求解器尚未支援。

5. **脈衝傳播**：目前只計算 GVD/GVM 參數，不做數值脈衝演化（NLSE/coupled-wave 積分）。

---

## 未來開發方向（優先順序建議）

### A 級：自然延伸，工程量小

**A1 — SFG / DFG 支援**
- 物理：Δk = k₃ − k₁ − k₂，其中 ω₃ = ω₁ + ω₂
- 現有 `deltaK()`、`deff.js` 可直接重用
- 新增：`solveSFG(crystal, lam1_nm, lam2_nm)` 返回 PM 角 + d_eff + 接受度
- 估計：Phase 17，~1–2天

**A2 — 雙軸接受頻寬 + 走離角**
- 移除 KTP/LBO 的 null/0 限制
- 需要雙軸 ∂Δk/∂φ 和 ∂Δk/∂λ 的解析或數值梯度
- 估計：Phase 18，~1–2天

### B 級：中等工程量

**B1 — 雙軸 OPO 調諧（KTP/LBO）**
- 需要雙軸相位匹配面上的 signal/idler 掃描
- 目前 `opoTuningCurve` 假設 ne_eff，需改成 biaxial solver
- 估計：2–3天

**B2 — 擴展晶體庫**
- 優先候選：BIBO（高 d_eff，BBO 的替代品）、CLBO（深紫外 UV）
- 每種晶體：找 Sellmeier 文獻 → 加 `01-crystals/` → 加驗證
- 估計：每種晶體 ~半天

### C 級：另起爐灶，不在現有框架內

**C1 — 完整溫度 Sellmeier**
- 用文獻的溫度相關 Sellmeier 取代線性 α(λ) 模型
- 目前線性模型足夠估算，除非需要 PPLN 精確溫度設計

**C2 — 數值脈衝傳播（NLSE / coupled-wave）**
- 完全不同的計算類型：時域 + 空間域演化
- 工具如 [pynlo](https://github.com/pyNLO/PyNLO)（Python）已做這件事
- 若需要：建議獨立新專案，不在 NonlinearSim 框架內擴展

---

## 適合使用情境

NonlinearSim **適合**：
- 快速評估哪種晶體/過程最適合特定波長需求
- 教學示範（瀏覽器即開，透明可驗算）
- 與光路設計（OpticSim）整合的工作流程
- AI 工具輔助的設計探索（API 可呼叫）

NonlinearSim **不適合**（建議改用其他工具）：
- 需要 SFG/DFG 設計 → 目前用 SNLO
- 需要超過 5 種晶體 → 目前用 SNLO
- 需要數值脈衝傳播 → 用 pynlo 或 FROG suite
- 需要非常精確的溫度調諧設計（>±100°C）→ 用 SNLO 的完整 T-Sellmeier
