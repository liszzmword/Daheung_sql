# Business Rules & Assumptions

이 문서는 세일즈 데이터 분석 및 RAG 답변에서 사용하는 운영 기준/가정을 정리한다.

---

## 1. 매출 기준

- 매출 = supply_amount (공급가액)
- 모든 매출 분석, 성과 분석, 증감률, 고객 이탈 분석은 supply_amount 기준
- vat, total_amount 컬럼은 사용하지 않는다

---

## 2. 날짜 기준

- sale_date는 거래가 발생한 "매출일"
- 연도/월 집계는 sale_date 기준으로 수행

---

## 3. 이탈(Churn) 고객 산정 기준

정의:
- "구매" = 해당 기간 내 supply_amount > 0인 거래가 1건 이상 존재
- "이탈" = 기준 기간에는 구매가 있으나, 비교 기간에는 구매가 없음

식:
- Churn(A→B) = PurchasedInPeriod(A) AND NOT PurchasedInPeriod(B)

키 기준:
- customer_code를 거래처 식별 키로 사용 (customers 테이블의 거래처 고유 코드)
- customer_code가 없는 경우 customer_name 기준 사용

---

## 4. 환불/취소 처리

- 음수 금액(supply_amount < 0)이 존재하면 환불로 간주
- 환불 데이터가 별도로 관리되지 않음

---

## 5. 마진율(margin_rate_pct) 사용 규칙

- 소수점 형식 저장 (0.17 = 17%)
- 퍼센트 표시 시 * 100 필요
- 해석: 해당 라인아이템의 마진율

---

## 6. 거래처 코드 (customer_code)

- customers 테이블의 거래처 고유 코드
- 매출 데이터 업로드 시 customers 테이블에서 자동 매칭
- 거래처명 유사도(Dice coefficient) 기반 퍼지 매칭 지원

---

## 7. 용어 표준

- 거래처 = customer_name
- 담당사원 = sales_rep
- 제품군 = product_group
- 규격 = product_spec
- 공급가액/매출 = supply_amount
- 마진율 = margin_rate_pct (소수점)
