/**
 * 임베딩 생성 모듈
 */
import { ai, EMBED_MODEL, EMBED_DIM } from "./clients.mjs";

/** 텍스트를 임베딩 벡터로 변환 */
export async function embedQuery(text) {
  const res = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: [text],
    config: { outputDimensionality: EMBED_DIM },
  });
  return res.embeddings[0].values || res.embeddings[0];
}

/** 여러 텍스트를 한 번에 임베딩 (인제스트용) */
export async function embedTexts(texts) {
  const res = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: texts,
    config: { outputDimensionality: EMBED_DIM },
  });
  return res.embeddings;
}
