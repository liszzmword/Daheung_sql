# Sales Metrics Definition

이 문서는 세일즈 데이터에서 자주 사용하는 지표의 정의, 계산식, 기준을 정리한다.

---

## 1. 매출(Revenue)

- 지표명: Revenue (Net)
- 컬럼: supply_amount
- 의미: 공급가액 (부가세 제외 매출)
- 모든 매출 분석의 유일한 기준

---

## 2. 전년 대비 증감(Year-over-Year, YoY)

### 2.1 전년 대비 증감액
- 정의: 올해 매출 - 작년 매출
- 식: YoY_Delta = Revenue(t) - Revenue(t-1)

### 2.2 전년 대비 증감률(%)
- 정의: (올해 매출 - 작년 매출) / 작년 매출 * 100
- 식: YoY_GrowthPct = (Revenue(t) - Revenue(t-1)) / Revenue(t-1) * 100
- 예외: 작년 매출이 0이거나 NULL이면 증감률은 NULL

---

## 3. 구매/이탈(Churn) 정의 (거래처 기준)

### 3.1 특정 연도 구매 거래처
- 정의: 특정 연도에 1건 이상 거래가 발생한 거래처
- 기준: supply_amount > 0인 거래 존재

### 3.2 이탈 거래처
- 정의: 기준 연도에 구매했으나 다음 연도에 구매가 없는 거래처
- 예: Churn_2024_to_2025 = PurchasedInYear(2024) AND NOT PurchasedInYear(2025)

---

## 4. 마진율(Margin Rate)

- 컬럼: margin_rate_pct
- 형식: 소수점 (0.17 = 17%, 0.42 = 42%)
- 퍼센트 표시: margin_rate_pct * 100
- 평균 마진율: 가중평균 권장 (SUM(supply_amount * margin_rate_pct) / SUM(supply_amount))

---

## 5. 기타 기본 지표

### 5.1 판매 수량
- 지표명: Quantity
- 컬럼: qty

### 5.2 평균 판매 단가
- 지표명: Avg Unit Price
- 가중 평균 권장: SUM(unit_price * qty) / SUM(qty)

### 5.3 거래 건수(라인아이템 수)
- 지표명: Line Count
- 정의: count(*) (품목 라인 기준)
