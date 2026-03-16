# Sales Dataset Data Dictionary (초안)

이 문서는 세일즈 CSV 데이터의 컬럼 의미, 타입, 예시, 주의사항을 정리한 데이터 사전이다.
RAG 검색 대상 문서로 사용된다.

## 테이블/파일 개요
- 단위: 거래 라인아이템(한 행 = 특정 거래처의 특정 제품 판매 1건)
- 주요 키:
  - row_no: 파일 내 행 번호(고유 보장 X일 수 있음)
  - customer_code: 거래처 또는 거래 식별 코드(정확한 의미는 확인 필요)
- 주요 날짜:
  - sale_date: 매출일(거래 발생일)

---

## 컬럼 정의

### row_no
- 의미: 파일 내 행 번호
- 타입(원본): text / (정제 후): int
- 예시: `1`
- 주의: 데이터 병합/재업로드 시 고유키로 쓰지 않는 것을 권장

### sale_date
- 의미: 매출일(거래 발생일)
- 타입(원본): text / (정제 후): date
- 예시(원본): `2019.4.18`, `2019.7.2`
- 정제 규칙:
  - 점(.)을 하이픈(-)으로 변환 후 date로 파싱
  - 월/일이 1자리일 수 있음(예: 2019.7.2)

### customer_name
- 의미: 거래처명(고객사명)
- 타입: text
- 예시: `세명아크릴`, `엠에스씨`
- 주의:
  - 오탈자/표기 변동 가능성 있음(가능하면 customer_code 기준 집계를 권장)

### sales_rep
- 의미: 담당사원(영업 담당자)
- 타입: text
- 예시: `김도순`

### product_name
- 의미: 제품명(세부 품목)
- 타입: text
- 예시: `PS양면`, `5068W(15Ø)5배열X2줄`, `금형비`
- 주의:
  - 제품명에 특수문자 포함 가능(예: Ø)

### product_group
- 의미: 제품군(상위 분류)
- 타입: text
- 예시: `OTH`
- 주의:
  - 분류 체계가 확장될 수 있음(OTH 외 값 존재 가능)

### qty
- 의미: 수량
- 타입(원본): text / (정제 후): numeric
- 예시(원본): `50`, `2,000`
- 정제 규칙:
  - 천 단위 구분 콤마 제거 후 numeric 변환

### unit_price
- 의미: 판매단가(개당 가격)
- 타입(원본): text / (정제 후): numeric
- 예시(원본): `2,060`, `40`
- 정제 규칙:
  - 콤마 제거 후 numeric 변환

### supply_amount
- 의미: 공급가액(부가세 제외 금액)
- 타입(원본): text / (정제 후): numeric
- 예시(원본): `103,000`, `80,000`
- 권장 사용:
  - “매출(부가세 제외)” 기본 지표로 사용 권장

### margin_rate_pct
- 의미: 마진율(%)
- 타입(원본): text / (정제 후): numeric
- 예시(원본): `20%`, `85%`, `6%`
- 정제 규칙:
  - % 제거 후 numeric 변환(예: 20% -> 20)
- 주의:
  - 이 마진율의 정의(매출 대비? 공급가 대비?)는 별도 확인 필요

### vat
- 의미: 부가세
- 타입(원본): text / (정제 후): numeric
- 예시(원본): `10,300`, `8,000`
- 정제 규칙:
  - 콤마 제거 후 numeric 변환

### total_amount
- 의미: 합계(공급가액 + 부가세)
- 타입(원본): text / (정제 후): numeric
- 예시(원본): `113,300`, `88,000`
- 검증 규칙(기본):
  - total_amount = supply_amount + vat (대부분 성립)
- 주의:
  - 반올림/정산 규칙이 있는지 확인 필요

### customer_code
- 의미: 거래처 코드(또는 거래 식별 코드)
- 타입: text
- 예시: `20190418001`, `20230518002`
- 중요 확인 필요:
  - 거래처(고객) 고유 코드인지, 거래/주문 고유 번호인지 확정 필요
  - 고객 고유키라면 “이탈(Churn) 고객” 계산은 customer_code 기준 권장
  - 거래 고유키라면 고객 식별은 customer_name 기반 또는 별도 고객 마스터 필요

---

## 기본 품질 체크(권장)
- total_amount = supply_amount + vat 성립 여부 점검
- qty * unit_price ≈ supply_amount 성립 여부 점검(일부 품목/서비스(금형비 등)는 예외 가능)
- customer_name 표기 중복/오타 탐지(가능하면 customer_code로 통합)

---

## 영업일지 테이블 (sales_diary)

### 테이블 개요
- 단위: 영업사원의 개별 방문/상담 기록 (한 행 = 특정 거래처 방문 1건)
- 출처: 영업일지 XLS 파일 (시트 이름 = 영업사원 이름)
- sales_clean 테이블과 연결: company_name ↔ customer_name, sales_rep 대응

### 컬럼 정의

#### diary_date
- 의미: 방문/상담 일자
- 타입: date
- 예시: `2024-12-02`

#### sales_rep
- 의미: 영업사원 이름 (XLS 시트 이름에서 추출)
- 타입: text
- 예시: `김한섭`, `박세용`

#### company_name
- 의미: 방문한 기업명
- 타입: text
- 예시: `현대자동차`, `삼성전자`
- 주의: sales_clean의 customer_name과 표기가 다를 수 있음

#### contact_person
- 의미: 기업 담당자 이름
- 타입: text
- 예시: `김부장`

#### start_time
- 의미: 영업 시작 시간
- 타입: text
- 예시: `09:00`

#### end_time
- 의미: 영업 끝나는 시간
- 타입: text
- 예시: `10:30`

#### visit_type
- 의미: 방문 유형 또는 제품명
- 타입: text
- 예시: `방문`, `PS양면`

#### notes
- 의미: 상담/방문 내용 상세
- 타입: text
- 예시: `신규 제품 샘플 전달, 견적 요청 받음`

#### source_file
- 의미: 원본 XLS 파일명
- 타입: text
- 예시: `12월영업일지.xls`

#### inserted_at
- 의미: 데이터 입력 시각
- 타입: timestamptz
- 자동 생성 (now())

### 활용 예시
- "12월 방문 기록 알려줘" → `SELECT * FROM sales_diary WHERE diary_date BETWEEN '2024-12-01' AND '2024-12-31'`
- "김한섭 영업일지" → `SELECT * FROM sales_diary WHERE sales_rep = '김한섭' ORDER BY diary_date DESC`
- "현대자동차 상담 내용" → `SELECT * FROM sales_diary WHERE company_name LIKE '%현대자동차%'`
