import { BUYBACK_PHOTO_MAX_BYTES, type BuybackRequestCommand, type BuybackRequestReceipt } from "@sct/shared";
import { referenceCode } from "../../core/ids.js";
import type { Logger } from "../../core/logger.js";
import type { MediaService } from "../media/media.service.js";
import type { BuybackRepository } from "./buyback.repository.js";

/** Đếm số cuốn trong danh sách (mỗi dòng không trống là một cuốn). */
export const countBooks = (list: string) => list.split(/\r?\n/).filter((l) => l.trim()).length;

/** "data:image/webp;base64,AAAA" → bytes (định dạng đã được schema Zod kiểm tra). */
const decodeDataUrl = (dataUrl: string) =>
  new Uint8Array(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));

export class BuybackService {
  constructor(
    private readonly repo: BuybackRepository,
    private readonly media: Pick<MediaService, "store" | "discard">,
    private readonly logger: Logger
  ) {}

  async submit(command: BuybackRequestCommand): Promise<BuybackRequestReceipt> {
    // Lưu ảnh trước; nếu bất kỳ bước nào sau đó lỗi thì xoá ảnh đã lưu → không để lại file mồ côi.
    const photoKeys: string[] = [];
    try {
      for (const [i, photo] of command.photos.entries()) {
        const stored = await this.media.store("buyback", decodeDataUrl(photo), {
          maxBytes: BUYBACK_PHOTO_MAX_BYTES,
          field: `body.photos.${i}`
        });
        photoKeys.push(stored.key);
      }
      const created = await this.repo.create({
        reference: referenceCode("BB"),
        name: command.name,
        phone: command.phone,
        city: command.city,
        method: command.method,
        bookList: command.bookList,
        bookCount: countBooks(command.bookList),
        pickup: command.pickup,
        photoKeys
      });
      this.logger.info(
        { reference: created.reference, bookCount: created.bookCount, photos: photoKeys.length },
        "Buyback request received"
      );
      // Điểm mở rộng: phát sự kiện "buyback.requested" → báo Zalo/Email cho nhân viên định giá.
      return { ...created, photoCount: photoKeys.length, createdAt: created.createdAt.toISOString() };
    } catch (err) {
      await this.media.discard(photoKeys);
      throw err;
    }
  }
}
