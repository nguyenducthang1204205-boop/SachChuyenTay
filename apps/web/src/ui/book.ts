import type { BookSummary, ConditionId } from "@sct/shared";
import { formatVnd } from "../lib/format.js";
import { html, type SafeHtml } from "../lib/html.js";
import { wishlistStore } from "../stores/wishlist.store.js";
import { icon } from "./icons.js";

/** Component hiển thị liên quan tới sách. Thuần: nhận dữ liệu → trả về HTML an toàn. */

export const productUrl = (book: Pick<BookSummary, "id">) => `product.html?id=${book.id}`;

type CoverBook = Pick<BookSummary, "title" | "author" | "publisher" | "cover">;

/** Bìa sách: ảnh thật nếu có, nếu không vẽ bằng CSS từ màu trong dữ liệu. */
export function cover(book: CoverBook, { small = false } = {}): SafeHtml {
  const { cover: c } = book;
  if (c.imageUrl) {
    return html`<div class="cover${small ? " cover--sm" : ""}">
      <img src="${c.imageUrl}" alt="Bìa sách ${book.title}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover" />
    </div>`;
  }
  const style = `--c1:${c.from};--c2:${c.to}${c.ink ? `;--cv-ink:${c.ink}` : ""}`;
  return html`<div class="cover cover--p${c.pattern}${small ? " cover--sm" : ""}" style="${style}" role="img" aria-label="Bìa sách ${book.title}">
    <span class="cover__deco"></span>
    <div class="cover__inner">
      <span class="cover__author">${book.author}</span>
      <span class="cover__title">${book.title}</span>
      <span class="cover__pub">${book.publisher}</span>
    </div>
  </div>`;
}

export const conditionBadge = (condition: { id: ConditionId; label: string }) =>
  html`<span class="cond cond--${condition.id}">${condition.label}</span>`;

const METER_COLOR: Record<ConditionId, string> = {
  "like-new": "var(--primary)",
  good: "var(--gold)",
  fair: "var(--accent)"
};

export function conditionMeter(conditionId: ConditionId, level: number): SafeHtml {
  const segments = [1, 2, 3, 4, 5].map((i) => html`<i class="${i <= level ? "on" : ""}"></i>`);
  return html`<div class="meter" style="--meter:${METER_COLOR[conditionId]}" aria-hidden="true">${segments}</div>`;
}

export function stars(rating: number): SafeHtml {
  const items = [1, 2, 3, 4, 5].map((i) => icon("star", `icon--fill${rating >= i - 0.25 ? "" : " is-empty"}`));
  return html`<span class="stars" aria-label="${rating} trên 5 sao">${items}</span>`;
}

export function badges(book: BookSummary): SafeHtml {
  const isRare = book.tags.includes("rare");
  let main: SafeHtml | null = null;
  if (book.stock === 0) main = html`<span class="badge badge--sold">Đã chuyền tay</span>`;
  else if (isRare) main = html`<span class="badge badge--rare">${icon("sparkles")} Sách hiếm</span>`;
  else if (book.discountPercent > 0) main = html`<span class="badge badge--sale">-${book.discountPercent}%</span>`;
  const loved =
    book.tags.includes("bestseller") && book.stock > 0 ? html`<span class="badge">Được yêu thích</span>` : null;
  return html`<div class="book-card__badges">${main}${loved}</div>`;
}

export function price(book: Pick<BookSummary, "price" | "originalPrice">): SafeHtml {
  return html`<div class="price">
    <strong>${formatVnd(book.price)}</strong>${book.originalPrice ? html`<s>${formatVnd(book.originalPrice)}</s>` : html`<s>&nbsp;</s>`}
  </div>`;
}

export function bookCard(book: BookSummary): SafeHtml {
  const sold = book.stock === 0;
  const wished = wishlistStore.has(book.id);
  return html`<article class="book-card${sold ? " is-sold" : ""}">
    <div class="book-card__media">${badges(book)}${cover(book, { small: true })}</div>
    <button class="book-card__wish" type="button" data-wish="${book.id}" aria-pressed="${wished}" aria-label="Thêm vào yêu thích">${icon("heart")}</button>
    <div class="book-card__body">
      <div class="book-card__meta"><span class="book-card__cat">${book.category.name}</span>${conditionBadge(book.condition)}</div>
      <h3 class="book-card__title"><a href="${productUrl(book)}">${book.title}</a></h3>
      <p class="book-card__author">${book.author}</p>
      <div class="book-card__foot">
        ${price(book)}
        <button class="add-btn" type="button" data-add-cart="${book.id}" ${sold ? "disabled" : ""} aria-label="${sold ? "Đã bán" : `Thêm “${book.title}” vào giỏ`}">${icon(sold ? "check" : "bag")}</button>
      </div>
    </div>
  </article>`;
}

export const bookCards = (books: readonly BookSummary[]) => books.map(bookCard);
