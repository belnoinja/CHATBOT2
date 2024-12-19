const cron = require('node-cron');
const User = require('../models/User'); // Adjust the path as needed
const { sendMessage } = require("../utils/whatsappAPI"); // Assuming sendMessage exists in utils

// Define the cron job function
function scheduleSubscriptionReminders() {
  cron.schedule('*/30 * * * * *', async () => { // Adjust the schedule to run at the desired time
    try {
      const today = new Date();

      // Query users who have a reminder date <= today and have not yet received the reminder
      const users = await User.find({
        nextReminderDate: { $lte: today }, // Reminder date today or earlier
        remindersent: false, // Only process users whose reminder has not been sent
      });

      if (users.length === 0) {
        // console.log("No users need reminders today.");
        return; // No users to process
      }

      // Process each user who needs a reminder
      for (const user of users) {
        // Create reminder message for the user
        const reminderMessage = {
          text: `🌟 **Hello ${user.name || 'Valued Customer'},** 🌟\n\n` +
                `📝 **Reminder:** Your next subscription payment for **${user.subscriptionType || 'Ghee'}** is due soon! ⏰\n` +
                `💳 Please ensure your account has sufficient funds to avoid payment failures.\n\n` +
                `📦 **Subscription Details:**\n` +
                `- **Quantity:** ${user.subscriptionQuantity || 'N/A'}\n` +
                `- **Amount:** ₹${user.subscriptionAmount || 'N/A'}\n\n` +
                `🏠 **Delivery Address:** ${user.address || 'Not provided'}\n` +
                `📅 **Delivery Date:** ${user.deliveryDate.toLocaleDateString()}\n\n` +
                `🚚 **Note:** Your delivery will be around the provided delivery date.\n\n` +
                `Thank you for being with us! We appreciate your support. ❤️\n` +
                `If you have any questions, feel free to reach out to our customer support at **${process.env.CUSTOMER_SUPPORT_CONTACT}**. 😊`
        };

        // Admin notification (to confirm reminder was sent)
        const adminPhone = process.env.ADMIN_PHONE || "YOUR_ADMIN_PHONE_NUMBER"; // Replace with your admin phone or load from env
        const adminMessage = {
          text: `✅ **Reminder Sent to User**\n\n` +
                `A payment reminder for subscription type **${user.subscriptionType || 'Ghee'}** has been successfully sent to **${user.name || 'Valued Customer'}**.\n` +
                `- **Phone:** ${user.phone}\n` +
                `- **Delivery Date:** ${user.deliveryDate.toLocaleDateString()}\n` +
                `- **Amount:** ₹${user.subscriptionAmount || 'N/A'}\n` +
                `- **Quantity:** ${user.subscriptionQuantity || 'N/A'}\n` +
                `The reminder message was successfully delivered to the user! ✅`
        };

        // Send reminder message to the user and admin
        await sendMessage(user.phone, reminderMessage);
        await sendMessage(adminPhone, adminMessage);

        // Calculate the next reminder date (advance by one month and subtract 7 days)
        const nextReminderDate = new Date(user.nextReminderDate || user.subscriptionStartDate);
        nextReminderDate.setMonth(nextReminderDate.getMonth() + 1); // Advance by one month
        nextReminderDate.setDate(nextReminderDate.getDate() - 7); // Set reminder 7 days before

        // Update `remindersent` to `true` and set the next reminder date
        user.remindersent = true;
        user.nextReminderDate = nextReminderDate;

        // Save the user after updating the reminder flag and date
        await user.save();
        console.log(`Reminder sent to ${user.name || user.phone}. Reminder updated.`);
      }

    } catch (error) {
      console.error('Error sending subscription reminders:', error);
    }
  });
}


module.exports = scheduleSubscriptionReminders;
