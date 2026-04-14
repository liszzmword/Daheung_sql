# Business Rules & Assumptions

이 문서는 매출/매입 데이터 분석 및 RAG 답변에서 사용하는 운영 기준/가정을 정리한다.

---

## 1. 매출 기준

- 매출 = supply_amount (공급가액, 부가세 제외)
- 모든 매출 분석, 성과 분석, 증감률, 고객 이탈 분석은 supply_amount 기준
- total_amount = supply_amount + vat (참고용)

---

## 2. 매입 기준

- 매입 금액 = purchases.supply_amount (공급가액)
- 매입 단가 = purchases.purchase_cost (매입원가)
- 매출 테이블의 purchase_price = 매입단가(3% 포함), 개별 거래 원가 참고용

---

## 3. 날짜 기준

- 매출: sale_date (거래 발생일)
- 매입: purchase_date (매입 발생일)
- 매입 원본 날짜는 MM/DD만 존재하며, 파일명에서 연도 추출하여 YYYY-MM-DD로 변환
- 연도/월 집계 시 각 테이블의 날짜 컬럼 기준

---

## 4. 매입/매출 비교 규칙 (핵심)

### 연결 키
- product_name(제품명)으로 매입/매출 비교
- 반드시 같은 기간(연도/분기/월)으로 필터링하여 비교

### 거래처 구분
- sales_clean.customer_name = 판매 고객 (1,077곳)
- purchases.customer_name = 공급업체 (99곳)
- 두 테이블의 customer_name은 의미가 다르므로 직접 비교 불가

### 수익성 분석
- 제품별 수익성 = (매출 supply_amount - 매입 supply_amount) / 매출 supply_amount
- 매출/매입 비율(Ratio) = 매출 supply_amount / 매입 supply_amount
  - 1.0 이상: 수익 발생
  - 1.0 미만: 역마진 (매입 > 매출)

### 매입 최적화 분석
- 매입만 있고 매출 없는 제품 → 과잉 매입 후보 (매입 줄여야 함)
- 매출만 있고 매입 없는 제품 → 매입 확인 필요
- 매입량 > 매출량 * 1.2 → 재고 과잉 가능성
- 매출은 증가하는데 매입이 감소 → 공급 부족 리스크

---

## 5. 이탈(Churn) 고객 산정 기준

- "구매" = 해당 기간 내 supply_amount > 0인 거래가 1건 이상 존재
- "이탈" = 기준 기간에는 구매 있으나, 비교 기간에는 구매 없음
- 키 기준: customer_code (없으면 customer_name)

---

## 6. 환불/취소 처리

- 음수 금액(supply_amount < 0)이 존재하면 환불로 간주

---

## 7. 마진율(margin_rate_pct) 사용 규칙

- % 단위 숫자로 저장 (30.3 = 30.3%)
- 이미 % 단위이므로 표시할 때 * 100 불필요
- 해석: 해당 라인아이템의 마진율

---

## 8. 거래처 코드 (customer_code)

- customers 테이블의 거래처 고유 코드
- 매출/매입 업로드 시 customers 테이블에서 자동 매칭
- 거래처명 유사도(Dice coefficient) 기반 퍼지 매칭 지원

---

## 9. 용어 표준

- 거래처 (매출) = sales_clean.customer_name (판매 고객)
- 거래처 (매입) = purchases.customer_name (공급업체)
- 담당사원 = sales_rep
- 제품군 = product_group
- 매출 = supply_amount (sales_clean)
- 매입 = supply_amount (purchases)
- 마진율 = margin_rate_pct (% 단위)
- 매입단가 = purchase_price (매출 테이블) / purchase_cost (매입 테이블)
- 스탁번호 = stock_no (제품 재고 식별자)
