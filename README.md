# 대흥 세일즈 조회 시스템

세일즈 데이터(`sales_clean`) 분석을 위한 RAG + Text-to-SQL 질의응답 시스템.
Gemini AI와 Supabase 벡터 검색을 활용하여 자연어 질문에 답변합니다.

## 기능

- **문서 모드 (RAG)**: 비즈니스 규칙, 데이터 정의, 지표 계산 방법 질의응답
- **데이터 모드 (SQL)**: 자연어 → SQL 자동 생성 → 실행 → 결과 설명

## 프로젝트 구조

```
rag-sales/
├── lib/                        # 공통 모듈
│   ├── clients.mjs             # Gemini AI + Supabase 클라이언트
│   ├── schema.mjs              # sales_clean 테이블 스키마 정의
│   ├── embedding.mjs           # 임베딩 생성
│   ├── rag.mjs                 # 벡터 검색 + RAG 답변 생성
│   └── sql.mjs                 # SQL 생성 + 실행 + 검증 + 답변
├── api/                        # Vercel Serverless Functions
│   ├── query.mjs               # RAG 문서 질의응답 API
│   └── query-sql.mjs           # Text-to-SQL 데이터 조회 API
├── scripts/                    # CLI 도구
│   ├── ingest_rag_gemini.mjs   # 문서 벡터화 및 DB 저장
│   ├── query_rag.mjs           # 단일 RAG 질의
│   ├── query_sql.mjs           # 단일 SQL 질의
│   ├── chat.mjs                # 대화형 RAG 챗봇
│   ├── chat_sql.mjs            # 대화형 SQL 챗봇
│   ├── inspect_table.mjs       # 테이블 구조 확인
│   ├── check_functions.mjs     # RPC 함수 확인
│   └── test_gemini_api.mjs     # Gemini API 테스트
├── rag_docs/                   # RAG 검색 대상 문서
│   ├── data_dictionary.md      # 데이터 컬럼 정의
│   ├── metrics.md              # 비즈니스 지표 정의
│   └── business_rules.md       # 비즈니스 규칙
├── public/
│   └── index.html              # 웹 UI
└── package.json
```

## 설정

### 환경 변수

`.env` 파일 생성:

```
GEMINI_API_KEY=your_key
SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
GEN_MODEL=gemini-2.5-flash
EMBED_MODEL=gemini-embedding-001
EMBED_DIM=1536
```

### 설치 및 실행

```bash
npm install

# 문서 인제스트 (최초 1회)
npm run ingest

# CLI 테스트
npm run query-sql "2024년 전체 매출은?"
npm run chat-sql

# 웹 서버 (Vercel)
vercel dev
```

## 기술 스택

- Node.js (ES Modules)
- Google Gemini API (`@google/genai`)
- Supabase (pgvector)
- Vercel Serverless Functions
