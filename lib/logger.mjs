/**
 * 질문/답변 로깅 모듈
 * query_logs 테이블에 저장 (fire-and-forget)
 */
import { supabase } from "./clients.mjs";

/** 질문/답변을 query_logs에 저장 (비동기, 실패해도 무시) */
export function logQuery({ mode, question, answer, sql_generated = null, data = null, sources = null, success = true, error_message = null }) {
  supabase
    .from("query_logs")
    .insert({
      mode,
      question,
      answer,
      sql_generated,
      data: data ? JSON.stringify(data) : null,
      sources: sources ? JSON.stringify(sources) : null,
      success,
      error_message,
    })
    .then(({ error }) => {
      if (error) console.error("로그 저장 실패:", error.message);
    });
}
