/**
 * Hằng số nghiệp vụ dùng chung. Mọi con số "ma thuật" về tiền / giới hạn đặt ở đây
 * để FE (hiển thị) và BE (tính toán chính thức) luôn khớp nhau.
 */

/** Đơn từ mức này (tính trên tạm tính, trước giảm giá) được miễn phí giao hàng. */
export const FREE_SHIPPING_THRESHOLD = 300_000;

/** Phí giao hàng đồng giá khi chưa đạt ngưỡng miễn phí. */
export const SHIPPING_FEE = 25_000;

/** Số lượng tối đa cho một dòng sản phẩm trong giỏ. */
export const MAX_LINE_QUANTITY = 99;

/** Số dòng sản phẩm tối đa trong một giỏ / đơn. */
export const MAX_CART_LINES = 100;

/** Phân trang danh mục sách. */
export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;

export const CURRENCY = "VND" as const;
export const LOCALE = "vi-VN" as const;

export const API_VERSION_PREFIX = "/api/v1" as const;
