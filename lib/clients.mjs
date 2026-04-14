/**
 * 공통 클라이언트 초기화 모듈
 * Gemini AI + Supabase 클라이언트를 한 곳에서 관리
 */
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const GEN_MODEL = process.env.GEN_MODEL || "gemini-2.5-flash";
export const EMBED_MODEL = process.env.EMBED_MODEL || "gemini-embedding-001";
export const EMBED_DIM = Number(process.env.EMBED_DIM || "1536");

export const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/** 환경 변수가 모두 설정되었는지 확인 */
export function validateEnv() {
  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("필수 환경 변수가 설정되지 않았습니다 (GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  }
}
