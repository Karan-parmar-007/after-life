import dotenv from "dotenv";
dotenv.config(); // Load environment variables at the start

import express, { Request, Response } from "express";
import authRoutes from "./routes/auth.routes";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import memberRoutes from "./routes/member.routes";
import scheduleRoutes from "./routes/schedule.routes";
import path from "path";
import chalk from "chalk";
import cron from "node-cron";
import scheduler from "./jobs/scheduler";
import checkUserExpired from "./jobs/checkUserExpired";

const app = express();
const port = 8080;

// Debug: Check if .env variables are loaded
console.log("Loaded MONGO_URI:", process.env.MONGO_URI);

// Ensure MongoDB URI is available
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error(chalk.red("MongoDB URI is missing! Check your .env file."));
  process.exit(1); // Exit process if no database URI
}

// Middleware
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(bodyParser.json());

// Health Check Route
app.get("/", (req: Request, res: Response) => {
  res.json({ msg: "Server running" });
});


// API Routes
app.use("/api/v1", authRoutes);
app.use("/api/v1", memberRoutes);
app.use("/api/v1", scheduleRoutes);

// Cron Jobs (Uncomment if needed)
scheduler();
checkUserExpired();

// Schedule the cron job to run every day at 12:00 AM
cron.schedule("0 0 * * *", () => {
    console.log("Running scheduled tasks at 12:00 AM...");
    scheduler();
    checkUserExpired();
});

// Database Connection
mongoose
  .connect(MONGO_URI as string)
  .then((res) => {
    console.log(chalk.bold.bgCyan(`\nDatabase connected at ${chalk.blue(res.connection.host)}`));
    app.listen(port, "0.0.0.0", () => {
      console.log(chalk.bold.bgYellowBright(chalk.white(`\nServer running at port ${chalk.red(port)}`)));
    });
  })
  .catch((err) => {
    console.error("Database connection error:", err);
  });
