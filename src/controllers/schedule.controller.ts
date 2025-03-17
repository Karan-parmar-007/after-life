import { Request, Response } from "express";
import SettingsSchema from "../schema/SettingsSchema";
import contentGenerator from "../util/content_generator";
import ScheduleSchema from "../schema/ScheduleSchema";
import { sendEmail } from "../util/Email.util";
import { getResponseHtmlForMail } from "../util/html";
import ArchiveSchema from "../schema/ArchiveSchema";

// CREATE A SETTING FOR TRIGGERS
export const createSchedule = async (req: Request, res: Response) => {
      try {
            const { days, fallback, contentType, platform } = req.body
            let setting
            const setting_exists = await SettingsSchema.findOne({ user: req.user?._id })
            if (setting_exists) {
                  setting = await SettingsSchema.findOneAndUpdate({ user: req.user?._id }, {
                        $set: {
                              user: req.user?._id,
                              contentType,
                              platForms: platform,
                              fallBack: fallback ? fallback : null,
                              days
                        }
                  }, { new: true })
            }
            else {
                  setting = await SettingsSchema.create({
                        user: req.user?._id,
                        contentType,
                        platForms: platform,
                        fallBack: fallback,
                        days

                  })
                  const joke = contentGenerator(contentType, req.user?._id as string)
                  let content_sent_response: Array<{ name: string; content_sent_id: string; status: string }> = [];
                  await Promise.all(platform.map(async (app: any) => {
                        if (app === "email") {
                              const content = getResponseHtmlForMail(req.user?._id as string, app, joke)
                              const sent_response = await sendEmail(req.user?.email as string, "jokes", content);
                              content_sent_response.push({
                                    name: app,
                                    content_sent_id: sent_response.id as string,
                                    status: "delivered"
                              });
                        }
                  }));
                  const notification = await ScheduleSchema.create({
                        sent_date: Date.now(),
                        contentType,
                        content: joke,
                        user: req.user?._id,
                        platform: content_sent_response

                  })
            }
            return res.status(201).json({
                  success: true,
                  setting,
            }) as unknown as void
      } catch (error) {
            return res.status(500).json({
                  success: false,
                  message: (error as Error).message,
            }) as unknown as void
      }
}

export const userReplyChecker = async (req: Request, res: any) => {
      try {
            const { user, notification, platform } = req.query
            const updateNotification = await ScheduleSchema.findOneAndUpdate(
                  {
                        user,  // Find based on user
                        _id: notification,  // Find the document by ID
                        "platform.name": platform  // Find the specific platform with the name 
                  },
                  {
                        $set: {
                              "platform.$.status": "seen",
                              "platform.$.seen_on": Date.now() // Update the status of the matched platform
                        }
                  },
                  { new: true }  // Return the updated document
            );
            console.log(updateNotification)
            return res.status(200).json({
                  success: true,
                  updateNotification
            })

      } catch (error) {
            return res.status(500).json({
                  success: false,
                  message: (error as Error).message
            })
      }
}
// GET SETTINGS OF USER
export const getSchedule = async (req: Request, res: Response) => {
      try {
            const setting = await SettingsSchema.findOne({ user: req?.user?._id })
            return res.status(200).json({
                  success: true,
                  setting
            }) as unknown as void
      } catch (error) {
            return res.status(500).json({
                  success: false,
                  message: (error as Error).message
            }) as unknown as void
      }
}

// GET NOTIFICATONS FOR LOGGED USER
export const getNotifications = async (req: Request, res: Response) => {
      try {
            const notifications = await ArchiveSchema.aggregate([
                  // Match archives where user matches and at least one platform has status 'seen'
                  {
                        $match: {
                              user: req.user?._id,
                              "platform.status": "seen"
                        }
                  },
                  // Unwind the platform array to process each platform individually
                  {
                        $unwind: "$platform"
                  },
                  // Match again to ensure we only get platforms with 'seen' status
                  {
                        $match: {
                              "platform.status": "seen"
                        }
                  },
                  // Project the fields we want
                  {
                        $project: {
                              seen_on: "$platform.seen_on",
                              notification: {
                                    $concat: ["Responded on ", "$platform.name"]
                              }
                        }
                  }
            ]);

            return res.status(200).json({
                  success: true,
                  notifications,
            }) as unknown as void;
      } catch (error) {
            return res.status(500).json({
                  success: false,
                  error: (error as Error).message
            }) as unknown as void
      }
}