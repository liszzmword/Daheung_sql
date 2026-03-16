import { setCorsHeaders } from "../lib/auth.mjs";

/** 간단 비밀번호 인증 API */
export default function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { password } = req.body || {};

  if (!password) {
    return res.status(400).json({ success: false, error: "비밀번호를 입력해주세요." });
  }

  if (password === process.env.APP_PASSWORD) {
    return res.status(200).json({ success: true });
  }

  return res.status(401).json({ success: false, error: "비밀번호가 틀렸습니다." });
}
