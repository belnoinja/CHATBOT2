const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const axios = require('axios');
const db = require('./config/db.js');
const cron = require('node-cron'); // For cron scheduling
require('dotenv').config(); // Load environment variables
const cors = require('cors');

const app = express();
app.use(cors());

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


// Load environment variables
const phoneNumberId = process.env.PHONE_NUMBER_ID;
const token = process.env.WHATSAPP_ACCESS_TOKEN;

// Import PhoneNumber model
const PhoneNumber = require('./models/phoneNumber');



// Schedule the task to run every day at 10:00 AM (adjust the time as needed)
cron.schedule('0 10 * * *', async () => {
    await sendBroadcastMessage();
});

// Start cron jobs for subscription reminders
const scheduleSubscriptionReminders = require('./reminder/scheduler.js');
// scheduleSubscriptionReminders();

// Routes
const whatsappRoutes = require('./routes/whatsappRoutes');
app.use('/', whatsappRoutes); // Webhook for receiving WhatsApp messages

app.get('/', (req, res) => {
    res.status(200).send("Hello from Nani Belona Ghee!!");
})






// Helper function to send WhatsApp message
async function sendTemplateMessage(phoneNumber) {
    const apiUrl = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

    try {
        const response = await axios.post(
            apiUrl,
            {
                messaging_product: 'whatsapp',
                to: `+${phoneNumber}`,
                type: 'template',
                template: {
                    name: 'send', 
                    language: { code: 'en' },
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        return true;
    } catch (error) {
        return false;
    }
}

// Function to send messages to all phone numbers that haven't received the message yet
async function sendBroadcastMessage() {
    try {
        // Fetch all phone numbers that haven't received the message
        const phoneNumbers = await PhoneNumber.find({ isMessageSent: false });

        // Loop through and send the message
        for (const record of phoneNumbers) {
            const phoneNumber = record.userPhone;
            const success = await sendTemplateMessage(phoneNumber);

            // If message is sent successfully, update the database
            if (success) {
                await PhoneNumber.updateOne({ userPhone: phoneNumber }, { $set: { isMessageSent: true } });
            } else {
            }
        }
        
    } catch (error) {
    }
    return;
}



// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
module.exports = app;