/**
 * 영업일지 XLS 파싱 모듈
 * 시트 이름 = 영업사원 이름
 * 컬럼 순서 (0~6): 날짜 / 기업 / 기업담당자 / 시작시간 / 끝시간 / 방문또는제품명 / 내용
 */
import * as XLSX from "xlsx";

/**
 * Excel serial number를 Date로 변환
 */
export function excelSerialToDate(serial) {
  if (typeof serial !== "number" || serial < 1) return null;
  const d = new Date((serial - 25569) * 86400 * 1000);
  return d;
}

/**
 * 한국어 날짜 문자열 파싱: "12월02일" → { month: 12, day: 2 }
 */
function parseKoreanDate(text) {
  if (!text || typeof text !== "string") return null;
  const m = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (!m) return null;
  return { month: parseInt(m[1], 10), day: parseInt(m[2], 10) };
}

/**
 * 셀 값에서 날짜를 추출 (Excel serial / 한국어 형식 모두 지원)
 * @param {*} cellValue - 셀 값
 * @param {number} year - 기준 연도
 * @returns {Date|null}
 */
function parseDateCell(cellValue, year) {
  if (cellValue == null || cellValue === "") return null;

  // Excel serial number
  if (typeof cellValue === "number" && cellValue > 40000) {
    return excelSerialToDate(cellValue);
  }

  // JS Date 객체 (xlsx가 자동 변환한 경우)
  if (cellValue instanceof Date) {
    return cellValue;
  }

  // 한국어 형식: "12월02일"
  const str = String(cellValue).trim();
  const parsed = parseKoreanDate(str);
  if (parsed) {
    return new Date(year, parsed.month - 1, parsed.day);
  }

  return null;
}

/**
 * HTML 태그 제거 및 줄바꿈 정리
 */
function cleanNotes(text) {
  if (!text) return "";
  let cleaned = String(text);
  cleaned = cleaned.replace(/<br\s*\/?>/gi, "\n");
  cleaned = cleaned.replace(/<[^>]+>/g, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

/**
 * 시간 값을 문자열로 정규화
 */
function normalizeTime(value) {
  if (value == null || value === "") return null;

  // Excel 시간 소수 (0.5 = 12:00)
  if (typeof value === "number" && value >= 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  return String(value).trim();
}

/**
 * XLS 파일을 파싱하여 영업일지 데이터 배열 반환
 * @param {Buffer|string} input - 파일 경로 또는 Buffer
 * @param {number} year - 기준 연도 (한국어 날짜에서 연도 추정용)
 * @returns {{ entries: Array, sheetNames: string[] }}
 */
export function parseDiaryXLS(input, year) {
  const opts = typeof input === "string"
    ? { type: "file" }
    : { type: "buffer" };

  const workbook = XLSX.read(input, { ...opts, cellDates: false });
  const entries = [];
  const sheetNames = workbook.SheetNames;

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    const salesRep = sheetName.trim();

    let currentDate = null;

    for (const row of rows) {
      // 빈 행 스킵 (기업명이 없으면 스킵, 날짜만 있는 행도 날짜 업데이트)
      const dateCell = row[0];
      const company = row[1];
      const contact = row[2];
      const startTime = row[3];
      const endTime = row[4];
      const visitType = row[5];
      const notes = row[6];

      // 날짜 파싱 (carry-forward)
      const parsedDate = parseDateCell(dateCell, year);
      if (parsedDate) {
        currentDate = parsedDate;
      }

      // 기업명이 없으면 데이터 행이 아님
      if (!company || String(company).trim() === "") continue;
      if (!currentDate) continue;

      entries.push({
        diary_date: formatDate(currentDate),
        sales_rep: salesRep,
        company_name: String(company).trim(),
        contact_person: contact ? String(contact).trim() : null,
        start_time: normalizeTime(startTime),
        end_time: normalizeTime(endTime),
        visit_type: visitType ? String(visitType).trim() : null,
        notes: cleanNotes(notes),
      });
    }
  }

  return { entries, sheetNames };
}

/**
 * Date를 YYYY-MM-DD 문자열로 변환
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 영업일지 엔트리를 RAG 인제스트용 텍스트로 변환
 * 날짜별로 묶어서 하나의 텍스트 문서로 조합
 */
export function composeDiaryText(entries) {
  const byDate = {};
  for (const e of entries) {
    if (!byDate[e.diary_date]) byDate[e.diary_date] = [];
    byDate[e.diary_date].push(e);
  }

  const sections = [];
  for (const [date, items] of Object.entries(byDate).sort()) {
    const lines = [`[${date} 영업일지]`];
    for (const item of items) {
      const parts = [`영업사원: ${item.sales_rep}`, `회사: ${item.company_name}`];
      if (item.contact_person) parts.push(`담당: ${item.contact_person}`);
      if (item.start_time) parts.push(`시간: ${item.start_time}~${item.end_time || ""}`);
      if (item.visit_type) parts.push(`유형: ${item.visit_type}`);
      lines.push(parts.join(" | "));
      if (item.notes) lines.push(`내용: ${item.notes}`);
      lines.push("---");
    }
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}
