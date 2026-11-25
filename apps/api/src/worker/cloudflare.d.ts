/**
 * Khai báo tối thiểu cho các module/binding của Cloudflare Workers mà API dùng.
 * (Không dùng @cloudflare/workers-types vì xung đột với @types/node trong cùng tsconfig.)
 */
declare module "cloudflare:node" {
  /** Chuyển một Request của Workers tới server Node `http` đang `listen(port)` trong cùng isolate. */
  export function handleAsNodeRequest(port: number, request: Request): Promise<Response>;
}
