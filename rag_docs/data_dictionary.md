# 대흥인텍스 데이터 사전 (Data Dictionary)

이 문서는 매출/매입/영업일지/거래처 데이터의 컬럼 의미, 타입, 예시, 주의사항을 정리한 데이터 사전이다.
RAG 검색 대상 문서로 사용된다.

---

## 1. 매출 테이블 (sales_clean)

### 테이블 개요
- 단위: 거래 라인아이템(한 행 = 특정 거래처의 특정 제품 판매 1건)
- 데이터 출처: 매출데이터 CSV (연도별 파일, 15컬럼)
- 총 약 44,700건 (2020~2026.03)

### 컬럼 정의

#### sale_date
- 의미: 매출일(거래 발생일)
- 타입: date
- 예시: 2020-05-25, 2026-01-29
- 원본 형식: M/D/YY (5/25/20) → YYYY-MM-DD 변환

#### customer_name
- 의미: 판매 고객사명
- 타입: text
- 예시: (주) 경기유리, (주)제이에스인더스트리
- 주의: 오탈자/표기 변동 가능 → customer_code 기준 집계 권장

#### customer_code
- 의미: 거래처 고유 코드
- 타입: text
- 중요: customers 테이블에서 자동 매칭됨
- 용도: 거래처 식별, 테이블 간 JOIN 키

#### sales_rep
- 의미: 담당사원(영업 담당자)
- 타입: text
- 예시: 김도순, 김태호, 안웅주, 오승택, 박경진

#### product_name
- 의미: 제품명(세부 품목)
- 타입: text
- 예시: SJ5302 CLEAR, 810R, 9446T, SP-7533
- 중요: purchases 테이블과의 연결 키

#### product_spec
- 의미: 규격/재단 사이즈
- 타입: text
- 예시: 1X1, 6X65, 1200X50, 25X33

#### product_group
- 의미: 제품군(상위 분류)
- 타입: text
- 예시: IATD, EDB, OTH, AUTO, HC, EMD, EMSD, ISD, PSD, Meguiars, CCRD, ESD

#### qty
- 의미: 수량
- 타입: numeric
- 예시: 3, 50, 6000

#### purchase_price
- 의미: 매입단가 (3% 포함)
- 타입: numeric
- 예시: 23, 636, 7729
- 용도: 개별 거래의 원가 파악

#### unit_price
- 의미: 판매단가(개당 가격)
- 타입: numeric
- 예시: 33, 1000, 9200

#### supply_amount
- 의미: 공급가액(매출액, 부가세 제외)
- 타입: numeric
- 예시: 198000, 1472000
- 권장: 모든 매출 분석의 기본 지표

#### vat
- 의미: 부가세
- 타입: numeric
- 예시: 19800, 147200

#### total_amount
- 의미: 합계 (공급가액 + 부가세)
- 타입: numeric
- 예시: 217800, 1619200

#### margin_rate_pct
- 의미: 마진율
- 타입: numeric
- 형식: % 단위 숫자 (30.3 = 30.3%, 15.99 = 15.99%)
- 이미 % 단위이므로 표시할 때 * 100 불필요

#### stock_no
- 의미: 스탁번호 (제품 재고 식별자)
- 타입: text
- 예시: WE-4100-4628-1, WT-0000-7087-8

#### source_file
- 의미: 원본 파일명
- 타입: text
- 예시: 매출데이터_2020.csv

---

## 2. 매입 테이블 (purchases)

### 테이블 개요
- 단위: 매입 라인아이템(한 행 = 공급업체로부터 특정 제품 구매 1건)
- 데이터 출처: 매입내역 CSV (연도별 파일, 12컬럼)
- 총 약 12,360건 (2020~2026)
- 날짜 특이사항: 원본 파일에 연도 없음 (MM/DD만 존재), 파일명에서 연도 추출

### 컬럼 정의

#### purchase_date
- 의미: 매입일(구매 발생일)
- 타입: date
- 원본 형식: MM/DD (06/24) → 파일명 연도 + MM/DD = YYYY-MM-DD

#### customer_name
- 의미: 공급업체명 (매출의 customer_name과 의미 다름!)
- 타입: text
- 예시: (주) 텔레테크, (주)대영케미칼상사, 주식회사 두경
- 중요: 매출의 customer_name은 판매 고객, 매입의 customer_name은 공급업체

#### sales_rep
- 의미: 담당사원
- 타입: text
- 예시: 박주원, 두경

#### product_name
- 의미: 제품명
- 타입: text
- 예시: REMOVE TAPE, 372KS(TRANS), NITTO-5000NS
- 중요: sales_clean.product_name과 매칭하여 매입/매출 비교

#### product_spec
- 의미: 규격/재단 사이즈
- 타입: text
- 예시: 20X7, 1200MMX50M, 48MMX40M

#### product_group
- 의미: 제품군
- 타입: text
- 예시: OTH, IATD, EDB

#### qty
- 의미: 수량
- 타입: numeric

#### purchase_cost
- 의미: 매입원가 (단가)
- 타입: numeric
- 예시: 5, 100, 37600

#### supply_amount
- 의미: 공급가액
- 타입: numeric

#### vat
- 의미: 부가세
- 타입: numeric

#### total_amount
- 의미: 합계
- 타입: numeric

#### source_file
- 의미: 원본 파일명
- 타입: text
- 예시: 매입내역_2020.csv

---

## 3. 매입/매출 관계

### 연결 키
- **제품명(product_name)**: 매출 1,371개 / 매입 1,265개 / 공통 1,110개 (81% 중복)
- 제품군(product_group)도 동일 체계 사용

### 거래처 관계
- 매출 거래처(판매 고객): 1,077곳
- 매입 거래처(공급업체): 99곳
- 양쪽 모두 존재: 51곳 (일부 거래처는 공급도 하고 구매도 함)

---

## 4. 영업일지 테이블 (sales_diary)

### 테이블 개요
- 단위: 영업사원의 개별 방문/상담 기록
- 출처: 영업일지 XLS 파일
- sales_clean과 연결: company_name ↔ customer_name, customer_code

### 컬럼: diary_date, sales_rep, company_name, contact_person, start_time, end_time, visit_type, notes, customer_code, source_file

---

## 5. 거래처 마스터 테이블 (customers)

### 테이블 개요
- 거래처 코드 ↔ 회사명 매핑
- sales_clean, purchases, sales_diary의 customer_code와 JOIN 가능

### 주요 컬럼
- customer_code: 거래처 고유 코드 (UNIQUE)
- company_name: 회사명/상호
- representative: 대표자
- sales_rep: 매출담당자
- business_number: 사업자등록번호
- contact_person: 거래처 담당자
- status: 상태
