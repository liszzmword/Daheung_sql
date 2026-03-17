# Sales Dataset Data Dictionary

이 문서는 세일즈 데이터의 컬럼 의미, 타입, 예시, 주의사항을 정리한 데이터 사전이다.
RAG 검색 대상 문서로 사용된다.

## 테이블/파일 개요
- 테이블: sales_clean
- 단위: 거래 라인아이템(한 행 = 특정 거래처의 특정 제품 판매 1건)
- 데이터 출처: 대흥인텍스 매출상세내역 XLSX (연도별 시트, 표준 10컬럼)
- 주요 날짜: sale_date (매출일)

---

## 표준 컬럼 정의 (10컬럼)

### sale_date
- 의미: 매출일(거래 발생일)
- 타입: date
- 예시: 2020-01-02, 2026-01-02
- 정제: Excel serial number → YYYY-MM-DD 변환

### customer_name
- 의미: 거래처명(고객사명)
- 타입: text
- 예시: (주) 선우인더스트리, 세명아크릴
- 주의: 오탈자/표기 변동 가능 → customer_code 기준 집계 권장

### customer_code
- 의미: 거래처 고유 코드
- 타입: text
- 예시: 20250618001
- 중요: customers 테이블에서 자동 매칭됨 (원본 파일에는 없음)
- 용도: 거래처 식별, 이탈 분석, 테이블 간 JOIN 키

### sales_rep
- 의미: 담당사원(영업 담당자)
- 타입: text
- 예시: 김태호, 안웅주

### product_name
- 의미: 제품명(세부 품목)
- 타입: text
- 예시: SP-7533, Y-9448HK, 468MP
- 주의: 제품명에 특수문자 포함 가능

### product_spec
- 의미: 규격(재단, 사이즈)
- 타입: text
- 예시: 1,200X50, 1X1, 100X50

### product_group
- 의미: 제품군(상위 분류)
- 타입: text
- 예시: IATD, EDB, OTH, AUTO, HC

### qty
- 의미: 수량
- 타입: numeric
- 예시: 3, 20000

### unit_price
- 의미: 판매단가(개당 가격)
- 타입: numeric
- 예시: 80000, 42

### supply_amount
- 의미: 공급가액(매출액)
- 타입: numeric
- 예시: 240000, 840000
- 권장: 모든 매출 분석의 기본 지표

### margin_rate_pct
- 의미: 마진율
- 타입: numeric
- 형식: 소수점 (0.17 = 17%, 0.42 = 42%)
- 퍼센트 표시 시 * 100 필요

---

## 자동 생성 컬럼

### row_no
- 의미: 행 번호 (자동 생성)
- 타입: int

### source_file
- 의미: 원본 파일명
- 타입: text

### inserted_at
- 의미: 데이터 입력 시각
- 타입: timestamptz

---

## 영업일지 테이블 (sales_diary)

### 테이블 개요
- 단위: 영업사원의 개별 방문/상담 기록
- 출처: 영업일지 XLS 파일 (시트 이름 = 영업사원 이름)
- sales_clean 테이블과 연결: company_name ↔ customer_name, customer_code로 JOIN 가능

### 컬럼 정의

#### diary_date
- 의미: 방문/상담 일자
- 타입: date

#### sales_rep
- 의미: 영업사원 이름
- 타입: text

#### company_name
- 의미: 방문한 기업명
- 타입: text

#### contact_person
- 의미: 기업 담당자
- 타입: text

#### start_time / end_time
- 의미: 방문 시작/종료 시간
- 타입: text

#### visit_type
- 의미: 방문 유형 또는 제품코드
- 타입: text

#### notes
- 의미: 상담/방문 내용 상세
- 타입: text

#### customer_code
- 의미: 거래처 코드 (customers 테이블에서 자동 매칭)
- 타입: text

---

## 거래처 마스터 테이블 (customers)

### 테이블 개요
- 거래처 코드 ↔ 회사명 매핑
- sales_clean, sales_diary의 customer_code와 JOIN 가능

### 주요 컬럼
- customer_code: 거래처 고유 코드 (UNIQUE)
- company_name: 회사명/상호
- representative: 대표자
- sales_rep: 매출담당자
- business_number: 사업자등록번호
- contact_person: 거래처 담당자
- status: 상태 (사용/미사용)
