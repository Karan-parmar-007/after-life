import { NextFunction, Response, Request } from "express";
import jwt from "jsonwebtoken"
import moment from "moment";
import UserModel from "../schema/UserSchema";
import dotenv from "dotenv"
import { IUser } from "../interfaces/User.interfaces";
dotenv.config()
interface JwtPayload {
    id: {
        user: string,
        type: string
    };
    iat: number,
    exp: number,
}
declare global {
    namespace Express {
        interface Request {
            user?: IUser | null
        }
    }
}
const isAuthenticatedUser = async (req: Request, res: any, next: NextFunction) => {
    try {
        const token = req.headers?.authorization?.split(' ')[1] as String
        const decodeData = jwt.verify(token as string, process.env.JWT_SECRET ?? "") as JwtPayload
        const end = moment(new Date(decodeData.exp));
        const start = moment(new Date(decodeData.iat));
        const daysDifference = end.diff(start, 'days')
        if (!token || daysDifference <= 0) {
            return res.status(400).json({
                success: false,
                loggedIn: false,
                msg: "Please login ",
            })
        }
        req.user = await UserModel.findById(decodeData.id.user) as IUser
        next()
    } catch (error) {
        const errorMessage = (error as Error).message;
        return res.status(500).json({
            message: errorMessage
        })
    }
}
export default isAuthenticatedUser