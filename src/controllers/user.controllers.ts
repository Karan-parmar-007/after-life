import { Request, Response } from 'express';
import UserSchema from "../schema/UserSchema";
import { hashOtp, verifyHash } from "../util/otp";
import { checkInputType } from "../util/validContactOrEmail";
import { IUser } from "../interfaces/User.interfaces";
import { generateToken } from "../util/getToken";
import { deleteFileFromS3, getFolderSize, getImageFromS3, s3Uploader } from "../util/S3.util";
import { sendEmail } from '../util/Email.util';
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"
import UserModel from '../schema/UserSchema';
import { console } from 'inspector';
import OtpModel from '../schema/OtpSchema';


export interface MulterFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
    destination?: string; // optional
    filename?: string;    // optional
    path?: string;        // optional
}

// Augment the Express Request type to include `file`
export const sendOtp = async (req: Request, res: Response) => {
    try {
        const { field } = req.body;

        // Validate input
        if (!field) {
            res.status(400).json({
                success: false,
                message: "Field is required",
            });
            return;
        }

        // Function to determine if input is email or phone
        const checkInputType = (input: string): "email" | "contact" | "invalid" => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const phoneRegex = /^\d{10,15}$/;

            if (emailRegex.test(input)) return "email";
            if (phoneRegex.test(input)) return "contact";
            return "invalid";
        };

        const inputType = checkInputType(field);

        if (inputType === "invalid") {
            res.status(400).json({
                success: false,
                message: "Invalid input. Please enter a valid email or phone number",
            });
            return;
        }

        // Check if user exists in the system
        let userExists;
        if (inputType === "email") {
            userExists = await UserSchema.findOne({ email: field });
        } else if (inputType === "contact") {
            userExists = await UserSchema.findOne({ contact: field });
        }

        if (userExists && userExists.status === "inactive") {
            res.status(400).json({
                success: false,
                message: `Account associated with ${field} is not active. Please contact support.`,
            });
            return;
        }

        // Generate OTP and hash it
        const otp = Math.floor(1000 + Math.random() * 9000);
        const hashResponse = await hashOtp(otp, field);
        const hashed_otp = hashResponse.fullhash;
        const now = new Date();

        // Check for existing OTP entry
        let otpEntry = await OtpModel.findOne({ user_id: field });

        if (otpEntry) {
            // Prevent spam by enforcing a 30-second cooldown
            const timeSinceLastOtp = (now.getTime() - otpEntry.date_time_when_otp_was_created.getTime()) / 1000;

            if (timeSinceLastOtp < 30) {
                res.status(429).json({
                    success: false,
                    message: "Must wait 30 seconds before trying again",
                });
                return;
            }

            // Handle excessive retries (max 4 attempts)
            if (otpEntry.number_of_time_asked >= 4) {
                if (!otpEntry.retry_interval) {
                    otpEntry.retry_interval = new Date(now.getTime() + 15 * 60 * 1000); // 15-minute cooldown
                    await otpEntry.save();
                    res.status(429).json({
                        success: false,
                        message: "Try again after 15 minutes",
                    });
                    return;
                }

                if (otpEntry.retry_interval > now) {
                    const timeLeft = Math.ceil((otpEntry.retry_interval.getTime() - now.getTime()) / 1000);
                    res.status(429).json({
                        success: false,
                        message: `Try again after ${timeLeft} seconds`,
                    });
                    return;
                }

                // Reset after cooldown period
                otpEntry.number_of_time_asked = 0;
                otpEntry.retry_interval = null;
            }

            // Update existing OTP entry
            otpEntry.hashed_otp = hashed_otp;
            otpEntry.number_of_time_asked += 1;
            otpEntry.date_time_when_otp_was_created = now;
            otpEntry.expires_in = new Date(now.getTime() + 2 * 60 * 1000); // 30-minute expiration
            await otpEntry.save();
        } else {
            // Create new OTP entry
            await OtpModel.create({
                hashed_otp: hashed_otp,
                number_of_time_asked: 1,
                date_time_when_otp_was_created: now,
                expires_in: new Date(now.getTime() + 2 * 60 * 1000), // 30-minute expiration
                user_id: field,
                retry_interval: null,
            });
        }

        // Send OTP based on input type
        if (inputType === "email") {
            await sendEmail(field, "Verify OTP", `Your OTP is: ${otp}`);
        } else if (inputType === "contact") {
            // await sendSms(field, `Your OTP is: ${otp}`);
        }

        res.status(200).json({
            message: userExists ? "User exists" : "User doesn't exist",
            success: true,
            otp: otp,
        });
        return;
    } catch (error) {
        console.error("Error sending OTP:", error);
        res.status(500).json({
            success: false,
            error: (error as Error).message || "Internal Server Error",
        });
        return;
    }
};




export const SignUp = async (req: Request, res: Response) => {
    try {
        const { email, contact } = req.body;
        const avatar = req.file
        // check for existing users

        const userExists = await UserSchema.userExists(email, contact);
        if (userExists) {
            if (userExists.status === "inactive") {
                res.status(400).json({
                    success: false,
                    message: `account associated with ${email} is not active. please contact us`
                })
                return 
            }
            res.status(409).json({
                message: "Email or contact number already exists",
                success: false,
            })
            return 
        }

        let imageResponse;
        if (avatar) {
            imageResponse = await s3Uploader(avatar, process.env.S3_BUCKET_NAME as string, "avatar", "userimage");
            if (imageResponse.error) {
                res.status(500).json({
                    message: "Error uploading image to S3",
                    success: false,
                    error: imageResponse.error,
                })
                return 
            }
        }

        const salt = await bcrypt.genSalt(10); // Generate salt
        const password = await bcrypt.hash(req.body.password, salt); //
        const user = await UserSchema.create({
            ...req.body,
            password,
            image: {
                ETag: imageResponse?.succesResponse?.ETag,
                key: imageResponse?.succesResponse?.Key,
                Location: imageResponse?.succesResponse?.Location
            }
        })
        const token=user.generateToken(process.env.JWT_SECRET as string)

        res.status(201).json({
            message: "User Created Successfully",
            token,
            user: user,
            success: true,
        })
        return 
    } catch (error) {
        console.log(error)
        const errorMessage = (error as Error).message;
        res.status(500).json({
            success: false,
            error: errorMessage,
        })
        return 
    }
};

export const verifyOtp = async (req: Request, res: Response) => {
    try {
        const { otp, field, type } = req.body;

        // Validate request body
        for (const [key, value] of Object.entries(req.body)) {
            if (value === undefined || value === null) {
                res.status(400).json({
                    success: false,
                    message: `${key} has value ${value}`
                });
                return 
            }
        }

        console.log(otp, field, type)

        // Check if user exists
        let user;
        const inputType = checkInputTypeValid(field); // Define checkInputType once globally
        if (type === "login") {
            if (inputType === "email") {
                user = await UserSchema.findOne({ email: field });
            } else if (inputType === "contact") {
                user = await UserSchema.findOne({ contact: field });
            }
        }

        // OTP verification
        const resp = await verifyHash(field, otp as number);

        console.log(resp.verified)

        // If OTP bypass for contact numbers (if that’s desired)
        if (inputType === "contact" && otp === 1234) {
            resp.verified = true;
        }

        if (!resp.verified) {
            res.status(400).json({
                success: false,
                message: resp.err || `Incorrect Otp`
            });
            return;
        }
        

        await OtpModel.deleteOne({ user_id: field });

        // If OTP verified, check user existence and respond accordingly
        if (type === "login") {
            if (!user) {
                res.status(404).json({
                    success: false,
                    message: "User not present in the database",
                });
                return 
            }

            const token = await user.generateToken(process.env.JWT_SECRET as string, "login");

            let userImageBase64 = user?.image?.key
                ? await getImageFromS3(user.image.key, process.env.S3_BUCKET_NAME as string)
                : null;
            
            res.status(200).json({
                success: true,
                message: `Verified Success`,
                token,
                user: {
                    ...user.toJSON(),
                    userImageBase64
                }
            });
            return 
        } else {
            // For non-login cases, simply return success message
            res.status(200).json({
                success: true,
                message: `Verified Success`
            });
            return 
        }
    } catch (error) {
        const errorMessage = (error as Error).message;
        res.status(500).json({
            success: false,
            error: errorMessage,
        });
        return 
    }
};

// Define checkInputType globally so that it’s available everywhere
const checkInputTypeValid = (input: string): "email" | "contact" | "invalid" => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\d{10,15}$/;
    
    if (emailRegex.test(input)) return "email";
    if (phoneRegex.test(input)) return "contact";
    return "invalid";
};


export const login = async (req: Request, res: Response) => {
    try {
        const { field, password } = req.body
        const checkInputType = (input: string): "email" | "contact" | "invalid" => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Basic email format check
            const phoneRegex = /^\d{10,15}$/; // Allows 10-15 digit phone numbers

            if (emailRegex.test(input)) return "email";
            if (phoneRegex.test(input)) return "contact";
            return "invalid";
        };

        const inputType = checkInputType(field);

        if (inputType === "invalid") {
            res.status(400).json({
                success: false,
                message: "Invalid input. Please enter a valid email or phone number",
            });
            return
        }

        let user
        if (inputType === "email") {
            user = await UserSchema.findOne({ email: field });
        } else if (inputType === "contact") {
            user = await UserSchema.findOne({ contact: field });
        }

        if (!user) {
            res.status(404).json({
                message: "user not found",
                success: false
            }) 
            return 
        }
        if (password) {
            const isMatch = await bcrypt.compare(password, user.password)
            if (isMatch) {
                let userImageBase64 = user?.image?.key ? await getImageFromS3(user.image.key, process.env.S3_BUCKET_NAME as string) : null
                const token=await user.generateToken(process.env.JWT_SECRET as string)
                res.status(200).json({
                    success: true,
                    message: `Verified Success`,
                    token,
                    user: {
                        ...user,
                        userImageBase64
                    }
                })
                return 
            }
            else {
                res.status(406).json({
                    success: false,
                    message: "password not matched"
                })
                return
            }
        }
        const otp = Math.floor(1000 + Math.random() * 9000)
        switch (checkInputType(field)) {
            case "email":
                const otp = Math.floor(1000 + Math.random() * 9000);
                const emailHashResponse = await hashOtp(otp, field);
                const templateData = {
                    templateId: 2,
                    params: {
                        "FIRSTNAME": user.name,
                        "SMS": otp // Use the generated OTP
                    },
                };
                await sendEmail(field, 'Verify OTP', undefined, undefined, templateData);
                res.status(200).json({
                    message: "Otp Sent Successfully",
                    hash: emailHashResponse.fullhash,
                    success: true,
                });
                return 
            case "contact":
                const contactOtp = Math.floor(1000 + Math.random() * 9000);
                const contactHashResponse = await hashOtp(contactOtp, field);
                // Implement SMS sending logic here
                res.status(200).json({
                    message: "Otp Sent Successfully",
                    hash: contactHashResponse.fullhash,
                    success: true,
                });
                return 
            default:
                res.status(400).json({
                    success: false,
                    message: "Invalid field type",
                })
                return 
        }
    } catch (error) {
        const errorMessage = (error as Error).message;
        res.status(500).json({
            success: false,
            error: errorMessage,
        })
        return 
    }
}

export const getUserProfile = async (req: Request, res: Response) => {
    try {
        let userImage
        const { user } = req
        if (user?.image.key) {
            userImage = await getImageFromS3(user.image.key, process.env.S3_BUCKET_NAME as string);
        }
        res.status(200).json({
            success: true,
            data: {
                ...user?.toObject(),
                userImageBase64: userImage
            }
        })
        return 
    } catch (error) {
        console.log(error)
        const errorMessage = (error as Error).message;
        res.status(500).json({
            success: false,
            error: errorMessage,
        })
        return 
    }
}

export const updateBasicDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const { file: newAvatar, user: currentUser } = req;
        let updateFields: any = { ...req.body };
        
        // Check if email or contact is being updated
        if (updateFields.email && updateFields.email !== currentUser?.email) {
            // Check if email already exists for another user
            const existingEmailUser = await UserModel.findOne({ 
                _id: { $ne: currentUser?._id }, 
                email: updateFields.email 
            });
            
            if (existingEmailUser) {
                res.status(400).json({
                    message: 'Email already in use by another user',
                    success: false,
                })
                return 
            }
        }
        
        if (updateFields.contact && updateFields.contact !== currentUser?.contact) {
            // Check if contact already exists for another user
            const existingContactUser = await UserModel.findOne({ 
                _id: { $ne: currentUser?._id }, 
                contact: updateFields.contact 
            });
            
            if (existingContactUser) {
                res.status(400).json({
                    message: 'Contact number already in use by another user',
                    success: false,
                })
                return 
            }
        }

        // Handle image upload if a new avatar is provided
        if (newAvatar) {
            // First delete the old image if it exists
            if (currentUser?.image?.key) {
                const deleteResult = await deleteFileFromS3(
                    process.env.S3_BUCKET_NAME as string, 
                    currentUser.image.key
                );
                
                if (deleteResult.error) {
                    console.log("Warning: Failed to delete previous avatar:", deleteResult.error);
                    // Continue despite failure to delete, but log the error
                } else {
                    console.log("Old avatar deleted from S3");
                }
            }
            
            // Upload the new avatar
            const { succesResponse, error } = await s3Uploader(
                newAvatar, 
                process.env.S3_BUCKET_NAME as string,
                "avatar",
                "userimage"
            );
            
            if (error) {
                res.status(500).json({
                    message: `Error uploading new avatar: ${error}`,
                    success: false,
                }) 
                return 
            }

            updateFields.image = {
                Location: succesResponse?.Location,
                key: succesResponse?.Key,
                ETag: succesResponse?.ETag,
            };
        }

        // Update user in database
        const user = await UserModel.findByIdAndUpdate(
            currentUser?._id, 
            updateFields, 
            { new: true }
        );
        
        if (!user) {
            res.status(404).json({
                message: 'User not found',
                success: false,
            })
            return 
        }

        res.status(200).json({
            message: 'User details updated successfully',
            success: true,
            user
        })
        return 
    } catch (error) {
        console.error("Error updating user details:", error);
        res.status(500).json({
            message: 'Internal server error',
            error: (error as Error).message || error,
            success: false,
        })
        return 
    }
};

export const updateEmailAndContact = async (req: Request, res: Response) => {
    try {
        const { user: currentUser } = req;
        const updatedUser = await UserModel.findByIdAndUpdate(
            currentUser?._id,
            { $set: req.body },
            { new: true }
        )
        res.status(200).json({
            success: true,
            user: updatedUser,
        })
        return 

    } catch (error) {
    res.status(500).json({
            success: false,
            error: (error as Error).message,
        })
        return 
    }
};

// export const updateProfile = async (req: Request, res: any) => {
//     try {
//         const newAvatar = req.file
//         let user
//         if (newAvatar) {
//             const { succesResponse, error } = await s3Uploader(newAvatar, process.env.S3_BUCKET_NAME as string)
//             if (req.user?.image) {
//                 await deleteFileFromS3(process.env.S3_BUCKET_NAME as string, req.user?.image?.key)
//                 console.log("deleted")
//             }
//             user = await UserModel.findByIdAndUpdate(req.user?._id, {
//                 $set: {
//                     image: {
//                         Location: succesResponse.Location,
//                         key: succesResponse.key,
//                         ETag: succesResponse.ETag
//                     }
//                 }
//             }, { new: true })
//             if (error) {
//                 return res.status(500).json({
//                     message: error,
//                     success: false,
//                 });
//             }
//         }
//         user = await UserModel.findByIdAndUpdate(req.user?._id, {
//             $set: {
//                 ...req.body
//             }
//         }, { new: true })

//         return res.status(200).json({
//             success: true,
//             user
//         })


//     } catch (error) {
//         const errorMessage = (error as Error).message;
//         return res.status(500).json({
//             success: false,
//             error: errorMessage,
//         });
//     }
// }
export const getStorageSize = async (req: Request, res: Response) => {
    try {
        let size = 0
        let totalContent = 0
        const results = await Promise.all(
            (req?.user?.relative || []).map(async (el) => {
                const folderSize = await getFolderSize("test-after-life", `${req.user?._id}/${el?._id.toString()}`);
                console.log(folderSize)
                return folderSize; // Return the folder size and error for this relative
            })
        );
        for (const result of results) {
            if (result.error) {
                // Return the error if one occurred during the folder size calculation
                res.status(400).json({
                    success: false,
                    error: result.error,
                })
                return 
            }
            // Accumulate the folder sizes
            size += result.size;
            totalContent += result.content
        }
        // Convert total size to megabytes (MB) and round it down
        const sizeInMB = (size / (1024 * 1024)).toFixed(2);
        const user_storage_size = req.user?.storage_size as number
        // Send response after all folder sizes are calculated
        res.status(200).json({
            success: true,
            totalSize: user_storage_size,// Return the size in MB as an integer
            used_size: parseFloat(sizeInMB),
            available_size: user_storage_size - parseFloat(sizeInMB),
            totalContent
        })
        return 
    } catch (error) {
        res.status(500).json({
            success: false,
            error: (error as Error).message,
        })
        return 
    }
}

export const sendResetLink = async (req: Request, res: Response) => {
    try {
        const { email } = req.body
        const user = await UserSchema.findOne({ email, status: "active" })
        if (!user) {
            res.status(404).json({
                success: false,
                message: `account associated with ${email} not found`
            })
            return 
        }
        const iat = Date.now()// Current time in seconds (issued at time
        const exp = iat + 4 * 60 * 1000;
        const token = generateToken(user?._id as string, iat, exp, "reset")
        user.password_reset_token = token
        await user.save()
        const resetURl = `${process.env.FRONTEND_URL}/forgetpassword?token=${token}`
        const data = await sendEmail(user.email, "password reset link", resetURl)
        if (data.error) {
            res.status(400).json({
                success: false,
                message: data.error
            })
            return 
        }
        res.status(200).json({
            success: true,
            message: "reset link sent"
        })
        return 
    } catch (error) {
        res.status(500).json({
            success: false,
            error: (error as Error).message,
        })
        return 
    }
}

export const resetPassword = async (req: Request, res: Response) => {
    try {

        interface JwtPayload {
            id: {
                user: string,
                type: string
            };
            iat: number,
            exp: number,
        }
        let { token, password } = req.body
        const decodeData = jwt.verify(token as string, process.env.JWT_SECRET ?? "") as JwtPayload
        if (decodeData?.id.type === "reset") {
            const currentDate = new Date(Date.now())
            const expiry = new Date(decodeData.exp)
            if (currentDate > expiry) {
                res.status(400).json({
                    success: false,
                    message: "link expired"
                })
                return 
            }
            const salt = await bcrypt.genSalt(10); // Generate salt
            password = await bcrypt.hash(password, salt); //
            const user = await UserModel.findOneAndUpdate(
                {
                    _id: decodeData.id.user,
                    password_reset_token: token
                },
                {
                    $set: {
                        password,               // Set the new password
                        password_reset_token: null // Clear the reset token
                    }
                },
                { new: true } // This option returns the updated document
            )
            res.status(200).json({
                success: true,
                user
            })
            return 

        }
        res.status(400).json({
            success: false,
            message: "invalid token"
        })
        return 

    } catch (error) {
        res.status(500).json({
            success: false,
            error: (error as Error).message,
        })
        return 
    }
}


export const resetPasswordByPassword = async (req: Request, res: Response) => {
    try {
        const { newPassword } = req.body
        const isMatch = await bcrypt.compare(newPassword, req.user?.password as string)
        if (isMatch) {
            res.status(406).json({
                success: false,
                message: "password cannot be your previous one"
            })
            return 
        }
        const salt = await bcrypt.genSalt(10); // Generate salt
        const password = await bcrypt.hash(newPassword, salt); //
        const user = await UserModel.findByIdAndUpdate(req.user?._id, {
            $set: {
                password
            }
        }, { new: true })
        res.status(200).json({
            success: true,
            user
        })
        return 
    } catch (error) {
        res.status(500).json({
            success: false,
            error: (error as Error).message,
        })
        return 
    }
}

export const updateUserStatus = async (req: Request, res: Response) => {
    try {
        const user = await UserModel.findByIdAndUpdate(req.user?._id, {
            $set: {
                status: "inactive"
            }
        }, { new: true })
        res.status(200).json({
            success: true,
            message: "account deleted"
        })
        return 
    } catch (error) {
        res.status(500).json({
            success: false,
            error: (error as Error).message,
        }) 
        return 
    }
}

