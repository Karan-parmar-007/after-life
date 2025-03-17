import crypto from "crypto"
const binary="2c884ac85a78e2cfcc899eb48be1c52362321690ec0c0ad96d55cf789f361be9"

interface typeVerifyHash{
    err:string|null,
    verified:string|null

}
export const hashOtp=async(field:String|number)=>{
    const otp = Math.floor(1000 + Math.random() * 9000)
    const ttl=10*60*100
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