import type {
  AdminBook,
  AdminBookListParams,
  AdminBuybackListParams,
  AdminBuybackRequest,
  AdminCategory,
  AdminOrderDetail,
  AdminOrderListParams,
  AdminOrderSummary,
  AdminUser,
  BookInput,
  BuybackStatus,
  CategoryInput,
  Condition,
  DashboardStats,
  ListResponse,
  LoginRequest,
  OrderStatus,
  Paginated,
  UploadedImage
} from "@sct/shared";
import { catalogApi } from "../api/endpoints.js";
import { API_BASE_URL, ApiError, request, type RequestOptions } from "../api/http.js";

/** Gọi khi API trả 401 (phiên hết hạn) — main.ts đăng ký để chuyển về màn hình đăng nhập. */
let onUnauthorized: () => void = () => undefined;
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

async function call<T>(path: string, options?: RequestOptions): Promise<T> {
  try {
    return await request<T>(`/admin${path}`, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !path.startsWith("/auth/")) onUnauthorized();
    throw err;
  }
}

/** Client cho toàn bộ API quản trị. Cookie phiên (HttpOnly) được trình duyệt tự gửi kèm. */
export const adminApi = {
  auth: {
    me: () => call<AdminUser>("/auth/me"),
    login: (body: LoginRequest) => call<AdminUser>("/auth/login", { method: "POST", body }),
    logout: () => call<void>("/auth/logout", { method: "POST" })
  },
  dashboard: () => call<DashboardStats>("/dashboard"),
  books: {
    list: (query: AdminBookListParams, signal?: AbortSignal) => call<Paginated<AdminBook>>("/books", { query, signal }),
    get: (id: number) => call<AdminBook>(`/books/${id}`),
    create: (body: BookInput) => call<AdminBook>("/books", { method: "POST", body }),
    update: (id: number, body: Partial<BookInput>) => call<AdminBook>(`/books/${id}`, { method: "PATCH", body }),
    remove: (id: number) => call<void>(`/books/${id}`, { method: "DELETE" })
  },
  categories: {
    list: () => call<ListResponse<AdminCategory>>("/categories"),
    create: (body: CategoryInput) => call<ListResponse<AdminCategory>>("/categories", { method: "POST", body }),
    update: (id: string, body: Partial<Omit<CategoryInput, "id">>) =>
      call<ListResponse<AdminCategory>>(`/categories/${id}`, { method: "PATCH", body }),
    remove: (id: string) => call<void>(`/categories/${id}`, { method: "DELETE" })
  },
  conditions: async (): Promise<Condition[]> => (await catalogApi.listConditions()).data,
  orders: {
    list: (query: AdminOrderListParams, signal?: AbortSignal) =>
      call<Paginated<AdminOrderSummary>>("/orders", { query, signal }),
    get: (id: number) => call<AdminOrderDetail>(`/orders/${id}`),
    setStatus: (id: number, status: OrderStatus) =>
      call<AdminOrderDetail>(`/orders/${id}/status`, { method: "PATCH", body: { status } })
  },
  uploads: {
    /** Gửi ảnh bìa (đã nén) dạng nhị phân → trả về URL dùng cho cover.imageUrl. */
    cover: (image: Blob) => call<UploadedImage>("/uploads/cover", { method: "POST", body: image, timeoutMs: 60_000 })
  },
  /** URL xem ảnh khách gửi (cookie quản trị được gửi kèm vì cùng đường dẫn /api). */
  mediaUrl: (key: string) => `${API_BASE_URL}/admin/media/${key}`,
  buyback: {
    list: (query: AdminBuybackListParams, signal?: AbortSignal) =>
      call<Paginated<AdminBuybackRequest>>("/buyback-requests", { query, signal }),
    setStatus: (id: number, status: BuybackStatus) =>
      call<AdminBuybackRequest>(`/buyback-requests/${id}/status`, { method: "PATCH", body: { status } })
  }
};
