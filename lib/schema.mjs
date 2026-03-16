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
- customer_code: text (거래처 코드)
- sales_rep: text (영업 담당자)
- product_name: text (제품명)
- product_group: text (제품군)
- qty: numeric (수량)
- unit_price: numeric (판매 단가)
- supply_amount: numeric (공급가액, 부가세 제외) ← 매출 계산 시 사용
- margin_rate_pct: numeric (마진율 %, 예: 20% → 20.0)
- vat: numeric (부가세)
- total_amount: numeric (합계 = 공급가액 + 부가세)
- source_file: text (원본 파일명)
- inserted_at: timestamptz (입력 일시)

인덱스:
- sale_date 단독
- (customer_name, sale_date) 복합
- (customer_code, sale_date) 복합

총 행 수: 약 51,000건
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
- source_file: text (원본 파일명)
- inserted_at: timestamptz (입력 일시)

인덱스:
- diary_date 단독
- (company_name, diary_date) 복합
- (sales_rep, diary_date) 복합

참고: sales_clean 테이블과 company_name ↔ customer_name 으로 연결 가능
`.trim();
