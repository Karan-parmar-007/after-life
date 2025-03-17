// middlewares/checkFreeUserRelativeLimit.ts
import { Request, Response, NextFunction } from "express";
import UserModel from "../schema/UserSchema";

export const checkFreeUserRelativeLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Retrieve the user from the database.
    const user = await UserModel.findById(req.user?._id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found.",
      });
      return
    }

    // Check if the request is from a free user.
    if (req.body.userType && req.body.userType.toLowerCase() === "free") {
      // If we're adding a new relative (no query id indicates update), then enforce the limit.
      if (!req.query.id && Array.isArray(user.relative) && user.relative.length >= 3) {
        res.status(403).json({
          success: false,
          message: "Free users can only add up to 3 relatives.",
        });
        return
      }
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error during relative count check.",
      error: (error as Error).message,
    });
    return
  }
};
