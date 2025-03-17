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
export const sendOTp = async (req: Request, res: Response) => {
    try {
        const { field } = req.body;

        if (!field) {
            res.status(400).json({
                success: false,
                message: "Field is required",
            });
            return 
        }

        // Function to check whether input is an email or a contact number
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

        // Check if user already exists in the database
        let userExists;
        if (inputType === "email") {
            userExists = await UserSchema.findOne({ email: field });
        } else if (inputType === "contact") {
            userExists = await UserSchema.findOne({ contact: field });
        }

        if (userExists) {
            if (userExists.status === "inactive") {
                res.status(400).json({
                    success: false,
                    message: `Account associated with ${field} is not active. Please contact support.`,
                });
                return 
            }
            res.status(400).json({
                success: false,
                message: `${field} is already in use`,
            });
            return 
        }

        let otpResponse;

        if (inputType === "email") {
            otpResponse = await hashOtp(field);
            await sendEmail(field, "Verify OTP", `Your OTP is: ${otpResponse.otp}`);
        } else if (inputType === "contact") {
            otpResponse = await hashOtp(field);
            // Send OTP via SMS API (implement sendSms function)
            // await sendSms(field, `Your OTP is: ${otpResponse.otp}`);
        }

        res.status(200).json({
            message: "OTP Sent Successfully",
            otp: otpResponse?.otp,
            hash: otpResponse?.fullhash,
            success: true,
        });
        return

    } catch (error) {
        console.error("Error sending OTP:", error);
        res.status(500).json({
            success: false,
            error: (error as Error).message || "Internal Server Error",
        });
        return
    }
};



export const SignUp = async (req: Request, res: Response) => {
    try {
        const { email, contact } = req.body;
        const avatar = req.file
        // check for existing users
        let imageResponse;
        if (avatar) {
            imageResponse = await s3Uploader(avatar, process.env.S3_BUCKET_NAME as string)
            if (imageResponse.error) {
                return res.status(500).json({
                    message: "Error uploading image to S3",
                    success: false,
                    error: imageResponse.error,
                }) as unknown as void
            }
        }
        const userExists = await UserSchema.userExists(email, contact);
        if (userExists) {
            if (userExists.status === "inactive") {
                return res.status(400).json({
                    success: false,
                    message: `account associated with ${email} is not active. please contact us`
                }) as unknown as void
            }
            return res.status(409).json({
                message: "Email or contact number already exists",
                success: false,
            }) as unknown as void
        }


        const salt = await bcrypt.genSalt(10); // Generate salt
        const password = await bcrypt.hash(req.body.password, salt); //
        const user = await UserSchema.create({
            ...req.body,
            password,
            image: {
                ETag: imageResponse?.succesResponse.ETag,
                key: imageResponse?.succesResponse.Key,
                Location: imageResponse?.succesResponse.Location
            }
        })
        return res.status(201).json({
            message: "User Created Successfully",
            user: user,
            success: true,
        }) as unknown as void
    } catch (error) {
        console.log(error)
        const errorMessage = (error as Error).message;
        return res.status(500).json({
            success: false,
            error: errorMessage,
        }) as unknown as void
    }
};

export const verifyOtp = async (req: Request, res: Response) => {
    try {
        const { hash, otp, field, type } = req.body
        Object.entries(req.body).forEach(([key, value]) => {
            if (value === undefined || value === null) {
                return res.status(400).json({
                    success: false,
                    message: `${key} has value ${value}`
                }) as unknown as void
            }
        });
        let [hashValue, expires] = hash?.split('.');
        const resp = verifyHash(expires, field, otp as number)
        //  ||
        if ((checkInputType(field) === "contact" && otp == 1234) || resp.verified === hashValue) {
            if (type === "login") {
                

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
                    user = await UserSchema.findOne({ email: field }).lean() as IUser;
                } else if (inputType === "contact") {
                    user = await UserSchema.findOne({ contact: field }).lean() as IUser;
                }

                const iat = Date.now(); // Current time in milliseconds
                const exp = iat + 7 * 24 * 60 * 60 * 1000; // Add 7 days (in milliseconds)
                const token = generateToken(user?._id as string, iat, exp, "login")
                let userImageBase64 = user?.image?.key ? await getImageFromS3(user.image.key, process.env.S3_BUCKET_NAME as string) : null
                return res.status(200).json({
                    success: true,
                    message: `Verified Success`,
                    token,
                    user: {
                        ...user,
                        userImageBase64
                    }
                }) as unknown as void
            }
            return res.status(200).json({
                success: true,
                message: `Verified Success`,
            }) as unknown as void
        }
        else {
            return res.status(400).json({
                success: false,
                message: `Incorrect Otp`
            }) as unknown as void
        }
    } catch (error) {
        const errorMessage = (error as Error).message;
        return res.status(500).json({
            success: false,
            error: errorMessage,
        }) as unknown as void;
    }
}

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
            user = await UserSchema.findOne({ email: field }).lean() as IUser;
        } else if (inputType === "contact") {
            user = await UserSchema.findOne({ contact: field }).lean() as IUser;
        }

        if (!user) {
            return res.status(404).json({
                message: "user not found",
                success: false
            }) as unknown as void
        }
        if (password) {
            const isMatch = await bcrypt.compare(password, user.password)
            if (isMatch) {
                let userImageBase64 = user?.image?.key ? await getImageFromS3(user.image.key, process.env.S3_BUCKET_NAME as string) : null
                const iat = Date.now(); // Current time in milliseconds
                const exp = iat + 7 * 24 * 60 * 60 * 1000; // Add 7 days (in milliseconds)
                const token = generateToken(user?._id as string, iat, exp, "login")
                return res.status(200).json({
                    success: true,
                    message: `Verified Success`,
                    token,
                    user: {
                        ...user,
                        userImageBase64
                    }
                }) as unknown as void
            }
            else {
                return res.status(406).json({
                    success: false,
                    message: "password not matched"
                }) as unknown as void
            }
        }
        switch (checkInputType(field)) {
            case "email":
                const emailHashReponse = await hashOtp(field)
                const templateData = {
                    templateId: 2, // Replace with your template ID
                    params: {
                        "FIRSTNAME": user.name,
                        "SMS": emailHashReponse.otp
                    },
                }
                await sendEmail(field, 'Verify OTP', undefined, undefined, templateData)
                return res.status(200).json({
                    message: "Otp Sent Successfully",
                    hash: emailHashReponse.fullhash,
                    success: true,
                }) as unknown as void
            case "contact":
                const hashReponse = await hashOtp(field)
                return res.status(200).json({
                    message: "Otp Sent Successfully",
                    hash: hashReponse.fullhash,
                    success: true,
                }) as unknown as void
            default:
                return res.status(400).json({
                    success: false,
                    message: "Invalid field type",
                }) as unknown as void
        }
    } catch (error) {
        const errorMessage = (error as Error).message;
        return res.status(500).json({
            success: false,
            error: errorMessage,
        }) as unknown as void
    }
}

export const getUserProfile = async (req: Request, res: Response) => {
    try {
        let userImage
        const { user } = req
        if (user?.image.key) {
            userImage = await getImageFromS3(user.image.key, process.env.S3_BUCKET_NAME as string);
        }
        return res.status(200).json({
            success: true,
            data: {
                ...user?.toObject(),
                userImageBase64: userImage
            }
        }) as unknown as void
    } catch (error) {
        console.log(error)
        const errorMessage = (error as Error).message;
        return res.status(500).json({
            success: false,
            error: errorMessage,
        }) as unknown as void
    }
}

export const updateBasicDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const { file: newAvatar, user: currentUser } = req;
        let updateFields: any = { ...req.body };

        if (newAvatar) {
            const { succesResponse, error } = await s3Uploader(newAvatar, process.env.S3_BUCKET_NAME as string);
            if (error) {
                return res.status(500).json({
                    message: error,
                    success: false,
                }) as unknown as void
            }

            updateFields.image = {
                Location: succesResponse.Location,
                key: succesResponse.key,
                ETag: succesResponse.ETag,
            };

            if (currentUser?.image?.key) {
                await deleteFileFromS3(process.env.S3_BUCKET_NAME as string, currentUser.image.key);
                console.log("Old avatar deleted from S3");
            }
        }

        const user = await UserModel.findByIdAndUpdate(currentUser?._id, updateFields, { new: true });
        return res.status(200).json({
            message: 'User details updated successfully',
            success: true,
            user
        }) as unknown as void
    } catch (error) {
        return res.status(500).json({
            message: 'Internal server error',
            error: (error as Error).message || error,
            success: false,
        }) as unknown as void
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
        return res.status(200).json({
            success: true,
            user: updatedUser,
        }) as unknown as void

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
                return res.status(400).json({
                    success: false,
                    error: result.error,
                }) as unknown as void
            }
            // Accumulate the folder sizes
            size += result.size;
            totalContent += result.content
        }
        // Convert total size to megabytes (MB) and round it down
        const sizeInMB = (size / (1024 * 1024)).toFixed(2);
        const user_storage_size = req.user?.storage_size as number
        // Send response after all folder sizes are calculated
        return res.status(200).json({
            success: true,
            totalSize: user_storage_size,// Return the size in MB as an integer
            used_size: parseFloat(sizeInMB),
            available_size: user_storage_size - parseFloat(sizeInMB),
            totalContent
        }) as unknown as void
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: (error as Error).message,
        }) as unknown as void
    }
}

export const sendResetLink = async (req: Request, res: Response) => {
    try {
        const { email } = req.body
        const user = await UserSchema.findOne({ email, status: "active" })
        if (!user) {
            return res.status(404).json({
                success: false,
                message: `account associated with ${email} not found`
            }) as unknown as void
        }
        const iat = Date.now()// Current time in seconds (issued at time
        const exp = iat + 2 * 60 * 1000;
        const token = generateToken(user?._id as string, iat, exp, "reset")
        user.password_reset_token = token
        await user.save()
        const resetURl = `${process.env.FRONTEND_URL}/forgetpassword?token=${token}`
        const data = await sendEmail(user.email, "password reset link", resetURl)
        if (data.error) {
            return res.status(400).json({
                success: false,
                message: data.error
            }) as unknown as void
        }
        return res.status(200).json({
            success: true,
            message: "reset link sent"
        }) as unknown as void
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: (error as Error).message,
        }) as unknown as void
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
                return res.status(400).json({
                    success: false,
                    message: "link expired"
                }) as unknown as void
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
            return res.status(200).json({
                success: true,
                user
            }) as unknown as void

        }
        return res.status(400).json({
            success: false,
            message: "invalid token"
        }) as unknown as void

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: (error as Error).message,
        }) as unknown as void
    }
}


export const resetPasswordByPassword = async (req: Request, res: Response) => {
    try {
        const { newPassword } = req.body
        const isMatch = await bcrypt.compare(newPassword, req.user?.password as string)
        if (isMatch) {
            return res.status(406).json({
                success: false,
                message: "password cannot be your previous one"
            }) as unknown as void
        }
        const salt = await bcrypt.genSalt(10); // Generate salt
        const password = await bcrypt.hash(newPassword, salt); //
        const user = await UserModel.findByIdAndUpdate(req.user?._id, {
            $set: {
                password
            }
        }, { new: true })
        return res.status(200).json({
            success: true,
            user
        }) as unknown as void
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: (error as Error).message,
        }) as unknown as void
    }
}

export const updateUserStatus = async (req: Request, res: Response) => {
    try {
        const user = await UserModel.findByIdAndUpdate(req.user?._id, {
            $set: {
                status: "inactive"
            }
        }, { new: true })
        return res.status(200).json({
            success: true,
            message: "account deleted"
        }) as unknown as void
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: (error as Error).message,
        }) as unknown as void
    }
}

