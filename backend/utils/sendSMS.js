import twilio from "twilio";
const client = new twilio(process.env.ACCOUBT_SID, process.env.AUTH_TOKEN);

export const sendSms = async (to, body) => {
  try {
    const message = await client.messages.create({
      body: body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to,
    });
    // console.log(`Message sent successfully! SID: ${message.sid}`);
    return message.sid;
  } catch (error) {
    console.error("Error sending SMS:", error);
    throw error;
  }
};
