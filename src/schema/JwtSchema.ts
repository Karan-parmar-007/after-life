import mongoose, { Schema, Document } from 'mongoose';

export interface IOtp extends Document {
    jwt: string;
    user_id: mongoose.Types.ObjectId;
}

const JwtSchema: Schema = new Schema<IOtp>({
    jwt: {
        type: String,
        required: true,
    },
    
    user_id: {
        type: mongoose.Schema.Types.ObjectId, // Corrected this line
        required: true, // It's a good practice to specify if this field is required
    },
    
}, {
    timestamps: true
});

const OtpModel = mongoose.model<IOtp>('Jwt', JwtSchema);
export default OtpModel;