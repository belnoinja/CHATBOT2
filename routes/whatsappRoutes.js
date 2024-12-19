// routes/whatsappRoutes.js
const express = require("express");
const router = express.Router();
const whatsappController = require("../controllers/whatsappController");
const crypto = require("crypto");
const { sendMessage } = require("../utils/whatsappAPI");
const User = require("../models/User"); // Adjust the path if necessar
const State = require("../models/State");
// const State = require('../models/State');
const Razorpay = require("razorpay");
const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// GET request for webhook verification
router.get("/webhook", (req, res) => {
  const verifyToken = process.env.VERIFY_TOKEN; // Token in .env file
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Store processed message timestamps (you can use a database or in-memory storage)
const processedMessages = new Map();

// Define a threshold in milliseconds (e.g., 5 minutes)
const MESSAGE_PROCESS_THRESHOLD = 5 * 60 * 1000; // 5 minutes

const MIN_TIMESTAMP_DIFF = 5 * 60 * 1000; // 5 minutes threshold in milliseconds

router.post("/webhook", (req, res) => {
  try {
    const payload = req.body;

    // Log the full payload for debugging purposes

    // Extract relevant data from the payload
    const changes = payload.entry?.[0]?.changes?.[0]?.value;

    // Check if the event contains actual messages
    if (changes?.messages && Array.isArray(changes.messages)) {
      const messages = changes.messages;

      // Get current timestamp
      const currentTimestamp = Date.now(); // Get the current timestamp in milliseconds

      // Check each message in the messages array
      messages.forEach((message) => {
        // Ensure this is a user-generated message
        if (message.type && message.from) {
          // Extract timestamp from the message
          const messageTimestamp = parseInt(message.timestamp, 10) * 1000; // Convert to milliseconds

          // Check if the timestamp difference is within an acceptable range (e.g., 5 minutes)
          const timestampDifference = currentTimestamp - messageTimestamp;

          // If the timestamp difference is too large, consider it as a duplicate/random message
          if (timestampDifference > MIN_TIMESTAMP_DIFF) {
            return; // Skip processing this message
          }

          whatsappController.receiveMessage(req, res); // Call your controller
        } else {
        }
      });

      res.status(200).send("Message processed");
    } else {
      res.status(200).send("No valid messages to process");
    }
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
});
router.get("/payment-done", (req, res) => {
  const { razorpay_payment_id } = req.query;

  // Customize the WhatsApp message link
  const whatsappNumber = "919904058161"; // Replace with your target number
  const message = encodeURIComponent(
    `Thank you for your payment! Your Razorpay ID: ${razorpay_payment_id}`
  );
  const whatsappRedirectURL = `https://wa.me/${whatsappNumber}?text=${message}`;

  // Redirect user to WhatsApp
  res.redirect(whatsappRedirectURL);
});

router.post("/payments-success", async (req, res) => {
  const secret = process.env.VERIFY_TOKEN;

  // Verify the signature to authenticate Razorpay's webhook
  const receivedSignature = req.headers["x-razorpay-signature"];
  const generatedSignature = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (generatedSignature !== receivedSignature) {
    return res.status(400).send("Invalid signature");
  }

  const event = req.body.event;
  const paymentData = req.body.payload.payment
    ? req.body.payload.payment.entity
    : null;
  const subscriptionData = req.body.payload.subscription
    ? req.body.payload.subscription.entity
    : null;
    const userPhone = paymentData.contact.replace('+', '');

  const amount = paymentData
    ? paymentData.amount / 100
    : subscriptionData
    ? subscriptionData.notes.amount / 100
    : null; // Convert paise to rupees

  if (!userPhone) {
    return res.status(400).send("User phone number missing");
  }

  try {
    if (event === "payment.captured") {
      console.log(paymentData);
      console.log(userPhone);
      
      // Handle successful one-time payment
      const user = await User.findOneAndUpdate(
        { phone: userPhone },
        { userOrderPaymentID: paymentData.id }, // Store the successful payment ID
        { new: true }
      );
      const name = user.name;
      const address = user.address;
      

      if (!user) {
        return res.status(404).send("User not found");
      }

      // Update the single order payment status
      user.singleorderPaymentStatus = true;

      // Save the updated user to the database if necessary
      await user.save();

      // Send success message to user
      const successMessage = {
        text: `✅✅ *Payment Successful!* 🎉\n\nThank you, *${name}*, for your purchase! 🐄\n\n📜 *Order Summary:*\n——————————————\n🛍️ *Item:* Nani's Bilona Ghee\n💳 *Amount Paid:* ₹${amount}\n📱 *Phone:* ${userPhone}\n📍 *Delivery Address:* ${address}\n——————————————\n\n🚚 *Delivery Info:*\nYour order will be delivered within **4-5 business days**. 📦\n\n💛 *Thank you for choosing Nani’s Bilona Ghee!*\nFor queries, feel free to reach out. We’re here to help! 🌟\n\n📞 *Customer Support:* ${process.env.CUSTOMER_SUPPORT_CONTACT}\n\n✨ Stay healthy, stay happy! ✨`,
      };

      await sendMessage(userPhone, successMessage);

      //Send success message to admin
      const adminPhone = process.env.ADMIN_PHONE || "YOUR_ADMIN_PHONE_NUMBER";
      const adminSuccessMessage = {
        text: `✅ *Payment Alert!*\n\n📞 *Customer Phone:* ${userPhone}\n💳 *Amount Paid:* ₹${amount}\n🛍️ *Item:* Nani's Bilona Ghee\n📍 *Delivery Address:* ${address}\n\n📦 Order will be delivered within 4-5 business days.\n\n✨ *Payment ID:* ${paymentData.id}\n\n💼 Please process the order promptly.`,
      };
      await sendMessage(adminPhone, adminSuccessMessage);

      return res.status(200).send("Payment processed");
    } else if (event === "payment.failed") {

      // Handle failed one-time payment
      const failureReason = paymentData.error_description || "Unknown error";
      const user =await User.findOne({ phone: userPhone });
      
      
      // Send failure message to user
      const failureMessage = {
        text: `❌ *Payment Failed* ❌\n\nHi *${user.name}*,\n\nWe regret to inform you that your payment of ₹${amount} could not be processed. 😔\n\n📜 *Order Summary:*\n🛍️ *Item:* Nani's Bilona Ghee\n📍 *Delivery Address:* ${user.address}\n⚠️ *Reason:* ${failureReason}\n\n🔄 You can retry the payment or contact us for assistance.\n\n💛 We're here to help you enjoy the goodness of Nani's Bilona Ghee! 🌟`,
      };
      await sendMessage(userPhone, failureMessage);

      // Notify the admin of the payment failure
      const adminPhone = process.env.ADMIN_PHONE || "YOUR_ADMIN_PHONE_NUMBER";
      const adminMessage = {
        text: `❌ *Payment Failure Alert!*\n\n📞 *Customer Phone:* ${userPhone}\n💳 *Attempted Amount:* ₹${amount}\n📦 *Delivery Address:* ${address}\n⚠️ *Failure Reason:* ${failureReason}\n\n💼 *Payment ID:* ${paymentData.id}\n\nPlease review and follow up with the customer for resolution.`,
      };
      await sendMessage(adminPhone, adminMessage);

      return res.status(200).send("Payment failure handeled");
    }
    //  else if (event === "subscription.charged") {
    //   // Handle successful subscription charge
    //   const user = await User.findOneAndUpdate(
    //     { phone: userPhone },
    //     { subscriptionId: subscriptionData.id }, // Store or update subscription ID
    //     { new: true }
    //   );
    //   const address = user.address;
    //   const subscriptionType = user.subscriptionType;
    //   const subscrptionStartDatee = user.subscriptionStartDate;
    //   const nextremdate = user.nextReminderDate;
    //   user.subscriptionPaymentStatus = true;
    //   await user.save();

    //   const successMessage = {
    //     text: `Subscription done . Thank you for continuing with our service!`,
    //   };
    //   await sendMessage(userPhone, successMessage);

    //   const adminPhone = process.env.ADMIN_PHONE || "YOUR_ADMIN_PHONE_NUMBER";
    //   const adminSuccessMessage = {
    //     text: `✅ Payment received!\n User with ID: ${userId} \n Subscription Type : ${subscriptionType} \n Subscription Start Date: ${subscrptionStartDatee} \n Address: ${address} \n UserPhone ${userPhone} has successfully completed the payment of:\n ₹${amount} for subscription ${subscriptionId}.\n Its Next Remainder Date is ${nextremdate}\n`,
    //   };
    //   await sendMessage(adminPhone, adminSuccessMessage);
    //   return res.status(200).send("sub charged");
    // } else if (event === "subscription.payment_failed") {
    //   // Handle failed subscription payment
    //   const failureReason = paymentData
    //     ? paymentData.error_description
    //     : "Payment failure during subscription renewal";

    //   // Send failure message to user
    //   const failureMessage = {
    //     text: `Subscription renewal payment of ₹${amount} failed. Please update your payment method. Reason: ${failureReason}`,
    //   };
    //   await sendMessage(userPhone, failureMessage);

    //   // Notify admin of the subscription payment failure
    //   const adminPhone = process.env.ADMIN_PHONE || "YOUR_ADMIN_PHONE_NUMBER";
    //   const adminMessage = {
    //     text: `Alert: Subscription renewal payment of ₹${amount} failed for ${userPhone}. Reason: ${failureReason}`,
    //   };

    //   await sendMessage(adminPhone, adminMessage);
    //   return res.status(200).send("Subscription payment failed handled"); // Only one response here
    // }

    res.status(200).send("Webhook received");
  } catch (error) {
    res.status(500).send("Server error processing payment");
    console.log(error);
  }
});

router.post("/subs-success", async (req, res) => {
  const secret = process.env.VERIFY_TOKEN;
  // Verify the signature to authenticate Razorpay's webhook
  const receivedSignature = req.headers["x-razorpay-signature"];
  const generatedSignature = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (generatedSignature !== receivedSignature) {
    return res.status(400).send("Invalid signature");
  }

  const event = req.body.event;
  const paymentData = req.body.payload.payment
    ? req.body.payload.payment.entity
    : null;
  const subscriptionData = req.body.payload.subscription
    ? req.body.payload.subscription.entity
    : null;
  // const userPhone = paymentData
  //   ? paymentData.contact.replace(/^\+/, "") // Remove leading `+` // Remove leading `+`
  //   : subscriptionData
  //   ? (subscriptionData.notes = (subscriptionData.notes || "")
  //       .toString()
  //       .replace(/^\+/, ""))
  //   : null;
  const userPhone = subscriptionData && subscriptionData.notes
  ? subscriptionData.notes.phone
  : null;

  const amount = paymentData
    ? paymentData.amount
    : subscriptionData
    ? subscriptionData.notes.amount / 100
    : null; // Convert paise to rupees

  if (!userPhone) {
    return res.status(400).send("User phone number missing");
  }

  try {
    if (event === "subscription.charged") {
      // Handle successful subscription charge
      const user = await User.findOneAndUpdate(
        { phone: userPhone },
        { subscriptionId: subscriptionData.id }, // Store or update subscription ID
        { new: true }
      );
      const address = user.address;
      const subscriptionType = user.subscriptionType;
      const subscrptionStartDatee = user.subscriptionStartDate;
      const nextremdate = user.nextReminderDate;
      user.subscriptionPaymentStatus = true;
      user.delivered = false;
      user.remindersent= false;
      await user.save();

      const successMessage = {
        text: `🪔✨ *Subscription Activated!!* 🎉\nPure ghee, delivered with care, right to your doorstep! 🧈\n📄 *Payment Details:*\n——————————————\n📅 *Subscription Type:* ${subscriptionType}\n🛡️ *Subscription Start Date:* ${user.deliveryDate.toLocaleDateString()}\n🚚 *Delivery Date:* Around ${user.deliveryDate.toLocaleDateString()}\n📍 *Address:* ${address}\n📱 *User Phone:* ${userPhone}\n💰 *Amount Paid:* ₹${
          amount / 100
        }\n📦 *Subscription Quantity:* ${
          user.subscriptionQuantity
        }ml\n\n——————————————\n✨\n*You can view your plan and edit its details anytime by typing 'Hi' and clicking on *View Your Plans*.\n\nFor customer support, contact: ${
          process.env.CUSTOMER_SUPPORT_CONTACT
        }`,
      };

      await sendMessage(userPhone, successMessage);

      const adminPhone = process.env.ADMIN_PHONE || "YOUR_ADMIN_PHONE_NUMBER";
      const adminSuccessMessage = {
        text: `✅✅ Payment received!\n User with payment ID : ${
          paymentData.id
        } \n Subscription Type : ${subscriptionType} \n Subscription Start Date: ${subscrptionStartDatee.toLocaleDateString()}\n *Delivery Date:* ${user.deliveryDate.toLocaleDateString()} \n Address: ${address} \n UserPhone ${userPhone} has successfully completed the payment of: ₹${
          amount / 100
        } for subscription ${
          subscriptionData.id
        }.\n Its Next Remainder Date is ${nextremdate.toLocaleDateString()}\n`,
      };
      await sendMessage(adminPhone, adminSuccessMessage);
      return res.status(200).send("sub charged");
    } else if (event === "subscription.halted") {
      // Handle failed subscription payment

      const failureReason = paymentData
        ? paymentData.error_description
        : "Payment failure during subscription renewal";

      console.log(subscriptionData);
      const user = await User.findOne({ phone: userPhone }).exec();
      console.log(userPhone);
      console.log(user);
      
      if (user.subscriptionPaymentStatus && user.subscriptionPaymentStatus!=null && user) {
        user.subscriptionPaymentStatus = false; // Mark the payment status as failed
      }
      await user.save();

      // Cancel the existing subscription
      if (user.subscriptionId) {
        await razorpayInstance.subscriptions.cancel(user.subscriptionId);
        user.subscriptionId += "cancelled";
      }

      // Create a new subscription with the same details
      const description = "Monthly Subscription of A2 Cow Ghee";

      const newSubscriptionData = await razorpayInstance.subscriptions.create({
        plan_id: user.planId, // Assuming user.subscriptionType stores the plan ID
        customer_notify: 1,
        total_count: 12, // Total cycles for the subscription
        quantity: 1, // Use calculated price or default quantity
        notes: {
          phone: userPhone,
          description: description,
          amount: parseInt(user.subscriptionAmount, 10),
        },
      });

      // Update user record with new subscription ID
     // user.subscriptionId = newSubscriptionData.id;
      // user.subscriptionPaymentStatus = true; // Reset payment status
      user.delivered = false;
      user.deliveryDate = new Date(new Date(user.deliveryDate).setDate(new Date(user.deliveryDate).getDate() + 4));
      user.subscriptionStartDate = new Date(); // Update start date to current date

      await user.save();

      // Send failure message to user about the failed payment
      const failureMessage = {
        text: `Subscription renewal payment of ₹${user.subscriptionAmount} failed. Please update your payment method. Reason: ${failureReason}`,
      };
      await sendMessage(userPhone, failureMessage);

      const paymentLinkMessage = {
        text: `🚨 *Payment Required to Reactivate Your Subscription!* 🚨\n\nSubscription renewal failed. To continue your subscription for ${user.subscriptionType}, please complete the payment using the following link:\n\n🔗 *Payment Link:* ${newSubscriptionData.short_url}\n\n💰 *Amount:* ₹${user.subscriptionAmount}\n📦 *Quantity:* ${user.subscriptionQuantity}ml\n📝 *Description:* ${description}\n\n*New Delivery Date:* ${user.deliveryDate.toLocaleDateString()}\n\nOnce the payment is successful, your subscription will be reactivated. If you have any questions, contact our support at: ${process.env.CUSTOMER_SUPPORT_CONTACT}`
      };
      

      await sendMessage(userPhone, paymentLinkMessage);
      // Notify admin about the subscription payment failure
      const adminPhone = process.env.ADMIN_PHONE || "YOUR_ADMIN_PHONE_NUMBER";
      const adminMessage = {
        text: `Alert: Subscription renewal payment of ₹${user.subscriptionAmount} failed for ${userPhone}. Reason: ${failureReason}`,
      };
      await sendMessage(adminPhone, adminMessage);

      // Send a success message after creating a new subscription

      return res
        .status(200)
        .send(
          "Subscription payment failed, handled and new subscription created"
        );
    }
    else if(event==="subscription.cancelled"){
      const successMessage = {
        text: `cancelled uff`,
      };

      await sendMessage(userPhone, successMessage);
      
    }

    res.status(200).send("Webhook received");
  } catch (error) {
  
    res.status(500).send("Server error processing payment");
    console.log(error);
  }
});

module.exports = router;
