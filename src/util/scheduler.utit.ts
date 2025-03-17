import ScheduleSchema from "../schema/ScheduleSchema";
import { sendEmail } from "./Email.util";

export const handleNotification = async (
      user: any,
      notification: any,
      newTriggeredRange: number,
      appName: string,
      content: string,
      joke: string
) => {
      try {
            const contentSentResponse = [];
            const sentResponse = await sendEmail(user?.email as string, notification.contentType, content);

            contentSentResponse.push({
                  name: appName,
                  content_sent_id: sentResponse.id as string,
                  status: "delivered"
            });

            // Create a new notification
            await ScheduleSchema.create({
                  sent_date: Date.now(),
                  contentType: notification.contentType,
                  content: joke,
                  user: user?._id,
                  platform: contentSentResponse
            });
      } catch (error) {
            console.log(error)
      }

}