import mongoose, { Schema, Document, Types } from 'mongoose';
import UserModel from './UserSchema';
// Interface for the document
interface ISchedule extends Document {
      sent_date: Date,
      days: string[];                    // Array of days
      fallback: Types.ObjectId;           // Reference to user.relatives._id
      user: Types.ObjectId;
      content: string,// Reference to users schema
      contentType: string;               // Content type field
      platform: [{
            name: string,
            content_sent_id: string,
            status: string,
            seen_on: Date | null,
      }],
      triggered_range: number// Platform field
}
// Define the Schedule schema
const ArchiveModel: Schema = new Schema<ISchedule>({
      sent_date: {
            type: Date,                // Array of strings representing days
            default: null
      },
      contentType: {
            type: String
      },
      user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: UserModel,                   // Reference to the User schema
            required: true
      },
      content: {
            type: String,
      },
      platform: [{
            name: {
                  type: String,
            },
            content_sent_id: {
                  type: String,
            },
            status: {
                  type: String,
            },
            seen_on: {
                  type: Date,
                  default: null
            }
      }
      ],
      triggered_range: {
            type: Number,
            default: 0
      }
}, {
      timestamps: true //Add createdAt and updatedAt timestamps
});
// Create the model
const ArchiveSchema = mongoose.model<ISchedule>('Archive', ArchiveModel);
export default ArchiveSchema;
