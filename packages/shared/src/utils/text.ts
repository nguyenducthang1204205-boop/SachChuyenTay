/**
 * Chuẩn hoá chuỗi để tìm kiếm không dấu: "Nguyễn Nhật Ánh" → "nguyen nhat anh".
 * Dùng chung cho FE và BE (BE lưu cột search_text đã chuẩn hoá để truy vấn nhanh).
 */
export function normalizeText(input: string | null | undefined): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tách từ khoá tìm kiếm thành các term đã chuẩn hoá. */
export function toSearchTerms(query: string | null | undefined, maxTerms = 8): string[] {
  return normalizeText(query).split(" ").filter(Boolean).slice(0, maxTerms);
}

/** Lấy tên gọi (từ cuối) trong họ tên tiếng Việt: "Nguyễn Văn An" → "An". */
export function givenName(fullName: string): string {
  return fullName.trim().split(/\s+/).pop() ?? "";
}
