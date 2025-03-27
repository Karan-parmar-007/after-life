import { NextFunction, Response, Request } from "express";
import jwt from "jsonwebtoken";
import moment from "moment";
import UserModel from "../schema/UserSchema";
import JwtSchema from "../schema/JwtSchema"; // Import the JWT model
import dotenv from "dotenv";
import { IUser } from "../interfaces/User.interfaces";
dotenv.config();

interface JwtPayload {
    user: {
        id: string,
    };
    type?: string;
    iat: number;
    exp?: number;
}

declare global {
    namespace Express {
        interface Request {
            user?: IUser | null;
        }
    }
}

const isAuthenticatedUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers?.authorization;
        if (!authHeader) {
            res.status(400).json({
                success: false,
                loggedIn: false,
                msg: "Authorization header missing. Please login."
            });
            return;
        }
        
        const token = authHeader.split(' ')[1] as string;
        if (!token) {
            res.status(400).json({
                success: false,
                loggedIn: false,
                msg: "Token missing. Please login."
            });
            return;
        }

        const decodeData = jwt.verify(token, process.env.JWT_SECRET ?? "") as JwtPayload;

        // Check if the JWT is present in the JwtSchema collection.
        const tokenRecord = await JwtSchema.findOne({ user_id: decodeData.user.id, jwt: token });
        if (!tokenRecord) {
            res.status(401).json({
                success: false,
                msg: "JWT invalid please login again"
            });
            return;
        }

        // Optional: Check token time difference if necessary
        if (decodeData.exp) {
            const end = moment(new Date(decodeData.exp * 1000));
            const start = moment(new Date(decodeData.iat * 1000));
            const daysDifference = end.diff(start, 'days');
            if (daysDifference <= 0) {
                res.status(400).json({
                    success: false,
                    loggedIn: false,
                    msg: "Please login"
                });
                return;
            }
        }

        req.user = await UserModel.findById(decodeData.user.id) as IUser;
        next();
    } catch (error) {
        const errorMessage = (error as Error).message;
        res.status(500).json({
            message: errorMessage
        });
        return;
    }
};

export default isAuthenticatedUser;
