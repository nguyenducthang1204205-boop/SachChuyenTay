/**
 * @sct/shared — public API của gói dùng chung.
 * Chỉ export những gì là "hợp đồng" giữa web và api; không chứa code phụ thuộc môi trường (DOM / Node).
 */
export * from "./constants.js";
export * from "./utils/text.js";
export * from "./domain/pricing.js";
export * from "./domain/buyback.js";
export * from "./contracts/common.js";
export * from "./contracts/catalog.js";
export * from "./contracts/cart.js";
export * from "./contracts/orders.js";
export * from "./contracts/engagement.js";
export * from "./contracts/admin.js";
export * from "./contracts/media.js";
