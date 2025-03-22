import { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt"
export const verifyPassWord = async (req: Request, res: any, next: NextFunction) => {
      try {
            const password = req.body?.password || req.query?.password || req.params?.password;
            console.log(password)
            if (!password) {
                  return res.status(406).json({
                        success: false,
                        message: 'password required'
                  })
            }
            const isMatch = await bcrypt.compare(password as string, req.user?.password as string)
            if (!isMatch) {
                  return res.status(406).json({
                        success: false,
                        message: 'incorrect password'
                  })
            }
            next()
      } catch (error) {
            return res.status(500).json({
                  success: false,
                  message: (error as Error).message
            })
      }
}