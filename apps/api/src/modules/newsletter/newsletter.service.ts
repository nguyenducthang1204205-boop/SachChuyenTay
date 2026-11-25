import type { SubscribeResult } from "@sct/shared";
import type { NewsletterRepository } from "./newsletter.repository.js";

export class NewsletterService {
  constructor(
    private readonly repo: NewsletterRepository,
    private readonly welcomeCouponCode: string | null
  ) {}

  async subscribe(email: string): Promise<SubscribeResult> {
    const isNew = await this.repo.subscribe(email, "website");
    // Điểm mở rộng: đẩy job gửi email chào mừng (kèm mã giảm giá) vào hàng đợi.
    return { email, alreadySubscribed: !isNew, welcomeCouponCode: this.welcomeCouponCode };
  }
}
