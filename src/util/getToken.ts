import jwt from "jsonwebtoken"
import dotenv from "dotenv"
dotenv.config()

export const generateToken = (userId: string, iat: number, exp: number, type: string) => {
      return jwt.sign({
            id: {
                  user: userId,
                  type

            },
            iat,
            exp,
      },
            process.env.JWT_SECRET ?? "",
      )
}