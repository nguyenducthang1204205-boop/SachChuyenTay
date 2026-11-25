import {
  IDEMPOTENCY_HEADER,
  type BookDetail,
  type BookListParams,
  type BookSummary,
  type BuybackRequestInput,
  type BuybackRequestReceipt,
  type CartQuote,
  type CartQuoteRequest,
  type Category,
  type Condition,
  type CreateOrderRequest,
  type ListResponse,
  type OrderConfirmation,
  type Paginated,
  type SubscribeResult
} from "@sct/shared";
import { request } from "./http.js";

/**
 * Bản đồ endpoint REST — một nơi duy nhất biết URL & kiểu dữ liệu của API.
 * Kiểu dữ liệu lấy từ @sct/shared nên FE và BE luôn đồng bộ lúc biên dịch.
 */

export const catalogApi = {
  listBooks: (params: BookListParams, signal?: AbortSignal) =>
    request<Paginated<BookSummary>>("/books", { query: params, signal }),
  getBook: (id: number, signal?: AbortSignal) => request<BookDetail>(`/books/${id}`, { signal }),
  getRelated: (id: number, limit = 4) =>
    request<ListResponse<BookSummary>>(`/books/${id}/related`, { query: { limit } }),
  listCategories: () => request<ListResponse<Category>>("/categories"),
  listConditions: () => request<ListResponse<Condition>>("/conditions")
};

export const checkoutApi = {
  quote: (body: CartQuoteRequest, signal?: AbortSignal) =>
    request<CartQuote>("/cart/quote", { method: "POST", body, signal }),
  placeOrder: (body: CreateOrderRequest, idempotencyKey: string) =>
    request<OrderConfirmation>("/orders", {
      method: "POST",
      body,
      headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
      timeoutMs: 30_000
    })
};

export const engagementApi = {
  submitBuyback: (body: BuybackRequestInput) =>
    request<BuybackRequestReceipt>("/buyback-requests", { method: "POST", body }),
  subscribe: (email: string) =>
    request<SubscribeResult>("/newsletter/subscriptions", { method: "POST", body: { email } })
};
