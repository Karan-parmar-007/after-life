import mongoose, { Schema, Model } from "mongoose";
import { IUser } from "../interfaces/User.interfaces";
import jwt from "jsonwebtoken"
import { getImageFromS3 } from "../util/S3.util";
import { bool } from "sharp";


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
    default: 50
  },
  password_reset_token: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});


UserSchema.methods.generateTokens = function () {
  return jwt.sign({
    id: this._id
  },
    process.env.JWT_SECRET ?? ""
  )
}
// check user already exists or not
UserSchema.statics.userExists = async function (email: string, contact: string) {
  return await this.findOne({
    $or: [
      { email: email },
      { contact: contact }
    ]
  });
};
// Pre-save hook to hash the password
// UserSchema.pre<IUser>('save', async function (next) {
//   console.log(this.isModified("password"))
//   if (!this.isModified('password')) return next(); // Only hash the password if it has been modified (or is new)
//   try {
//     const salt = await bcrypt.genSalt(10); // Generate salt
//     this.password = await bcrypt.hash(this.password, salt); // Hash the password
//     next(); // Proceed to save the document
//   } catch (error: any) {
//     next(error); // Pass errors to the next middleware
//   }
// });

const UserModel = mongoose.model<IUser, IUserModel>('User', UserSchema);
export default UserModel;