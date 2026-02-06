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
- inserted_at: timestamptz (입력 일시)

인덱스:
- sale_date 단독
- (customer_name, sale_date) 복합
- (customer_code, sale_date) 복합

총 행 수: 약 51,000건
`.trim();
