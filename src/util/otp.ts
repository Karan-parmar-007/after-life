// otp.ts
import mongoose, { Schema } from 'mongoose';
import OtpModel, { IOtp } from '../schema/OtpSchema';
import crypto from "crypto";

interface HashOtpResponse {
    fullhash: string;
}

interface TypeVerifyHash {
    err: string | null;
    verified: boolean;
}

export const hashOtp = (otp: number, field: string): HashOtpResponse => {
    const data = `${field}.${otp}`;
    const hash = crypto.createHmac('sha256', process.env.BINARY_TO_HASH_OTP as string)
        .update(data)
        .digest("hex");
    const fullhash = `${hash}`;
    return { fullhash };
};

export const verifyHash = async (field: string | number , otp: number) => {
    const response: TypeVerifyHash = { err: null, verified: false };

    let otp_data = await OtpModel.findOne({ user_id: field })
    if (!otp_data) {
        response.err = "OTP not found";
        return response;
    }

    let hashed_otp = otp_data?.hashed_otp;
    let expires = otp_data?.expires_in;

    const iat = new Date();
    if (expires < iat ) {
        response.err = "OTP expired";
        return response;
    }
    
    const data = `${field}.${otp}`;
    const hash = crypto.createHmac('sha256', process.env.BINARY_TO_HASH_OTP as string)
        .update(data)
        .digest("hex");
    let test = hash === hashed_otp
    console.log(test)
    response.verified = hash === hashed_otp;
    return response;
};