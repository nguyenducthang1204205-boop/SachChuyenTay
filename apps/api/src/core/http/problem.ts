import { ERROR_CODES, type ErrorCode, type ProblemDetails } from "@sct/shared";
import type { ErrorRequestHandler, Request, RequestHandler, Response } from "express";
import { AppError, NotFoundError, ValidationError } from "../errors.js";
import type { Logger } from "../logger.js";

const PROBLEM_BASE = "https://sachchuyentay.vn/problems/";
const slug = (code: ErrorCode) => code.toLowerCase().replace(/_/g, "-");

type ProblemInput = Pick<ProblemDetails, "status" | "code" | "title" | "detail" | "errors"> & Record<string, unknown>;

function send(req: Request, res: Response, problem: ProblemInput) {
  const body = {
    type: PROBLEM_BASE + slug(problem.code),
    instance: req.originalUrl,
    requestId: String(req.id ?? ""),
    ...problem
  } satisfies ProblemDetails & Record<string, unknown>;
  res.status(problem.status).type("application/problem+json").json(body);
}

/** 404 cho route không tồn tại. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Không có endpoint ${req.method} ${req.path}.`));
};

/** Bộ xử lý lỗi tập trung: mọi lỗi → application/problem+json, không lộ stack trace ra ngoài. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err instanceof AppError) {
      if (err.status >= 500) logger.error({ err, reqId: req.id }, err.message);
      return send(req, res, {
        status: err.status,
        code: err.code,
        title: err.title,
        detail: err.message,
        ...(err instanceof ValidationError && { errors: err.errors }),
        ...err.extensions
      });
    }

    // Lỗi từ body-parser của Express (JSON hỏng, payload quá lớn)
    const type = (err as { type?: string } | null)?.type;
    if (type === "entity.parse.failed") {
      return send(req, res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        title: "Dữ liệu không hợp lệ",
        detail: "Body không phải JSON hợp lệ."
      });
    }
    if (type === "entity.too.large") {
      return send(req, res, {
        status: 413,
        code: ERROR_CODES.PAYLOAD_TOO_LARGE,
        title: "Dữ liệu quá lớn",
        detail: "Kích thước request vượt quá giới hạn cho phép."
      });
    }

    logger.error({ err, reqId: req.id }, "Unhandled error");
    return send(req, res, {
      status: 500,
      code: ERROR_CODES.INTERNAL,
      title: "Lỗi máy chủ",
      detail: "Đã có lỗi xảy ra. Vui lòng thử lại sau."
    });
  };
}
