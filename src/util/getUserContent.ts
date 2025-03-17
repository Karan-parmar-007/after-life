import { IRelative, IUser } from "../interfaces/User.interfaces";
import UserModel from "../schema/UserSchema";
import { sendEmail } from "./Email.util";
import { getImageFromS3, getUserRelativeData } from "./S3.util";
export const sendUserContentToRelative = async (user: any) => {
      await Promise.all(user.relative.map(async (rel: any) => {
            const link = `${process.env.MESSAGE_URL}/viewmessages?userId=${user._id}&relativeId=${rel._id}`
            await sendEmail(rel.email, "Final Goodbye", link);
            return await UserModel.findOneAndUpdate({ _id: user._id, "relative._id": rel._id }, {
                  $set: {
                        "relative.$.content_sent": true,
                  }
            })
      }));
}
export const getContent = async (userId: string, relativeId: string) => {
      try {
            const user = await UserModel.findOne(
                  { _id: userId, "relative._id": relativeId },
                  { "relative.$": 1, name: 1 } // Projection to return only the matched relative
            ).lean() as IUser
            const data = await getUserRelativeData(relativeId as string, userId as string)
            const relative = await user.relative?.filter((rel) => rel._id.toString() === relativeId)[0] as IRelative

            const relativeImageBase64 = await getImageFromS3(relative.relative_image?.key as string, "relativesimg");
            return {
                  success: true,
                  data: {
                        user: user.name,
                        relative: {
                              relativeImageBase64,
                              ...relative
                        },
                        content: data
                  }
            }
      } catch (error) {
            return
      }
}