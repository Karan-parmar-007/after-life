import dotenv from 'dotenv';
import mongoose from 'mongoose';
import ScheduleSchema from '../schema/ScheduleSchema';
import SettingsSchema from '../schema/SettingsSchema';
import DateConversion from '../util/dateConversion.util';
import ArchiveSchema from '../schema/ArchiveSchema';
import { sendEmail } from '../util/Email.util';
import contentGenerator from '../util/content_generator';
import { getResponseHtmlForMail } from '../util/html';

dotenv.config();

mongoose.connect(process.env.mongo_uri as string)

const scheduler = async () => {
      try {
            const settings = await SettingsSchema.aggregate([
                  {
                        $lookup: {
                              from: 'users', // The name of the collection you're looking up
                              localField: 'user', // The field from ScheduleSchema
                              foreignField: '_id', // The field from the users collection
                              as: 'user' // The name of the field to add in the output
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
                              'user.status': { $eq: 'active' } // Match userDetails where status is not inactive
                        }
                  }
            ])
            settings.forEach(async (setting) => {
                  try {
                        const user = setting.user
                        const archive = await ArchiveSchema.findOne({ user: user._id })
                              .sort({
                                    sent_date: -1
                              })
                              .exec();
                        if (archive) {
                              if (DateConversion(archive?.sent_date as Date, setting.days as string)) {
                                    let content_sent_response: { name: any; content_sent_id: string; status: string; }[] = []
                                    const joke = contentGenerator(setting.contentType as string, (user?._id as string).toString() as string)
                                    await Promise.all(setting.platForms.map(async (app: any) => {
                                          if (app === "email") {
                                                const content = getResponseHtmlForMail(user?._id as string, app, joke)
                                                const sent_response = await sendEmail(user?.email as string, "jokes", content);
                                                content_sent_response.push({
                                                      name: app,
                                                      content_sent_id: sent_response.id as string,
                                                      status: "delivered"
                                                });
                                          }
                                    }));
                                    const notification = await ScheduleSchema.create({
                                          sent_date: Date.now(),
                                          contentType: setting.contentType,
                                          content: joke,
                                          user: user?._id,
                                          platform: content_sent_response

                                    })
                                    console.log(notification)
                              }
                        }
                        else {
                              console.log("no archive found")
                        }

                  } catch (error) {
                        console.log(error)
                  }
            })
      } catch (error) {
            console.error("Error in cron job: ", error);
      }
}

export default scheduler
