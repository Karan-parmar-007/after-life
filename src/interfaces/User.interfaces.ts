import { Document, ObjectId, Schema } from "mongoose";
//+
interface captions {
    caption: string,
    key: string
}//+

export interface IRelative {
    toObject(): unknown;
    contentData: { type: string | undefined; key: string | undefined; size: number | undefined; lastModified: Date | undefined; base64: string | undefined; }[];
    _id: Schema.Types.ObjectId,
    name: string;
    email?: string;
    relation: string;
    contact?: string;
    captions: captions[],
    relative_image?: {
        Location: string;
        key: string;
        ETag: string;
    };
    content: string;
    content_sent: boolean
}

export interface IUser extends Document {
    email: string; // Fixed: changed 'email' type to 'string'//+
    name: string;
    premium: boolean;
    contact: number;
    dob: Date;
    password: string;
    image: {
        Location: string,
        ETag: string,
        key: string
    };
    status?: string;
    email_verified: boolean,
    contact_verified: boolean,
    storage_size: number,
    relative?: IRelative[]; // You may want to specify the exact type of relative if known
    generateTokens: () => string;
    days: string,
    fallback: ObjectId,
    contentType: string,
    platform: string,
    settings_created_at: Date | null,
    password_reset_token: string | null
}
// {"conversationId":"28770727-3d0f-4d66-87a4-59b0f9adcdce","source":"instruct"}
