import { Schema, model } from "mongoose";

const SettingsModel = new Schema({
      days: {
            type: Number
      },
      contentType: {
            type: String
      },
      platForms: [
            {
                  type: String
            }
      ],
      fallBack: {
            type: Schema.ObjectId,
            default: null
      },
      user: {
            type: Schema.ObjectId
      }
}, {
      timestamps: true
})

const SettingsSchema = model("Settings", SettingsModel)
export default SettingsSchema