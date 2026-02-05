# RAG Sales Analysis API

세일즈 데이터 분석을 위한 RAG 기반 질의응답 API입니다. Gemini AI와 Supabase 벡터 검색을 활용하여 자연어 질문에 답변합니다.

## 기능

- **RAG 질의응답**: 비즈니스 규칙, 데이터 정의, 지표 계산 방법 등에 대한 질문
- **벡터 검색**: 질문과 관련된 문서를 자동으로 검색
- **AI 답변 생성**: Gemini AI로 정확하고 구체적인 답변 생성

## 프로젝트 구조

```
rag-sales/
├── api/
│   └── query.mjs          # Vercel Serverless Function (RAG API)
├── scripts/
│   ├── ingest_rag_gemini.mjs  # 문서 벡터화 및 DB 저장
│   ├── query_rag.mjs          # CLI 질의응답
│   ├── chat.mjs               # 대화형 RAG 챗봇
│   ├── query_sql.mjs          # Text-to-SQL 질의응답
│   └── chat_sql.mjs           # 대화형 SQL 챗봇
├── rag_docs/
│   ├── data_dictionary.md     # 데이터 컬럼 정의
│   ├── metrics.md             # 비즈니스 지표 정의
│   └── business_rules.md      # 비즈니스 규칙
├── package.json
├── vercel.json
└── .env (로컬 개발용)
```

## 로컬 개발

### 1. 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 입력하세요:

```env
GEMINI_API_KEY=your_gemini_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GEN_MODEL=gemini-2.5-flash
EMBED_MODEL=gemini-embedding-001
EMBED_DIM=1536
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 문서 인제스트 (최초 1회)

```bash
npm run ingest
```

이 명령어는 `rag_docs/` 폴더의 문서들을 벡터화하여 Supabase에 저장합니다.

### 4. 로컬 CLI 테스트

**단일 질의응답:**
```bash
npm run query "2024년 매출 계산 방법은?"
```

**대화형 챗봇:**
```bash
npm run chat
```

**Text-to-SQL:**
```bash
npm run query-sql "2024년 전체 매출은?"
npm run chat-sql  # 대화형
```

### 5. Vercel 로컬 개발 서버

```bash
npm install -g vercel
vercel dev
```

API 테스트:
```bash
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"question": "이탈 고객은 어떻게 정의하나요?"}'
```

## API 사용법

### 엔드포인트

```
POST /api/query
```

### 요청

```json
{
  "question": "질문 내용"
}
```

### 응답

**성공 (200):**
```json
{
  "success": true,
  "question": "질문 내용",
  "answer": "AI가 생성한 답변",
  "sources": [
    {
      "doc_id": "data_dictionary",
      "similarity": 0.85
    }
  ]
}
```

**오류 (400/500):**
```json
{
  "success": false,
  "error": "오류 메시지"
}
```

### 예시

```bash
curl -X POST https://your-project.vercel.app/api/query \
  -H "Content-Type: application/json" \
  -d '{"question": "2024년 매출 계산 방법은?"}'
```

## Vercel 배포

### 1. Vercel CLI 설치 및 로그인

```bash
npm install -g vercel
vercel login
```

### 2. 프로젝트 연결

```bash
vercel
```

프롬프트에 따라 프로젝트를 생성하거나 연결합니다.

### 3. 환경 변수 설정

Vercel 대시보드에서 프로젝트 Settings > Environment Variables로 이동하여 다음 환경 변수를 추가:

- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEN_MODEL` (optional, default: gemini-2.5-flash)
- `EMBED_MODEL` (optional, default: gemini-embedding-001)
- `EMBED_DIM` (optional, default: 1536)

### 4. 프로덕션 배포

```bash
vercel --prod
```

배포가 완료되면 URL이 출력됩니다.

## 기술 스택

- **Runtime**: Node.js (ES Modules)
- **AI Model**: Google Gemini API
- **Vector DB**: Supabase (pgvector)
- **Deployment**: Vercel Serverless Functions
- **Packages**:
  - `@google/genai`: Gemini AI SDK
  - `@supabase/supabase-js`: Supabase 클라이언트
  - `dotenv`: 환경 변수 관리

## 주의사항

- `.env` 파일은 Git에 커밋되지 않습니다
- Vercel 환경 변수는 대시보드에서 수동으로 설정해야 합니다
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 환경에서만 사용하세요
- API에는 인증 및 rate limiting이 포함되지 않았습니다 (필요시 추가)

## 문서 업데이트

새로운 문서를 추가하거나 기존 문서를 수정한 후:

```bash
npm run ingest
```

이 명령어로 변경사항을 벡터 DB에 반영하세요.

## 라이선스

ISC
