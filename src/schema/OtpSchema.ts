import mongoose, { Schema, Document } from 'mongoose';

export interface IOtp extends Document {
    hashed_otp: string;
    number_of_time_asked: number;
    date_time_when_otp_was_created: Date;
    expires_in: Date;
    user_id: string | number;
    retry_interval: Date | null;
}

const OtpSchema: Schema = new Schema<IOtp>({
    hashed_otp: {
        type: String,
        required: true
    },
    number_of_time_asked: {
        type: Number,
        default: 0
    },
    date_time_when_otp_was_created: {
        type: Date,
        default: Date.now,
        required: true
    },
    expires_in: {
        type: Date,
        required: true,
    },
    user_id: {
        type: String || Number || mongoose.Types.ObjectId,
        required: true
    },
    retry_interval: {
        type: Date,
        default: null
    },
}, {
    timestamps: true
});

// TTL index on `updatedAt` field: document expires 30 minutes (1800 seconds) after last modification.
OtpSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 1800 });

const OtpModel = mongoose.model<IOtp>('Otp', OtpSchema);
export default OtpModel;
