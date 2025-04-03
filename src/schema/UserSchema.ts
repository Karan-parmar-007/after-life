import mongoose, { Schema, Model } from "mongoose";
import { IUser } from "../interfaces/User.interfaces";
import jwt from "jsonwebtoken"
import { getImageFromS3 } from "../util/S3.util";
import { bool } from "sharp";
import JwtSchema from "./JwtSchema";


interface IUserModel extends Model<IUser> {
  userExists(email: string, contact: string): Promise<IUser | null>;

}

const UserSchema: Schema<IUser> = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address.']
  },
  name: {
    type: String,
    required: true
  },
  premium: {
    type: Boolean,
    default: false
  },
  contact: {
    type: Number,
    required: true,
    match: [/^\d{12,13}$/, 'Please enter a valid contact number.']
  },
  dob: {
    type: Date,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  image: {
    Location: {
      type: String
    },
    key: {
      type: String
    },
    ETag: {
      type: String
    },
  },
  status: {
    type: String,
    default: "active"
  },
  relative: [
    {
      name: {
        type: String,
      },
      email: {
        type: String,
        match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address.']
      },
      relation: {
        type: String
      },
      contact: {
        type: Number,
        match: [/^\d{10}$/, 'Please enter a valid 10-digit contact number.']
      },
      relative_image: {
        Location: {
          type: String
        },
        key: {
          type: String
        },
        ETag: {
          type: String
        },
      },
      captions: [{
        key: {
          type: String
        },
        caption: {
          type: String
        }
      }],
      content: {
        type: String,
        default: ''
      },
      content_sent: {
        type: Boolean,
        default: false
      }
    }
  ], // Embedding relative schema
  storage_size: {
    type: Number,
    default: 100 // Default storage size in MB
  },
  password_reset_token: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});


UserSchema.methods.generateToken = async function (tokenSecret: string, type?: string): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + (7 * 24 * 60 * 60); // 7 days in seconds
  const token = jwt.sign(
    {
      user: {
        id: this._id,
      },
      type,
      iat, // Issued at time
      exp, // Expiration time
    },
    tokenSecret ?? "a-string-secret-at-least-256-bits-long",
    {
      algorithm: "HS256",
    }
  );

  // Check if a token already exists for this user
  let existingToken = await JwtSchema.findOne({ user_id: this._id });
  if (existingToken) {
    // Replace the existing token
    existingToken.jwt = token;
    await existingToken.save();
  } else {
    // Create a new token document
    await JwtSchema.create({
      jwt: token,
      user_id: this._id,
    });
  }

  return token;
};



// check user already exists or not
UserSchema.statics.userExists = async function (email: string, contact: string) {
  return await this.findOne({
    $or: [
      { email: email },
      { contact: contact }
    ]
  });
};


const UserModel = mongoose.model<IUser, IUserModel>('User', UserSchema);
export default UserModel;