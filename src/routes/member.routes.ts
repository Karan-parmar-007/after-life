import { Router } from "express";
import isAuthenticatedUser from "../middlewares/checkAuth";
import {
      addContent,
      addRelative,
      deleteContent,
      fallBackResponded,
      getAllRelatives,
      getContent,
      getContentForRelative,
      getRelativeById,
      updateContent
} from "../controllers/memeber.controllers";
import { multerUpload, optimizeMedia } from "../util/multer";
import { getStorageSize } from "../controllers/user.controllers";
import { verifyPassWord } from "../middlewares/verifyPassword";
import { checkStorage } from "../middlewares/checkStorage";
import { checkFreeUserRelativeLimit } from "../middlewares/checkNumberOfRelatives";

const memberRoutes = Router()

memberRoutes.put("/add-member", isAuthenticatedUser, multerUpload.single("relativeImg"), checkFreeUserRelativeLimit, optimizeMedia, addRelative)
memberRoutes.get("/all-members", isAuthenticatedUser, getAllRelatives)
memberRoutes.post("/add-content/:id", isAuthenticatedUser, multerUpload.single("file"), optimizeMedia, checkStorage, addContent)
memberRoutes.get("/get-content/:id", isAuthenticatedUser, getContent)
memberRoutes.delete("/delete-content", isAuthenticatedUser, verifyPassWord, deleteContent)
memberRoutes.get("/get-size", isAuthenticatedUser, getStorageSize)
memberRoutes.get("/delivery-response", fallBackResponded)
memberRoutes.get("/get-relative/:id", isAuthenticatedUser, getRelativeById)
memberRoutes.put("/update-content", isAuthenticatedUser, multerUpload.single("file"), optimizeMedia, checkStorage, updateContent)
memberRoutes.get("/final-content", getContentForRelative)

export default memberRoutes