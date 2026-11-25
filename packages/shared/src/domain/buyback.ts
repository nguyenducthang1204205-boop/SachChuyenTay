/**
 * Ước tính giá thu mua sách cũ (tham khảo). Hàm thuần — chạy được ở cả FE (phản hồi tức thì)
 * và BE (nếu sau này cần lưu kèm ước tính vào yêu cầu thu mua).
 */

/** Hệ số theo thể loại (thể loại không có trong bảng dùng hệ số "other"). */
export const BUYBACK_CATEGORY_FACTOR: Readonly<Record<string, number>> = {
  vhvn: 1,
  vhnn: 1.05,
  kynang: 0.9,
  kinhte: 1,
  thieunhi: 0.9,
  khoahoc: 1.1,
  congnghe: 1.2,
  other: 0.85
};

/** Tỷ lệ thu mua so với giá bìa theo tình trạng. */
export const BUYBACK_CONDITION_RATE: Readonly<Record<string, number>> = {
  "like-new": 0.38,
  good: 0.28,
  fair: 0.17
};

/** Nhận bằng điểm mua sách được cộng thêm 20%. */
export const STORE_CREDIT_BONUS = 0.2;

const BAND = 0.15;
const MAX_QUANTITY = 1000;

export interface BuybackEstimateInput {
  coverPrice: number;
  quantity: number;
  conditionId: string;
  categoryId: string;
}

export interface BuybackEstimate {
  low: number;
  high: number;
  /** Mức cao nhất nếu nhận bằng điểm mua sách. */
  creditHigh: number;
}

const roundToThousand = (n: number) => Math.round(n / 1000) * 1000;

export function estimateBuyback(input: BuybackEstimateInput): BuybackEstimate | null {
  const price = Math.max(0, Number(input.coverPrice) || 0);
  const qty = Math.max(0, Math.min(MAX_QUANTITY, Number(input.quantity) || 0));
  const rate = BUYBACK_CONDITION_RATE[input.conditionId] ?? 0;
  const factor = BUYBACK_CATEGORY_FACTOR[input.categoryId] ?? BUYBACK_CATEGORY_FACTOR.other ?? 1;

  const base = price * qty * rate * factor;
  if (!base) return null;

  const high = roundToThousand(base * (1 + BAND));
  return {
    low: roundToThousand(base * (1 - BAND)),
    high,
    creditHigh: roundToThousand(high * (1 + STORE_CREDIT_BONUS))
  };
}
