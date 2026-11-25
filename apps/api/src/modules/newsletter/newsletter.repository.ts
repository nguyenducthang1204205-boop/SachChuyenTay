import type { Database } from "../../db/client.js";
import { newsletterSubscribers } from "../../db/schema.js";

export interface NewsletterRepository {
  /** Thêm email; trả về false nếu email đã đăng ký từ trước. */
  subscribe(email: string, source: string): Promise<boolean>;
}

export class DrizzleNewsletterRepository implements NewsletterRepository {
  constructor(private readonly db: Database) {}

  async subscribe(email: string, source: string) {
    const inserted = await this.db
      .insert(newsletterSubscribers)
      .values({ email, source })
      .onConflictDoNothing({ target: newsletterSubscribers.email })
      .returning({ id: newsletterSubscribers.id });
    return inserted.length > 0;
  }
}
