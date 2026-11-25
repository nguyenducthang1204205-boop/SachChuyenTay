import { BUYBACK_PHOTO_LIMIT, COVER_IMAGE_MAX_BYTES, type AdminBook, type UploadedImage } from "@sct/shared";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLogger } from "../src/core/logger.js";
import { MemoryObjectStorage } from "../src/core/storage/memory-storage.js";
import { BuybackService } from "../src/modules/buyback/buyback.service.js";
import { MediaService } from "../src/modules/media/media.service.js";
import { API, createTestApp } from "./helpers.js";

/* ---------- Ảnh mẫu: chỉ cần đúng "magic bytes" ---------- */
const webp = (size = 64) => {
  const b = Buffer.alloc(size);
  b.write("RIFF", 0, "ascii");
  b.write("WEBPVP8 ", 8, "ascii");
  return b;
};
const png = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const dataUrl = (buf: Buffer, type = "image/webp") => `data:${type};base64,${buf.toString("base64")}`;

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let admin: ReturnType<typeof supertest.agent>;

beforeAll(async () => {
  ctx = await createTestApp();
  admin = supertest.agent(ctx.app);
  await admin
    .post(`${API}/admin/auth/login`)
    .send({ email: "admin@sachchuyentay.vn", password: "admin12345" })
    .expect(200);
});
afterAll(() => ctx.database.close());

const uploadCover = async (body: Buffer, type = "image/webp") =>
  (await admin.post(`${API}/admin/uploads/cover`).set("Content-Type", type).send(body).expect(201))
    .body as UploadedImage;

describe("Tải ảnh bìa (admin)", () => {
  it("lưu ảnh và phục vụ công khai với cache dài hạn", async () => {
    const image = webp(200);
    const up = await uploadCover(image);
    expect(up.url).toMatch(/^\/images\/covers\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/);
    expect(up).toMatchObject({ contentType: "image/webp", size: 200 });

    const res = await ctx.http.get(up.url).buffer(true).expect(200);
    expect(res.headers["content-type"]).toBe("image/webp");
    expect(res.headers["cache-control"]).toContain("immutable");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.compare(res.body as Buffer, image)).toBe(0);
  });

  it("nhận diện định dạng theo nội dung, không tin Content-Type", async () => {
    const up = await uploadCover(png(), "image/webp");
    expect(up.url.endsWith(".png")).toBe(true);
    const res = await admin
      .post(`${API}/admin/uploads/cover`)
      .set("Content-Type", "image/png")
      .send(Buffer.from("<svg onload=alert(1)>"))
      .expect(400);
    expect(res.body.errors[0].message).toMatch(/WEBP, JPEG hoặc PNG/);
  });

  it("từ chối khi chưa đăng nhập, sai loại nội dung hoặc quá lớn", async () => {
    await ctx.http.post(`${API}/admin/uploads/cover`).set("Content-Type", "image/webp").send(webp()).expect(401);
    await admin.post(`${API}/admin/uploads/cover`).set("Content-Type", "text/plain").send("hello").expect(400);
    const big = await admin
      .post(`${API}/admin/uploads/cover`)
      .set("Content-Type", "image/webp")
      .send(webp(COVER_IMAGE_MAX_BYTES + 1))
      .expect(413);
    expect(big.body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("không lộ ảnh khách gửi hay đường dẫn lạ qua /images", async () => {
    await ctx.http.get("/images/buyback/2026/01/00000000-0000-0000-0000-000000000000.webp").expect(404);
    await ctx.http.get("/images/covers/../../etc/passwd").expect(404);
    await ctx.http.get("/images/covers/khong-ton-tai.webp").expect(404);
  });

  it("thay ảnh bìa thì xoá ảnh cũ; xoá sách thì xoá ảnh", async () => {
    const first = await uploadCover(webp());
    const { body: book } = await admin
      .post(`${API}/admin/books`)
      .send({
        title: "Sách có ảnh bìa",
        author: "Tác giả",
        publisher: "NXB Trẻ",
        categoryId: "vhvn",
        conditionId: "good",
        price: 50_000,
        originalPrice: null,
        publishedYear: null,
        pages: null,
        stock: 1,
        cover: { from: "#112233", to: "#445566", ink: null, pattern: 0, imageUrl: first.url }
      })
      .expect(201);
    expect((book as AdminBook).cover.imageUrl).toBe(first.url);

    const second = await uploadCover(webp());
    await admin
      .patch(`${API}/admin/books/${book.id}`)
      .send({ cover: { ...book.cover, imageUrl: second.url } })
      .expect(200);
    await ctx.http.get(first.url).expect(404);
    await ctx.http.get(second.url).expect(200);

    await admin.delete(`${API}/admin/books/${book.id}`).expect(204);
    await ctx.http.get(second.url).expect(404);
  });

  it("chỉ chấp nhận URL ảnh http(s) hoặc ảnh đã tải lên", async () => {
    const { body } = await admin.get(`${API}/admin/books?pageSize=1`);
    const book = body.data[0] as AdminBook;
    for (const imageUrl of ["javascript:alert(1)", "/images/../admin", "data:image/png;base64,AAAA"]) {
      const res = await admin
        .patch(`${API}/admin/books/${book.id}`)
        .send({ cover: { ...book.cover, imageUrl } })
        .expect(400);
      expect(res.body.errors[0].path).toBe("body.cover.imageUrl");
    }
  });
});

describe("Ảnh khách gửi kèm yêu cầu thu mua", () => {
  const request = { name: "Trần Thị Bích", phone: "0912345678", bookList: "Nhà Giả Kim\nSapiens" };

  it("lưu ảnh, chỉ quản trị mới xem được", async () => {
    const res = await ctx.http
      .post(`${API}/buyback-requests`)
      .send({ ...request, photos: [dataUrl(webp()), dataUrl(png(), "image/png")] })
      .expect(201);
    expect(res.body).toMatchObject({ bookCount: 2, photoCount: 2 });

    const list = await admin.get(`${API}/admin/buyback-requests`).expect(200);
    const created = list.body.data.find((r: { reference: string }) => r.reference === res.body.reference);
    expect(created.photoKeys).toHaveLength(2);
    const key = created.photoKeys[0] as string;
    expect(key).toMatch(/^buyback\//);

    const img = await admin.get(`${API}/admin/media/${key}`).expect(200);
    expect(img.headers["content-type"]).toBe("image/webp");
    expect(img.headers["cache-control"]).toContain("private");
    await ctx.http.get(`${API}/admin/media/${key}`).expect(401);
  });

  it("vẫn gửi được khi không có ảnh", async () => {
    const res = await ctx.http.post(`${API}/buyback-requests`).send(request).expect(201);
    expect(res.body.photoCount).toBe(0);
  });

  it("báo lỗi đúng ảnh nào sai, và giới hạn số ảnh", async () => {
    const bad = await ctx.http
      .post(`${API}/buyback-requests`)
      .send({ ...request, photos: [dataUrl(webp()), dataUrl(Buffer.from("not an image"), "image/png")] })
      .expect(400);
    expect(bad.body.errors[0].path).toBe("body.photos.1");

    const tooMany = await ctx.http
      .post(`${API}/buyback-requests`)
      .send({ ...request, photos: Array.from({ length: BUYBACK_PHOTO_LIMIT + 1 }, () => dataUrl(webp())) })
      .expect(400);
    expect(tooMany.body.errors[0].path).toBe("body.photos");

    await ctx.http
      .post(`${API}/buyback-requests`)
      .send({ ...request, photos: ["data:text/html;base64,PHNjcmlwdD4="] })
      .expect(400);
  });

  it("không để lại ảnh mồ côi khi lưu yêu cầu thất bại", async () => {
    const storage = new MemoryObjectStorage();
    const logger = createLogger({ NODE_ENV: "test", LOG_LEVEL: "silent" });
    const failingRepo = {
      create: async () => {
        throw new Error("DB lỗi");
      }
    } as unknown as ConstructorParameters<typeof BuybackService>[0];
    const service = new BuybackService(failingRepo, new MediaService(storage, logger), logger);

    await expect(
      service.submit({
        ...request,
        city: "hcm",
        method: "sell",
        pickup: false,
        photos: [dataUrl(webp()), dataUrl(webp())]
      })
    ).rejects.toThrow("DB lỗi");
    expect(storage.objects.size).toBe(0);
  });
});
