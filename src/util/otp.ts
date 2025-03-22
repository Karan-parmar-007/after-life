import crypto from "crypto"
// import dotenv from "dotenv"
// dotenv.config()
let binary=process.env.BINARY_TO_HASH_OTO as string

interface typeVerifyHash{
    err:string|null,
    verified:string|null

}
export const hashOtp=async(field:String|number)=>{
    const otp = Math.floor(1000 + Math.random() * 9000)
    const ttl=20*60*100
    const expires=Date.now()+ttl
    const data=`${field}.${otp}.${expires}`;
    const hash=crypto.createHmac('sha256',binary).update(data).digest("hex")
    const fullhash=`${hash}.${expires}`
    return {
        fullhash,
        otp
    }
}
export const verifyHash = (expires: string, field: number|String, otp: number) => {
    let response:typeVerifyHash = { err: null, verified: null }
    let now = Date.now();
    if (now > parseInt(expires)) {
          response.err = 'Timeout. Please try again'
    }
    let data = `${field}.${otp}.${expires}`;
    let newCalculatedHash = crypto.createHmac('sha256', binary).update(data).digest('hex');
    response.verified = newCalculatedHash
    return response
}