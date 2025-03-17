import { Router } from "express";
import isAuthenticatedUser from "../middlewares/checkAuth";
import { createSchedule, getNotifications, getSchedule, userReplyChecker } from "../controllers/schedule.controller";

const scheduleRoutes = Router()

scheduleRoutes.post("/create-schedule", isAuthenticatedUser, createSchedule)
scheduleRoutes.put("/update/notification", userReplyChecker)
scheduleRoutes.get("/my-setting", isAuthenticatedUser, getSchedule)
scheduleRoutes.get("/get-notifications", isAuthenticatedUser, getNotifications)
export default scheduleRoutes