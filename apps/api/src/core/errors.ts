import { ERROR_CODES, type ErrorCode, type FieldError } from "@sct/shared";

/**
 * Lỗi ứng dụng có chủ đích. Service chỉ ném các lỗi này — tầng HTTP sẽ ánh xạ
 * sang Problem Details (RFC 9457). Nhờ vậy service không phụ thuộc vào Express.
 */
export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: ErrorCode;
  abstract readonly title: string;
  /** Dữ liệu bổ sung an toàn để trả về client. */
  readonly extensions: Record<string, unknown>;

  constructor(message: string, extensions: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.extensions = extensions;
  }
}

export class ValidationError extends AppError {
  readonly status = 400;
  readonly code = ERROR_CODES.VALIDATION_FAILED;
  readonly title = "Dữ liệu không hợp lệ";
  constructor(
    readonly errors: FieldError[],
    message = "Một số trường dữ liệu chưa hợp lệ."
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = ERROR_CODES.NOT_FOUND;
  readonly title = "Không tìm thấy";
}

export class ConflictError extends AppError {
  readonly status = 409;
  readonly code: ErrorCode = ERROR_CODES.CONFLICT;
  readonly title: string = "Xung đột dữ liệu";
}

/** Không xoá được vì bản ghi đang được tham chiếu (sách đã có đơn, thể loại còn sách…). */
export class InUseError extends ConflictError {
  override readonly code = ERROR_CODES.IN_USE;
  override readonly title = "Dữ liệu đang được sử dụng";
}

export class UnauthorizedError extends AppError {
  readonly status = 401;
  readonly code = ERROR_CODES.UNAUTHORIZED;
  readonly title = "Chưa đăng nhập";
  constructor(message = "Vui lòng đăng nhập để tiếp tục.") {
    super(message);
  }
}

export interface StockShortage {
  bookId: number;
  title: string | null;
  requested: number;
  available: number;
}

export class OutOfStockError extends ConflictError {
  override readonly code = ERROR_CODES.OUT_OF_STOCK;
  override readonly title = "Không đủ hàng";
  constructor(readonly shortages: StockShortage[]) {
    super("Một số cuốn sách trong giỏ không còn đủ số lượng.", { shortages });
  }
}

export class BusinessRuleError extends AppError {
  readonly status = 422;
  readonly title = "Yêu cầu không thể xử lý";
  constructor(
    readonly code: ErrorCode,
    message: string,
    extensions: Record<string, unknown> = {}
  ) {
    super(message, extensions);
  }
}

export class RateLimitError extends AppError {
  readonly status = 429;
  readonly code = ERROR_CODES.RATE_LIMITED;
  readonly title = "Quá nhiều yêu cầu";
  constructor() {
    super("Bạn thao tác hơi nhanh, vui lòng thử lại sau ít phút.");
  }
}

export class PayloadTooLargeError extends AppError {
  readonly status = 413;
  readonly code = ERROR_CODES.PAYLOAD_TOO_LARGE;
  readonly title = "Dữ liệu quá lớn";
}
