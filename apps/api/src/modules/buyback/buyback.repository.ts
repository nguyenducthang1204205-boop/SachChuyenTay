import { count, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { buybackRequests, type BuybackRequestRow } from "../../db/schema.js";

export type NewBuybackRequest = typeof buybackRequests.$inferInsert;
export interface CreatedBuybackRequest {
  id: number;
  reference: string;
  bookCount: number;
  createdAt: Date;
}

export interface BuybackRepository {
  create(input: NewBuybackRequest): Promise<CreatedBuybackRequest>;
  /* --- Quản trị --- */
  list(
    filter: { status?: string | undefined },
    page: { limit: number; offset: number }
  ): Promise<{ rows: BuybackRequestRow[]; total: number }>;
  findById(id: number): Promise<BuybackRequestRow | null>;
  updateStatus(id: number, status: string): Promise<void>;
}

export class DrizzleBuybackRepository implements BuybackRepository {
  constructor(private readonly db: Database) {}

  async create(input: NewBuybackRequest) {
    const [row] = await this.db.insert(buybackRequests).values(input).returning({
      id: buybackRequests.id,
      reference: buybackRequests.reference,
      bookCount: buybackRequests.bookCount,
      createdAt: buybackRequests.createdAt
    });
    if (!row) throw new Error("Không lưu được yêu cầu thu mua");
    return row;
  }

  async list(filter: { status?: string | undefined }, page: { limit: number; offset: number }) {
    const where = filter.status ? eq(buybackRequests.status, filter.status) : undefined;
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(buybackRequests)
        .where(where)
        .orderBy(desc(buybackRequests.createdAt), desc(buybackRequests.id))
        .limit(page.limit)
        .offset(page.offset),
      this.db.select({ total: count() }).from(buybackRequests).where(where)
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  }

  async findById(id: number) {
    const [row] = await this.db.select().from(buybackRequests).where(eq(buybackRequests.id, id)).limit(1);
    return row ?? null;
  }

  async updateStatus(id: number, status: string) {
    await this.db.update(buybackRequests).set({ status }).where(eq(buybackRequests.id, id));
  }
}
