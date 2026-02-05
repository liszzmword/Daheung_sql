# Sales Metrics Definition (초안)

이 문서는 세일즈 데이터에서 자주 사용하는 지표의 정의, 계산식, 기준을 정리한다.
RAG에서 “지표 정의/계산 기준” 질문에 답하기 위한 근거 문서로 사용된다.

---

## 1. 매출(Revenue) 기준(중요)

본 데이터에는 부가세 포함/제외 금액이 모두 존재한다.

### 1.1 기본 매출(권장): 공급가액 기준
- 지표명: Revenue (Net)
- 컬럼: supply_amount
- 의미: 부가세 제외 매출로 해석
- 권장 이유:
  - 기간 비교/성과 분석에서 세금 영향을 분리 가능

### 1.2 결제액(참고): 합계 기준
- 지표명: Revenue (Gross)
- 컬럼: total_amount
- 의미: 부가세 포함 총액(청구/결제 금액에 가까움)

> TODO(사용자 확정 필요):
> - 본 서비스의 “매출 기본값”을 supply_amount로 할지 total_amount로 할지 최종 확정.

---

## 2. 전년 대비 증감(Year-over-Year, YoY)

### 2.1 전년 대비 증감액
- 정의: 올해 매출 - 작년 매출
- 식:
  - YoY_Delta = Revenue(t) - Revenue(t-1)

### 2.2 전년 대비 증감률(%)
- 정의: (올해 매출 - 작년 매출) / 작년 매출 * 100
- 식:
  - YoY_GrowthPct = (Revenue(t) - Revenue(t-1)) / Revenue(t-1) * 100
- 예외 처리:
  - 작년 매출이 0이거나 NULL이면 증감률은 NULL로 처리(무한대 방지)

---

## 3. 구매/이탈(Churn) 정의 (거래처 기준)

### 3.1 특정 연도 구매 거래처
- 정의: 특정 연도에 1건 이상 거래가 발생한 거래처
- 기본 규칙(초안):
  - 연도 범위 내 sale_date 존재 AND Revenue > 0 인 거래처를 “구매”로 본다.
- 식(개념):
  - PurchasedInYear(customer, year) = exists(transaction in year with revenue > 0)

### 3.2 이탈 거래처(예: 2024 구매, 2025 미구매)
- 정의: 기준 연도에 구매했으나 다음 연도에 구매가 없는 거래처
- 예:
  - Churn_2024_to_2025 = PurchasedInYear(2024) AND NOT PurchasedInYear(2025)

> TODO(사용자 확정 필요):
> - “구매” 기준을 revenue>0로 볼지, 단순 거래 1건 존재로 볼지 확정
> - 환불/취소가 음수로 들어오는 경우 제외 규칙 필요

---

## 4. 마진율(Margin Rate)

데이터에 margin_rate_pct 컬럼이 존재한다.

### 4.1 margin_rate_pct의 사용 방식
- 현재 데이터 값은 '20%' 형태로 입력되어 있으며, 정제 시 숫자(20)로 변환한다.
- 해석(가정, 초안):
  - margin_rate_pct = 마진율(%)로 보고, 분석 시 평균/중앙값/가중평균 등을 계산할 수 있다.

> 매우 중요:
> - 이 마진율이 “(매출-원가)/매출”인지, “공급가 기준”인지, 혹은 단순 입력값인지 정의가 불명확할 수 있다.
> - 본 지표를 정식 KPI로 사용하기 전, 산출 기준을 확인해야 한다.

---

## 5. 기타 기본 지표

### 5.1 판매 수량
- 지표명: Quantity
- 컬럼: qty
- 정의: 판매된 수량 합계

### 5.2 평균 판매 단가
- 지표명: Avg Unit Price
- 컬럼: unit_price
- 정의(단순 평균): avg(unit_price)
- 정의(가중 평균 권장):
  - WeightedAvgUnitPrice = sum(unit_price * qty) / sum(qty)

### 5.3 거래 건수(라인아이템 수)
- 지표명: Line Count
- 정의: count(*) (라인아이템 기준)
- 주의: 주문 단위가 아니라 “품목 라인” 기준일 수 있음
