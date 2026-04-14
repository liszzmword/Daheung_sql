# 매출/매입 지표 정의 (Metrics Definition)

이 문서는 매출/매입 데이터에서 자주 사용하는 지표의 정의, 계산식, 기준을 정리한다.

---

## 1. 매출(Revenue)

- 지표명: Revenue (Net)
- 컬럼: sales_clean.supply_amount
- 의미: 공급가액 (부가세 제외 매출)
- 모든 매출 분석의 기본 기준

---

## 2. 매입(Purchase)

- 지표명: Purchase Amount
- 컬럼: purchases.supply_amount
- 의미: 공급업체로부터 구매한 금액 (공급가액)
- 매입 단가: purchases.purchase_cost

---

## 3. 매입/매출 비교 지표

### 3.1 매출/매입 비율 (Sales-to-Purchase Ratio)
- 정의: 특정 제품/기간의 매출액 / 매입액
- 식: SUM(sales_clean.supply_amount) / NULLIF(SUM(purchases.supply_amount), 0)
- 해석: 1.0 이상 = 수익, 1.0 미만 = 역마진
- JOIN 키: product_name

### 3.2 제품별 순이익
- 정의: 매출 공급가액 - 매입 공급가액
- 식: SUM(s.supply_amount) - SUM(p.supply_amount)

### 3.3 제품별 수익률
- 정의: (매출 - 매입) / 매출 * 100
- 식: (SUM(s.supply_amount) - SUM(p.supply_amount)) / NULLIF(SUM(s.supply_amount), 0) * 100

### 3.4 과잉 매입 제품
- 정의: 매입은 있지만 매출이 없거나, 매입 수량이 매출 수량보다 현저히 많은 제품
- 식: purchases에 EXISTS하고 sales_clean에 NOT EXISTS하는 product_name

### 3.5 매입 미확인 제품
- 정의: 매출은 있지만 매입 기록이 없는 제품
- 식: sales_clean에 EXISTS하고 purchases에 NOT EXISTS하는 product_name

---

## 4. 전년 대비 증감(Year-over-Year, YoY)

### 4.1 매출 증감률
- 식: (Revenue(t) - Revenue(t-1)) / Revenue(t-1) * 100
- 예외: 전년 매출이 0/NULL이면 증감률은 NULL

### 4.2 매입 증감률
- 식: (Purchase(t) - Purchase(t-1)) / Purchase(t-1) * 100

### 4.3 매입/매출 추세 괴리
- 매출은 감소하는데 매입이 증가 → 재고 리스크
- 매출은 증가하는데 매입이 감소 → 공급 부족 리스크

---

## 5. 구매/이탈(Churn) 정의

### 5.1 이탈 거래처 (판매 고객)
- 정의: 기준 연도에 구매했으나 다음 연도에 구매가 없는 고객
- 테이블: sales_clean
- 기준: supply_amount > 0인 거래 존재

### 5.2 이탈 공급업체
- 정의: 기준 연도에 매입했으나 다음 연도에 매입이 없는 공급업체
- 테이블: purchases

---

## 6. 마진율(Margin Rate)

- 컬럼: margin_rate_pct
- 형식: % 단위 숫자 (30.3 = 30.3%)
- 이미 % 단위이므로 표시할 때 * 100 불필요
- 평균 마진율: 가중평균 권장
  - SUM(supply_amount * margin_rate_pct) / NULLIF(SUM(supply_amount), 0)

---

## 7. 공급업체 분석 지표

### 7.1 공급업체별 매입 비중
- 식: SUM(p.supply_amount) / SUM(전체 매입) * 100
- 테이블: purchases, GROUP BY customer_name

### 7.2 공급업체 집중도
- 상위 N개 공급업체가 전체 매입의 몇 %를 차지하는지

---

## 8. 기타 기본 지표

### 8.1 판매 수량
- 컬럼: qty

### 8.2 평균 판매 단가
- 가중 평균: SUM(unit_price * qty) / NULLIF(SUM(qty), 0)

### 8.3 거래 건수
- 정의: COUNT(*) (라인아이템 기준)
