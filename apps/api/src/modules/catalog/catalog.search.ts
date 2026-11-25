import { normalizeText } from "@sct/shared";

/** Từ khoá bổ sung theo tag để người dùng gõ "sách hiếm" vẫn ra sách có tag `rare`. */
const TAG_KEYWORDS: Readonly<Record<string, string>> = {
  rare: "sach hiem rare",
  bestseller: "ban chay bestseller"
};

export interface SearchableBook {
  title: string;
  author: string;
  publisher: string;
  categoryName: string;
  tags: readonly string[];
}

/** Sinh nội dung cột `search_text` — gọi mỗi khi tạo / sửa sách. */
export function buildSearchText(book: SearchableBook): string {
  return normalizeText(
    [book.title, book.author, book.publisher, book.categoryName, ...book.tags.map((t) => TAG_KEYWORDS[t] ?? t)].join(
      " "
    )
  );
}

/** Mã SKU hiển thị: SCT-00001. */
export const toSku = (id: number) => `SCT-${String(id).padStart(5, "0")}`;

/** Escape ký tự đặc biệt của LIKE để từ khoá người dùng không thành wildcard. */
export const escapeLike = (term: string) => term.replace(/[\\%_]/g, (c) => `\\${c}`);
