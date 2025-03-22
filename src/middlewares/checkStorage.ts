import { NextFunction, Request, Response } from "express";
import { getFolderSize, getImageFromS3 } from "../util/S3.util";
import UserModel from "../schema/UserSchema";

export const checkStorage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userSize = await UserModel.findById(req?.user?._id).lean();
        const file = req.file;
        const deleteFileData = await getImageFromS3(req.query.key as string, "test-after-life");

        if (file) {
            const fileSize = parseFloat((file.size / (1024 * 1024)).toFixed(2)); // Convert bytes to MB
            const results = await Promise.all(
                (req?.user?.relative || []).map(async (el) => {
                    const folderSize = await getFolderSize(
                        "test-after-life",
                        `${req?.user?._id}/${el?._id.toString()}`
                    );
                    return folderSize;
                })
            );
            const bucketSize = parseFloat((results[0].size / (1024 * 1024)).toFixed(2)); // Convert bytes to MB

            // Convert deleteFileData.size from bytes to MB, default to 0 if null
            const deleteFileSizeMB = deleteFileData
                ? parseFloat((deleteFileData.size / (1024 * 1024)).toFixed(2))
                : 0;

            const available_size = userSize?.storage_size
                ? ((userSize.storage_size - bucketSize) + deleteFileSizeMB).toFixed(2)
                : "0";

            if (fileSize > parseFloat(available_size)) {
                return res.status(400).json({
                    success: false,
                    message: `Your file size is ${fileSize} MB\nYour available size is ${available_size} MB left to upload media`,
                }) as unknown as void;
            } else {
                next();
            }
        }
        if (!file && req.body.caption) {
            return next();
        }
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: (error as Error).message,
        }) as unknown as void;
    }
};