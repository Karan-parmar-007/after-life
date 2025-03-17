import axios from 'axios';
import dotenv from "dotenv"
dotenv.config()
const apiKey = process.env.EMAIL_API_KEY; // Replace with your actual API key


export const sendEmail = async (email: string, subject: string, content?: string, attachments?: any, template?: any) => {
      const url = 'https://api.brevo.com/v3/smtp/email';

      let response: { id: string | null, error: any } = {
            id: null,
            error: null
      }
      const emailData = {
            sender: { email: 'amit.letsbegin@gmail.com', name: 'After Life' },
            ...template,
            to: [{ email: email }],
            subject: subject,
            htmlContent: content, // Optional: If you want to include custom content
            headers: {
                  'X-Mailin-custom': 'custom_header', // Optional custom headers
            },
      };
      console.log(emailData)
      try {
            const { data } = await axios.post(url, emailData, {
                  headers: {
                        'Content-Type': 'application/json',
                        'api-key': apiKey,
                  },
            });
            console.log(data)
            response.id = data.messageId
            console.log(response)
      } catch (error: any) {
            console.log(error.response)
            response.error = error
      }
      return response
};
// FUNCTION TO CHECK USER READ AN EMAIL OR NOT
export const checkEmailStatus = async (messageId: string) => {
      const url = `https://api.brevo.com/v3/smtp/statistics/events?messageId=${messageId}`;
      console.log(url)
      let response: { id: any, error: any } = {
            id: null,
            error: null
      }
      try {
            const { data } = await axios.get(url, {
                  headers: {
                        'api-key': apiKey,
                  },
            });
            response.id = data.events
      } catch (error: any) {
            response.error = error
      }
      return response
};



