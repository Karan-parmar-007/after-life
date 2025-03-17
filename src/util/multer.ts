import multer from "multer";
import sharp from "sharp";
import { Request, Response, NextFunction } from "express";

// Configure multer for memory storage
const storage = multer.memoryStorage();
const multerUpload = multer({
      storage: storage,
      limits: { fileSize: 100 * 1024 * 1024 },
});



// Function to convert image size
const optimizeMedia = async (req: Request, res: Response, next: NextFunction) => {
      if (req.file) {
            const mimeType = req.file.mimetype;
            try {
                  if (mimeType.startsWith("image/")) {
                        const compressedImage = await sharp(req.file.buffer)
                              .resize({ width: 1920, fit: "inside" })
                              .jpeg({ quality: 80 })
                              .toBuffer();

                        req.file.buffer = compressedImage;
                  }
                  next();
            } catch (error) {
                  return res.status(500).json({
                        success: false,
                        message: "Failed to optimize media.",
                        error: (error as Error).message,
                  }) as unknown as void
            }
      } else {
            next();
      }
};

export { multerUpload, optimizeMedia };


