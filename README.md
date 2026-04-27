# 대흥 세일즈 조회 시스템

매출/매입/영업일지 데이터 분석을 위한 RAG + Text-to-SQL 질의응답 시스템.
Gemini AI와 Supabase pgvector를 활용하여 자연어 질문에 답변합니다.

## 기능

- **문서 모드 (RAG)**: 비즈니스 규칙, 데이터 정의, 지표 계산 방법 질의응답
- **데이터 모드 (SQL)**: 자연어 → SQL 자동 생성 → 실행 → 결과 설명
- **답변 스트리밍 (SSE)**: SQL과 데이터 표를 즉시 보여주고, 자연어 답변은 글자 단위로 실시간 표시
- **거래처 별칭**: 사용자가 "3H" → "주식회사 쓰리에이치" 같은 별칭을 등록하면, 질문 시 자동으로 정식 명칭으로 치환되어 검색됨
- **거래처 마스터/매입/매출/영업일지 업로드**: CSV/XLSX/XLS 자동 파싱 + customers와 fuzzy 자동 매칭

## 프로젝트 구조

```
rag-sales/
├── lib/                        # 공통 모듈
│   ├── clients.mjs             # Gemini AI + Supabase 클라이언트, NO_THINKING_CONFIG
│   ├── schema.mjs              # sales_clean / purchases / sales_diary / customers 스키마 정의
│   ├── embedding.mjs           # 임베딩 생성
│   ├── rag.mjs                 # 벡터 검색 + RAG 답변 (스트리밍 포함)
│   ├── sql.mjs                 # SQL 생성 + 실행 + 검증 + 답변 (스트리밍 포함)
│   ├── customers.mjs           # 거래처 마스터 파싱 + customer_code 자동 매칭
│   ├── aliases.mjs             # 거래처 별칭 정규화 + 질문 텍스트 치환
│   ├── diary.mjs               # 영업일지 파싱
│   ├── auth.mjs                # 비밀번호 인증 + CORS
│   └── logger.mjs              # 질문/답변 로그 (query_logs)
├── api/                        # Vercel Serverless Functions
│   ├── query.mjs               # RAG 문서 질의응답 (SSE 스트리밍)
│   ├── query-sql.mjs           # Text-to-SQL 데이터 조회 (SSE 스트리밍)
│   ├── upload.mjs              # 매출/매입/영업일지/거래처 업로드
│   ├── aliases.mjs             # 거래처 별칭 CRUD
│   ├── customer-search.mjs     # 거래처명 자동완성 (별칭 등록 보조)
│   ├── auth.mjs                # 로그인 검증
│   ├── sync-status.mjs         # 데이터 현황
│   └── query-logs.mjs          # 히스토리 조회
├── scripts/                    # CLI 도구
│   ├── ingest_rag_gemini.mjs   # RAG 문서 벡터화 → DB 저장
│   ├── query_rag.mjs           # 단일 RAG 질의
│   ├── query_sql.mjs           # 단일 SQL 질의
│   ├── chat.mjs                # 대화형 RAG 챗봇 (CLI)
│   ├── chat_sql.mjs            # 대화형 SQL 챗봇 (CLI)
│   ├── sync_sales.mjs          # 매출/매입 CSV 동기화
│   └── sync_diary.mjs          # 영업일지 동기화
├── rag_docs/                   # RAG 검색 대상 문서
│   ├── data_dictionary.md      # 데이터 컬럼 정의
│   ├── metrics.md              # 비즈니스 지표 정의 (매출/매입/수익성)
│   └── business_rules.md       # 운영 기준/가정
├── public/
│   └── index.html              # 웹 UI (로그인 + 챗봇 + 업로드/별칭/기록 모달)
└── package.json
```

## 설정

### 환경 변수

`.env` 파일:

```
GEMINI_API_KEY=your_key
SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
APP_PASSWORD=your_password
GEN_MODEL=gemini-2.5-flash
EMBED_MODEL=gemini-embedding-001
EMBED_DIM=1536
```

### DB 마이그레이션 (1회 실행)

Supabase SQL Editor에서:

```sql
-- 거래처 별칭 테이블
CREATE TABLE IF NOT EXISTS customer_aliases (
  id BIGSERIAL PRIMARY KEY,
  alias TEXT NOT NULL UNIQUE,
  canonical TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_aliases_alias ON customer_aliases (alias);
```

### 설치 및 실행

```bash
npm install

# RAG 문서 인제스트 (최초 1회)
npm run ingest

# CLI 테스트
npm run query-sql "2024년 전체 매출은?"
npm run chat-sql

# 웹 서버 (Vercel)
vercel dev
```

## 주요 동작 흐름 (데이터 모드)

```
사용자 질문 ("2026년 3H 매출")
  ↓
[별칭 치환] "2026년 주식회사 쓰리에이치 매출"
  ↓
[Gemini 임베딩] → [pgvector RAG 검색] → 비즈니스 규칙 컨텍스트
  ↓
[Gemini SQL 생성] (thinking off, 빠른 응답)
  ↓
[Supabase 실행] → SQL + 데이터 표 즉시 클라이언트 전송 (meta 이벤트)
  ↓
[Gemini 답변 스트리밍] → 글자 단위 SSE 전송
  ↓
[query_logs 비동기 로깅]
```

## 성능 특성

- 답변 스트리밍 적용으로 SQL/데이터 표는 ~3~5초에 표시
- Gemini 2.5-flash thinking 비활성화로 SQL 생성/답변 생성 단계 약 1.5~3초씩 단축
- 일반 질문 기준 총 응답 시간 5~8초

## 기술 스택

- Node.js (ES Modules)
- Google Gemini API (`@google/genai`) — gemini-2.5-flash, gemini-embedding-001
- Supabase (PostgreSQL + pgvector + pg_trgm)
- Vercel Serverless Functions (SSE 스트리밍)
- Pretendard Variable (한글 폰트), 단일 페이지 HTML/CSS/JS UI
