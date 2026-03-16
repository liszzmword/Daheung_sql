/**
 * 공통 인증 모듈
 * 모든 API 엔드포인트에서 사용
 */

/** 요청의 인증 토큰 검증 */
export function verifyAuth(req) {
  const token = req.headers["x-auth-token"];
  if (!token || token !== process.env.APP_PASSWORD) {
    return false;
  }
  return true;
}

/** CORS 헤더 설정 */
export function setCorsHeaders(res) {
  const origin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Auth-Token"
  );
}

/** 인증 실패 응답 */
export function sendUnauthorized(res) {
  return res.status(401).json({ success: false, error: "인증이 필요합니다." });
}
