/**
 * sales_clean 테이블 스키마 정의 (단일 소스)
 * 실제 Supabase DDL과 일치하도록 관리
 */
export const TABLE_NAME = "sales_clean";

export const TABLE_SCHEMA = `
테이블명: ${TABLE_NAME}

컬럼 정보:
- id: bigserial (PK, 자동 증가)
- row_no: int (원본 파일 행 번호)
- sale_date: date (매출일, 형식: YYYY-MM-DD)
- customer_name: text (거래처명)
- customer_code: text (거래처 코드, customers 테이블에서 자동 매칭)
- sales_rep: text (영업 담당자)
- product_name: text (제품명)
- product_spec: text (규격/재단)
- product_group: text (제품군: IATD, EDB, OTH, AUTO, HC, EMD, EMSD, ISD, PSD, Meguiars 등)
- qty: numeric (수량)
- purchase_price: numeric (매입단가, 3% 포함)
- unit_price: numeric (판매 단가)
- supply_amount: numeric (공급가액, 부가세 제외) ← 매출 계산 시 사용
- vat: numeric (부가세)
- total_amount: numeric (합계 = 공급가액 + 부가세)
- margin_rate_pct: numeric (마진율, % 단위: 30.3 = 30.3%)
- stock_no: text (스탁번호, 제품 재고 식별자)
- source_file: text (원본 파일명)
- inserted_at: timestamptz (입력 일시)

인덱스:
- sale_date 단독
- (customer_name, sale_date) 복합
- (customer_code, sale_date) 복합

총 행 수: 약 44,700건 (2020~2026.03)
`.trim();

export const DIARY_TABLE_NAME = "sales_diary";

export const DIARY_TABLE_SCHEMA = `
테이블명: ${DIARY_TABLE_NAME}

설명: 영업사원의 방문/상담 기록 (영업일지)

컬럼 정보:
- id: bigserial (PK, 자동 증가)
- diary_date: date (영업일, 형식: YYYY-MM-DD)
- sales_rep: text (영업사원 이름)
- company_name: text (방문 회사명)
- contact_person: text (회사 담당자 직함, 예: 과장, 부장)
- start_time: text (방문 시작 시간, 예: 09:00)
- end_time: text (방문 종료 시간, 예: 10:30)
- visit_type: text (방문 유형 또는 제품코드, 예: 방문, 4920, 9322-08)
- notes: text (상세 내용, 미팅/상담 내용)
- customer_code: text (거래처 코드, customers 테이블에서 자동 매칭)
- source_file: text (원본 파일명)
- inserted_at: timestamptz (입력 일시)

인덱스:
- diary_date 단독
- (company_name, diary_date) 복합
- (sales_rep, diary_date) 복합

참고: sales_clean 테이블과 company_name ↔ customer_name 또는 customer_code로 연결 가능
`.trim();

export const CUSTOMERS_TABLE_NAME = "customers";

export const CUSTOMERS_TABLE_SCHEMA = `
테이블명: ${CUSTOMERS_TABLE_NAME}

설명: 거래처 마스터 (거래처 코드 ↔ 회사명 매핑)

컬럼 정보:
- id: bigserial (PK, 자동 증가)
- customer_code: text (거래처 코드, UNIQUE)
- company_name: text (회사명/거래처명/상호, 원본 그대로 저장)
- normalized_name: text (정규화된 이름 — 법인 접두어/공백/괄호 제거, 소문자) ← 거래처 검색은 이 컬럼 사용
- aliases: text[] (별칭 배열 — 예: ['3h', 'three h']. 영문 약칭 등 자동 추론 불가능한 매핑)
- representative: text (대표자)
- sales_rep: text (매출담당자)
- business_number: text (사업자등록번호)
- contact_person: text (거래처 담당자)
- department: text (매입담당)
- status: text (상태)
- notes: text (기타정보)

참고:
- sales_clean.customer_code 및 sales_diary.customer_code와 JOIN 가능
- 거래처명 검색 시 customers.normalized_name 또는 customers.aliases 사용 (raw company_name 검색 금지)
`.trim();

export const PURCHASES_TABLE_NAME = "purchases";

export const PURCHASES_TABLE_SCHEMA = `
테이블명: ${PURCHASES_TABLE_NAME}

설명: 매입 내역 (공급업체로부터 구매한 제품 기록)

컬럼 정보:
- id: bigserial (PK, 자동 증가)
- row_no: int (원본 파일 행 번호)
- purchase_date: date (매입일, 형식: YYYY-MM-DD)
- customer_name: text (공급업체명/거래처명)
- customer_code: text (거래처 코드, customers 테이블에서 자동 매칭)
- sales_rep: text (담당사원)
- product_name: text (제품명)
- product_spec: text (규격/재단)
- product_group: text (제품군)
- qty: numeric (수량)
- purchase_cost: numeric (매입원가, 단가)
- supply_amount: numeric (공급가액)
- vat: numeric (부가세)
- total_amount: numeric (합계 = 공급가액 + 부가세)
- source_file: text (원본 파일명)
- inserted_at: timestamptz (입력 일시)

인덱스:
- purchase_date 단독
- (customer_name, purchase_date) 복합
- (product_name, purchase_date) 복합

총 행 수: 약 12,360건 (2020~2026)

참고:
- sales_clean과 product_name으로 매입/매출 비교 가능
- customer_name은 공급업체 (매출의 customer_name은 판매 고객)
- 공통 제품 약 1,110개, 공통 거래처 약 51곳
`.trim();
