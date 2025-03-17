import { Router } from "express"
import {
      login, getUserProfile, resetPassword, resetPasswordByPassword, sendOTp,
      sendResetLink, SignUp, updateBasicDetails, updateEmailAndContact, updateUserStatus, verifyOtp
} from "../controllers/user.controllers";
import { multerUpload, optimizeMedia } from "../util/multer";
import isAuthenticatedUser from "../middlewares/checkAuth";
import { verifyPassWord } from "../middlewares/verifyPassword";

const authRoutes = Router()

authRoutes.post("/signup", multerUpload.single("avatar"), optimizeMedia, SignUp);
authRoutes.post("/verify-otp", verifyOtp)
authRoutes.post("/send-otp", sendOTp)
authRoutes.post("/login", login)
authRoutes.get("/me", isAuthenticatedUser, getUserProfile)
authRoutes.put("/update-me", isAuthenticatedUser, multerUpload.single("newAvatar"), optimizeMedia, updateBasicDetails)
authRoutes.put("/update-email-contact", isAuthenticatedUser, verifyPassWord, updateEmailAndContact)
authRoutes.post("/request-reset-link", sendResetLink)
authRoutes.post("/reset-password", resetPassword)
authRoutes.put("/change-password", isAuthenticatedUser, verifyPassWord, resetPasswordByPassword)
authRoutes.put("/delete-account", isAuthenticatedUser, verifyPassWord, updateUserStatus)
export default authRoutes