import express from "express";
import multer from "multer";

export function errorHandler(
  err: unknown,
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (err instanceof multer.MulterError) {

    const mutlerError = err as { code?: string; message?: string };

    if (mutlerError.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Image is too large. Maximum size is 1 MB." });
      return;
    }
    res.status(400).json({ error: mutlerError.message ?? "Upload failed." });
    return;
  }

  if (err instanceof Error && err.message === "INVALID_FILE_TYPE") {
    res.status(415).json({ error: "Only PNG, JPEG, WebP, or GIF images are allowed." });
    return;
  }

  next(err);
}