const axios = require('axios');
const { sendMessage } = require("../utils/whatsappAPI");
const User = require('../models/User');

// Function to calculate and create Razorpay payment link
exports.generatePaymentLinkWithDivision = async (amountEntered, userPhone, description = "Purchase at Nani's Bilona Ghee") => {
  amountEntered=1;
  const url = 'https://api.razorpay.com/v1/payment_links';
  const auth = {
    username: process.env.RAZORPAY_KEY_ID,
    password: process.env.RAZORPAY_KEY_SECRET,
  };

  // Calculate the amount by dividing by 500, then convert to paise (for Razorpay)
  const calculatedAmount = Math.round(amountEntered) * 100; // Amount in paise

  const user = await User.findOne({phone:userPhone})
  user.userOrderAmount = calculatedAmount/100;
  user.save()
  const fiveMinutesFromNow = Math.floor(Date.now() / 1000) + 5 * 60; // 5 minutes from now in Unix timestamp

  try {
    const response = await axios.post(
      url,
      {
        amount: calculatedAmount,
        currency: 'INR',
        description: description,
        customer: {
          contact: userPhone,
        },
        notify: {
          sms: true,
          email: true,
          whatsapp: true,
        },
        callback_url: process.env.CALLBACK_URL, // Update as needed
        callback_method: 'get',
        
      },
      { auth }
    );
    console.log(response);
    
    const paymentLink = response.data.short_url;
    
    // Send success notification to the admin
    const adminPhone = process.env.ADMIN_PHONE ;
    const successMessage = {
      text: `💳 Payment link created for name:${user.name} phone *${userPhone}*:\n🔗 *${paymentLink}*\nThank you! 😊`,
    };
    await sendMessage(adminPhone, successMessage);

    return paymentLink;
  } catch (error) {
    console.log(error);
    
    // Send error message to the admin
    const adminPhone = process.env.ADMIN_PHONE || 'YOUR_ADMIN_PHONE_NUMBER';
    const errorMessage = {
      text: `Alert: Failed to create payment link for  name:${user.name} phone ${userPhone}. Error: ${error.response ? error.response.data.description : error.message}`,
    };
    await sendMessage(adminPhone, errorMessage);

    throw new Error('Failed to create payment link');
  }
};
