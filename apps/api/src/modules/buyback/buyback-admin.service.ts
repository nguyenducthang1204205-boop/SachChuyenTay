import type { AdminBuybackRequest, BuybackStatus, Paginated } from "@sct/shared";
import { NotFoundError } from "../../core/errors.js";
import type { BuybackRequestRow } from "../../db/schema.js";
import type { BuybackRepository } from "./buyback.repository.js";

const toAdmin = (r: BuybackRequestRow): AdminBuybackRequest => ({
  id: r.id,
  reference: r.reference,
  name: r.name,
  phone: r.phone,
  city: r.city,
  method: r.method,
  bookList: r.bookList,
  bookCount: r.bookCount,
  pickup: r.pickup,
  photoKeys: r.photoKeys,
  status: r.status as BuybackStatus,
  createdAt: r.createdAt.toISOString()
});

export class BuybackAdminService {
  constructor(private readonly repo: BuybackRepository) {}

  async list(q: {
    status?: BuybackStatus | undefined;
    page: number;
    pageSize: number;
  }): Promise<Paginated<AdminBuybackRequest>> {
    const { rows, total } = await this.repo.list(
      { status: q.status },
      { limit: q.pageSize, offset: (q.page - 1) * q.pageSize }
    );
    return {
      data: rows.map(toAdmin),
      meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) }
    };
  }

  async changeStatus(id: number, status: BuybackStatus): Promise<AdminBuybackRequest> {
    if (!(await this.repo.findById(id))) throw new NotFoundError("Không tìm thấy yêu cầu thu mua.");
    await this.repo.updateStatus(id, status);
    const updated = await this.repo.findById(id);
    return toAdmin(updated!);
  }
}
