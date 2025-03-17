import ArchiveSchema from "../schema/ArchiveSchema";
import ScheduleSchema from "../schema/ScheduleSchema";
import moment from "moment"
import contentGenerator from "../util/content_generator";
import { sendEmail } from "../util/Email.util";
import { sendUserContentToRelative } from "../util/getUserContent";
import mongoose from "mongoose";
import dotenv from "dotenv"
import SettingsSchema from "../schema/SettingsSchema";
import { getResponseHtmlForMail } from "../util/html";
import UserModel from "../schema/UserSchema";
import { handleNotification } from "../util/scheduler.utit";
dotenv.config();
mongoose.connect(process.env.mongo_uri as string)

const checkUserExpired = async () => {
      try {
            const notifications = await ScheduleSchema.aggregate([
                  {
                        $lookup: {
                              from: 'users', // The name of the collection you're looking up
                              localField: 'user', // The field from ScheduleSchema that links to users
                              foreignField: '_id', // The field from the users collection to match
                              as: 'user' // The name of the field to add in the output that will contain the user details
                        }
                  },
                  {
                        $unwind: {
                              path: '$user', // Unwind the userDetails array
                              preserveNullAndEmptyArrays: true // Optional: Keep documents without users
                        }
                  },
                  {
                        $match: {
                              'user.status': { $eq: 'active' } // Match only users with a status of "active"
                        }
                  },
                  {
                        $sort: {
                              'createdAt': 1 // Sort by 'createdAt' in ascending order (oldest first)
                        }
                  },
                  {
                        $group: {
                              _id: '$user._id', // Group by user ID to get one entry per user
                              oldestSchedule: { $first: "$$ROOT" } // Get the first (oldest) schedule for each user
                        }
                  },
                  {
                        $replaceRoot: { newRoot: '$oldestSchedule' } // Replace the root to return the schedule document
                  }
            ]);
            for (const notification of notifications) {
                  if (notification) {
                        const user = notification.user as any;
                        const allNotSeen = notification.platform.every((app: any) => app.status !== "seen");
                        if (allNotSeen) {
                              const sentDate = moment(notification.sent_date);
                              const currentDate = moment();
                              const daysSinceSent = currentDate.diff(sentDate, 'days');
                              notification.platform.map(async (app: { name: string; }) => {
                                    const joke = contentGenerator(notification.contentType, user?._id as string)
                                    const content = getResponseHtmlForMail(user?._id as string, app.name, joke)
                                    switch (true) {
                                          case daysSinceSent === 7:
                                                await handleNotification(user, notification, 1, app.name, content, joke)
                                                break;
                                          case daysSinceSent === 10:
                                                await handleNotification(user, notification, 2, app.name, content, joke)
                                                break;
                                          case daysSinceSent === 13:
                                                const setting = await SettingsSchema.findOne({ user: user._id })
                                                const fallBack = user.relative.filter((rel: any) => rel._id.toString() === setting?.fallBack?.toString());
                                                if (fallBack.length && app.name === "email") {
                                                      const html = getResponseHtmlForMail(user._id, app.name, `${user.name} is alive?`, notification._id as string, fallBack[0]._id as string)
                                                      await sendEmail(fallBack[0].email, `Check for ${user.name}`, html);
                                                }
                                                else {
                                                      console.log("no fallback")
                                                }
                                                break;
                                          case daysSinceSent === 15:
                                                const expiredUser = await UserModel.findByIdAndUpdate(user._id, { $set: { status: "expired" } }, { new: true })
                                                await sendUserContentToRelative(expiredUser)
                                                const notifications = await ScheduleSchema.find({ user: user._id })
                                                notifications.map(async (not) => {
                                                      await ArchiveSchema.create({
                                                            user: not.user,
                                                            sent_date: not.sent_date,
                                                            contentType: not.contentType,
                                                            content: not.content,
                                                            platform: not.platform,
                                                      });
                                                      await ScheduleSchema.findByIdAndDelete(not._id);
                                                })
                                                break;
                                    }
                              })

                        } else {
                              await ArchiveSchema.create({
                                    user: notification.user,
                                    sent_date: notification.sent_date,
                                    contentType: notification.contentType,
                                    content: notification.content,
                                    platform: notification.platform,
                              });
                              await ScheduleSchema.findByIdAndDelete(notification._id);
                        }
                  }
            }
      } catch (error) {
            console.error("Error processing notifications:", error);
      }
}
export default checkUserExpired


