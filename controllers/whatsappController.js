const { sendMessage } = require("../utils/whatsappAPI");
const User = require("../models/User"); // Adjust the path if necessar
const State = require("../models/State.js");
const buttonHandlers = require("../handlers/buttonHandlers"); // Import button handlers
const { generatePaymentLinkWithDivision } = require("../razorpay/razorpay.js");
const Razorpay = require("razorpay");
const PhoneNumber = require("../models/phoneNumber.js");
const { use } = require("../app.js");
require('dotenv').config();

// Timeout duration in milliseconds (3 minutes)
const TIMEOUT_DURATION = 3 * 60 * 1000;

// Map to track timeouts for each user
const userTimeouts = new Map();

// Function to reset user state
const resetUserState = async (userPhone) => {
  try {
    const state = await State.findOne({ userPhone });
    if (state) {
      state.useredit = null;
      state.useradd = null;
      state.userState = null;
      state.planType = null;
      state.userAmount = null;
      await state.save();
    }
  } catch (error) {}
};

exports.receiveMessage = async (req, res) => {
  try {
    // Safely access entry and changes data
    const entry = req.body.entry && req.body.entry[0];
    const changes = entry && entry.changes && entry.changes[0];
    const value = changes && changes.value;

    // Check if the request contains 'messages' (incoming message data)
    const messages = value && value.messages && value.messages[0];
    if (messages) {
      const messageId = messages.id; // Unique message ID provided by WhatsApp
      const userPhone = messages.from; // Phone number of the sender
      const messageText = messages.text ? messages.text.body.toLowerCase() : ""; // Safely access message text

      // Check if the user already exists in the database
      let user = await User.findOne({ phone: userPhone });
      let state = await State.findOne({ userPhone });

      if (!user) {
        user = new User({
          phone: userPhone, // Save the phone number
        });
        await user.save();
      }

      if (!state) {
        state = new State({
          userPhone,
        });

        await state.save();
      }

      // Clear the existing timeout for this user if any
      if (userTimeouts.has(userPhone)) {
        clearTimeout(userTimeouts.get(userPhone));
        userTimeouts.delete(userPhone);
      }

      // Set a new timeout for the user
      const timeout = setTimeout(async () => {
        await resetUserState(userPhone);
        const timeoutMessage = {
          text: "⏳ *Oops, your session timed out!* Don’t worry, just type 'Hi' to restart! ",
        };
        await sendMessage(userPhone, timeoutMessage);
        userTimeouts.delete(userPhone); // Clean up the map
      }, TIMEOUT_DURATION);

      // Store the timeout in the map
      userTimeouts.set(userPhone, timeout);

      if (
        messageText.toLowerCase() === "hi" ||
        messageText.toLowerCase() === "hii" ||
        messageText.toLowerCase() === "hiii" ||
        messageText.toLowerCase() === "hello" ||
        messageText.toLowerCase() === "hey" ||
        (messageText.toLowerCase() === "help" && messageId)
      ) {
        // Reset the user's state to ensure a fresh start
        await resetUserState(userPhone);

        // Construct the welcome message text
        const welcomeText = "💛 Welcome to Nani's Bilona Ghee! ";

        // URL for the welcome image
        const imageUrl =
          // "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQQXaekK87HoROClCOCn3UAEwvmxcHSOdTKqg&s"; // Replace with your image URL
          "https://i.ibb.co/KL0fmWL/2.jpg";
        const videoUrl = "https://www.nanibilonaghee.com/videos/sahiwal.mp4"; // Use the correct path served by Express
        // Message content to send to the user
        // const messageData = {
        //   text: welcomeText,
        //   media: [
        //     {
        //       type: "image", // Image type for media
        //       url: imageUrl, // Image URL to be sent

        //     },

        //   ],
        //   buttons: [{ id: "help", title: "Need Help!" }],
        // };
        const messageData = {
          text: welcomeText,
          buttons: [{ id: "help", title: "Pure Ghee Awaits" }],
        };
        const msg = {
          media: [
            {
              type: "video",
              url: videoUrl, // Text type for media
            },
          ],
        };

        // Send the message and handle potential errors
        try {
          //await sendMessage(userPhone, msg);
          await sendMessage(userPhone, messageData);
          return res.status(200); // Return response if needed for further processing
        } catch (error) {
          throw new Error(`Failed to send welcome message to ${userPhone}`);
        }
      }

      if (state.username === "taking_name") {
        state.username = null;
        user.name = messageText;
        await state.save();
        await user.save();
        const message = {
          text: `Welcome, ${user.name}! 💛 Nani’s purest ghee awaits you. Let’s get started on this delightful journey! 🎉`,
          buttons: [{ id: "help", title: "Get started!" }],
        };
        return await sendMessage(userPhone, message);
      }
      if (state.userState === "awaiting_custom_amount_A2") {
        return await handleCustomAmountInput_A2(messageText, userPhone);
      } else if (state.userState === "awaiting_custom_amount_buffalo") {
        return await handleCustomAmountInput_buffalo(messageText, userPhone);
      } else if (state.userState === "awaiting_custom_amount_plan_buffalo") {
        return await handleCustomAmountInput_plan_buffalo(
          messageText,
          userPhone
        );
      } else if (state.userState === "awaiting_custom_amount_plan_A2") {
        return await handleCustomAmountInput_plan_A2(messageText, userPhone);
      }
      if (state.useradd === "awaiting_address") {
        return await handleAddressInput(messageText, userPhone);
      } else if (state.useradd === "awaiting_edit_address") {
        return await handleAddressInput(messageText, userPhone);
      } else if (state.useradd === "awaiting_subscription_date") {
        await handleSubscriptionDateInput(messageText, userPhone);

        return await state.save();
      }
      if (state.useredit === "awaiting_edit_date") {
        const newDeliveryDate = new Date(messageText);
        // Validate the date format
        if (
          isNaN(newDeliveryDate.getTime()) ||
          newDeliveryDate < new Date().setHours(0, 0, 0, 0)
        ) {
          const errorMessage = {
            text: "🚫 Please enter a valid future date (e.g., YYYY-MM-DD).",
          };
          return await sendMessage(userPhone, errorMessage);
        }

        const user = await User.findOne({ phone: userPhone });

        if (user) {
          // Update the date in your database
          user.deliveryDate = newDeliveryDate;
          // Set nextReminderDate to one month after the delivery date
          const reminderDate = new Date(newDeliveryDate);
          reminderDate.setMonth(reminderDate.getMonth() + 1);
          user.nextReminderDate = reminderDate;

          await user.save();

          try {
            // // Step 1: Cancel the old subscription if it exists
            // if (user.subscriptionId) {
            //   await razorpayInstance.subscriptions.cancel(user.subscriptionId);
            // }

            // // Step 2: Create a new subscription with the updated date
            // const newSubscription = await razorpayInstance.subscriptions.create(
            //   {
            //     plan_id: user.planId, // Use the existing plan ID from the user data
            //     customer_notify: 1,
            //     total_count: 12, // Example: 12-month subscription
            //     quantity: user.amountMultiplier / 500, // Adjust based on user data
            //     start_at: Math.floor(subscriptionDate.getTime() / 1000), // UNIX timestamp
            //     notes: {
            //       phone: user.phone,
            //       description: "Subscription with updated start date",
            //     },
            //   }
            // );

            // // Save the new subscription ID in the user's document
            // user.subscriptionId = newSubscription.id;
            // await user.save();

            // Step 3: Confirm success
            const message = {
              text: `🎉 Delivery Date Of your Order has been successfully updated!\n Your new Delivery date is ${user.deliveryDate.toLocaleDateString()}. Type 'Hi' to go back`,
            };
            return await sendMessage(userPhone, message);
          } catch (error) {
            const errorMessage = {
              text: "❌ Date update failed.\nPlease try again later. 🙏",
            };
            return await sendMessage(userPhone, errorMessage);
          }
        } else {
          const errorMessage = {
            text: "🚫 No user found with this phone number.\nPlease check and try again.",
          };
          return await sendMessage(userPhone, errorMessage);
          // Return if no user is found
        }
      }
      //k
      if (state.useredit === "awaiting_edit_address_existing") {
        // Update the user's address
        const user = await User.findOneAndUpdate(
          { phone: userPhone }, // Filter: find user by phone number
          { address: messageText }, // Update: set the new address value
          { new: true } // Option to return the updated user document
        );

        if (user) {
          const s = {
            text: "✅ Your address has been updated successfully!\nThank you for keeping your details up to date.",
          };
          return await sendMessage(userPhone, s);
        } else {
          const errorMessage = {
            text: "⚠️ There was an issue updating your address.\nPlease try again.",
          };
          return await sendMessage(userPhone, errorMessage);
        }
      }
      if (state.useredit === "awaiting_edit_quantity") {
        state.useredit = null;
        state.save();
        const newQuantity = parseInt(messageText, 10);

        // Validate the quantity format (must be a positive integer)
        if (isNaN(newQuantity) || newQuantity <= 0 || newQuantity % 500 != 0) {
          const errorMessage = {
            text: "⚠ Please enter a valid quantity in ml.\nIt must be divisible by 500.",
          };
          await sendMessage(userPhone, errorMessage);
        }
        const user = await User.findOne({ phone: userPhone });
        let newplanId;
        let Price = 0;
        if (user.subscriptionType === "A2 Cow") {
          let x = newQuantity;
          const n1 = Math.floor(x / 5000);
          // console.log(n1)
          const x1 = x % 5000;
          // console.log(x1);
          const n2 = Math.floor(x1 / 1000);
          // console.log(n2)
          const x2 = x1 % 1000;
          // console.log(x2);
          const n3 = Math.floor(x2 / 500);
          // console.log(n3);
          Price = n1 * 7837 + n2 * 1614 + n3 * 854;

          const planIdMap = {
            500: process.env.PLAN_A2_500,
            1000: process.env.PLAN_A2_1000, // 1L
            1500: process.env.PLAN_A2_1500,
            2000: process.env.PLAN_A2_2000,
            2500: process.env.PLAN_A2_2500,
            3000: process.env.PLAN_A2_3000,
            3500: process.env.PLAN_A2_3500,
            4000: process.env.PLAN_A2_4000,
            4500: process.env.PLAN_A2_4500, // 4.5L
            5000: process.env.PLAN_A2_5000, // 5L
          };

          // Determine the plan_id from the map based on the amountMultiplier
          if (x > 5000) {
            newplanId = process.env.SUBSCRIPTION_ID_A2; // Use default for amounts greater than 5L
          } else {
            newplanId = planIdMap[x]; // Default to 1L plan if not found
          }
        } else {
          let x = newQuantity;
          const n1 = Math.floor(x / 5000);
          // console.log(n1)
          const x1 = x % 5000;
          // console.log(x1);
          const n2 = Math.floor(x1 / 1000);
          // console.log(n2)
          const x2 = x1 % 1000;
          // console.log(x2);
          const n3 = Math.floor(x2 / 500);
          // console.log(n3);
          Price = n1 * 6887 + n2 * 1424 + n3 * 759;

          const planIdMap = {
            500: process.env.PLAN_B_500,
            1000: process.env.PLAN_B_1000, // 1L
            1500: process.env.PLAN_B_1500,
            2000: process.env.PLAN_B_2000,
            2500: process.env.PLAN_B_2500,
            3000: process.env.PLAN_B_3000,
            3500: process.env.PLAN_B_3500,
            4000: process.env.PLAN_B_4000,
            4500: process.env.PLAN_B_4500, // 4.5L
            5000: process.env.PLAN_B_5000, // 5L
          };

          // Determine the plan_id from the map based on the amountMultiplier
          if (x > 5000) {
            newplanId = process.env.SUBSCRIPTION_ID_BUFFALO; // Use default for amounts greater than 5L
          } else {
            newplanId = planIdMap[x]; // Default to 1L plan if not found
          }
        }

        user.subscriptionQuantity = newQuantity;
        user.subscriptionAmount = String(
          newQuantity > 5000 ? Math.round(Price / 100) * 100 : Price
        );
        await user.save();
        if (user) {
          // Update the date in your database
          const subscriptionDate = user.subscriptionStartDate;

          try {
            // Step 1: Cancel the old subscription if it exists
            if (user.subscriptionId) {
              const currentSubscription =
                await razorpayInstance.subscriptions.fetch(user.subscriptionId);

              if (currentSubscription.status !== "cancelled") {
                // Cancel the old subscription if it exists and is not canceled
                await razorpayInstance.subscriptions.cancel(
                  user.subscriptionId
                );
              } else {
                const msg = [
                  { text: "Your subscription is already cancelled!" },
                ];
                await sendMessage(msg, user.phoneNumber);
              }
            }

            // Step 2: Create a new subscription with the updated date
            const newSubscription = await razorpayInstance.subscriptions.create(
              {
                plan_id: newplanId, // Use the existing plan ID from the user data
                customer_notify: 1,
                total_count: 12, // Example: 12-month subscription
                quantity: newQuantity > 5000 ? Math.round(Price / 100) : 1, // Use calculated price or default quantity
                //   start_at: Math.floor(subscriptionDate.getTime() / 1000), // UNIX timestamp
                notes: {
                  phone: user.phone,
                  description: "Subscription with updated start date",
                  amount:
                    newQuantity > 5000 ? Math.round(Price / 100) * 100 : Price,
                },
              }
            );

            // Save the new subscription ID in the user's document
            user.subscriptionId = newSubscription.id;
            await user.save();

            // Step 3: Confirm success
            const message = {
              text: `🎉 Your subscription has been updated successfully! The new start date is ${subscriptionDate.toLocaleDateString()}.\nThe new Quantity is *${
                user.subscriptionQuantity
              }ml*.\nPlease complete your payment of ₹${
                user.subscriptionAmount
              } here: ${newSubscription.short_url} 💳`,
            };
            return await sendMessage(userPhone, message);
          } catch (error) {
            const errorMessage = {
              text: "❌ Failed to update the quantity.\nPlease try again later.",
            };
            console.log(error);

            return await sendMessage(userPhone, errorMessage);
          }
        } else {
          const errorMessage = {
            text: "🚫 No user found with this phone number.\nPlease check and try again.",
          };
          return await sendMessage(userPhone, errorMessage);
        }
      }
      if (state.useredit === "awaiting_cancel_subscription") {
        state.useredit = null; // Clear the user status
        await state.save();

        try {
          const user = await User.findOne({ phone: userPhone });

          if (!user) {
            return;
          }

          if (user.subscriptionId) {
            // Attempt to cancel the subscription using Razorpay API
            try {
              await razorpayInstance.subscriptions.cancel(user.subscriptionId);
              let msg;
              if (user.delivered) {
                 msg = {
                  text: `🎉 *Subscription Cancelled Successfully!* ✅\nWe're sorry to see you go, but thank you for using our service! 💙\nIf you ever want to continue, just type *Hi* and we’ll get you started again! 👋😊`,
                };
              } else {
                const msg = {
                  text: `🚚 Your order is already in transit and will be delivered by ${user.deliveryDate.toLocaleDateString()} this month. 📦\n\nWe're processing the cancellation of your subscription, and it will be fully canceled after your delivery. Thank you for using our service! 💙 If you wish to restart your subscription at any point, just type *Hi* and we’ll be happy to assist you again! 👋😊`,
                };
              }
              await sendMessage(userPhone, msg);
              // user.subscriptionStartDate = Date.now();
              user.subscriptionAmount += " cancelled";
              // user.deliveryDate = Date.now();
              user.nextReminderDate = Date.now();
              user.subscriptionQuantity += " cancelled";
              user.subscriptionType += " cancelled";
              user.subscription = false;
              user.subscriptionId =null;
              user.planId += " cancelled";
              user.subscriptionPaymentStatus = false;
              return await user.save();
            } catch (error) {}
          } else {
          }
        } catch (error) {}

        return;
      }

      // Handle different types of incoming messages
      if (
        messages.interactive &&
        messages.interactive.button_reply &&
        messageId
      ) {
        const buttonId = messages.interactive.button_reply.id; // Button ID the user clicked

        if (buttonId) {
          if (buttonId === "help" || buttonId === "helpp") {
            // Respond with an interactive menu for help
            const user = await User.findOne({ phone: userPhone });

            const message1 = {
              text: `Hi ${user.name}! 😊 We're thrilled to welcome you to the Nani's family! 💛 Get ready to experience the purest, most authentic ghee, made with love just for you. 🐄✨`,
              buttons: [
                { id: "buy_ghee", title: "Order Your Ghee" },
                { id: "customer_support", title: "Help & Support" },
                { id: "know_about_us", title: "Meet Nani’s Legacy" },
              ],
            };

            const message2 = {
              text: `Hi ${user.name}! 👀 Want to check your plans?`,
              buttons: [{ id: "view_plans", title: "See Plans" }],
            };

            const message3 = {
              text: "Hey there! 😊 Could you share your name with us to get started? 💛",
            };

            // Send the messages sequentially
            if (user.name) {
              await sendMessage(userPhone, message1);
              if (user.subscriptionPaymentStatus) {
                return await sendMessage(userPhone, message2);
              }
              return;
            } else {
              state.username = "taking_name";
              await state.save();
              return await sendMessage(userPhone, message3);
            }
          } else if (buttonId === "edit_date") {
            const state = await State.findOne({ userPhone });
            const dateprompt = {
              text: "⏰ Please enter the date you'd like to edit (format: YYYY-MM-DD).",
            };
            state.useredit = "awaiting_edit_date";
            await state.save();
            return await sendMessage(userPhone, dateprompt);
          } else if (buttonId === "edit_address_existing") {
            const state = await State.findOne({ userPhone });
            const prompt = {
              text: "🏠 Please enter your new address below.",
            };

            state.useredit = "awaiting_edit_address_existing";
            await state.save();
            return await sendMessage(userPhone, prompt);
          } else if (buttonId === "edit_quantity") {
            const message1 = {
              text: "🔢 Please enter the quantity in ml (Divisible by 500)",
            };

            await sendMessage(userPhone, message1);
            state.useredit = "awaiting_edit_quantity";
            return await state.save();
          } else if (buttonId === "cancel_subscription") {
            const message = {
              text: "❗ Are you sure you want to cancel your subscription?",
              buttons: [
                { id: "yes_cancel", title: "Yes, Cancel" },
                { id: "no_cancel", title: "No, Keep It" },
              ],
            };

            return await sendMessage(userPhone, message);
          } else if (buttonId === "old_address") {
            return await handleAddress(userPhone);
          } else if (buttonId === "new_address") {
            const state = await State.findOne({ userPhone });
            const user = await User.findOne({ phone: userPhone });

            if (state.planType.includes("plan")) {
              const message = {
                text: `🏠 Please provide your address to complete your subscription. \n \n📋 *Address Format:*\nName: [Your Name]\nHouse No/Street: [Your House/Street]\nCity: [Your City]\nState: [Your State]\nPincode: [Your Pincode]`,
              };

              await sendMessage(userPhone, message);
            } else {
              const message = {
                text: `🏠 Please provide your address to complete your payment. \n \n📋 *Address Format:*\nName: [Your Name]\nHouse No/Street: [Your House/Street]\nCity: [Your City]\nState: [Your State]\nPincode: [Your Pincode]`,
              };

              await sendMessage(userPhone, message);
            }

            state.useradd = "awaiting_address";
            return await state.save();
          } else if (buttonId === "ghee_prep") {
            const msg = {
              text: `At Nani's Bilona Ghee, we use the finest A2 hormone-free milk from Sahiwal cows, known for their strength and high-quality milk. 🐄 We follow the traditional Ayurvedic Bilona method to churn curd into rich butter (makhan), which is carefully heated to create pure, golden ghee. 🌟 Experience the richness and authenticity of our ghee, made with love and tradition. 💛 \n Video:https://www.youtube.com/watch?v=WBI_MhkNVKA&ab_channel=nani%27sbilonaghee`,
            };
            await sendMessage(userPhone, msg);
            const buttonMessage = {
              buttons: [
                {
                  id: "help",
                  title: "Go Back ◀",
                },
              ],
            };

            return await sendMessage(userPhone, buttonMessage);
          } else if (buttonId === "faq") {
            const msg1 = {
              text: `*🌟 An interesting fact about our ghee that signifies its purity!!* \nWe wanted to share some interesting information about our beloved Bilona Ghee. Did you know that our ghee's color changes depending on its temperature? When it's frozen, it appears white, and when it's warm, it turns into a beautiful yellow hue. This natural color transformation is a testament to the purity of our product - we never add any artificial colors or additives. Just pure goodness, straight from our heart to your home. 💛\n*🔥How is the taste of your ghee different from any other ghee in the market?* \nOur ghee is obtained by churning curd and not cream (malai). So the nutritional content is more as compared to others. Therefore our ghee tastes a lot tastier and aromatic because it preserves the all-natural nourishment of ghee. 🌱\n\n*🐄 What are cows being fed?* \nOur cows graze freely and are given natural fodder. The buttermilk obtained in ghee making is also given to our cows. We believe in a cruelty-free environment, and therefore we do not inject hormones in cows. 🐾\n\n*🔍 How can we identify pure cow ghee?* \nThe easiest method to check the purity is to do a pan test. Add a teaspoon of ghee to a pan and heat it. If the ghee starts melting immediately and turns dark brown, it is pure. However, if it takes time to melt and is yellow in color, then it is adulterated. 🔥\n\n*💧 What should the consistency of my ghee be?* \nGenerally, the consistency of ghee depends on the temperature at which you store it. At room temperature, it usually remains soft, and during winters, it solidifies. Depending on the temperature outside the jar, this process may happen quickly or slowly. It is perfectly normal for ghee to be liquid, solid, or a combination of consistencies. ❄️🌞\n\n*💸 Why is Nani Bilona Ghee costly as compared to other ghee?* \nNani's Bilona Ghee is a bit pricier because we make it using an ancient method called Bilona. This means we need about 28 to 35 liters of milk just to make 1 liter of ghee. The reason? Cow milk doesn't have much fat, so it takes more milk to make the ghee. Even though it's more work and needs more milk, we do it this way to keep the ghee pure and full of goodness. So, while it might cost a bit more, you're getting a ghee that's really special and made with care. ❤️`,
            };

            await sendMessage(userPhone, msg1);
            const buttonMessage = {
              buttons: [
                {
                  id: "help",
                  title: "Go Back ◀ ",
                },
              ],
            };
            return await sendMessage(userPhone, buttonMessage);
          } else if (buttonId === "contact") {
            const msg2 = {
              text: "contact",
            };
            await sendMessage(userPhone, msg2);
            const buttonMessage = {
              buttons: [
                {
                  id: "help",
                  title: "Go Back ◀ ",
                },
              ],
            };
            return await sendMessage(userPhone, buttonMessage);
          } else if (buttonId === "A2_ghee" || buttonId === "buffalo") {
            return await buttonHandlers.handleBuyGheeQuantity(
              userPhone,
              buttonId
            );
          } else if (buttonId.includes("_planA2")) {
            let amount = 1;

            if (buttonId === "small_planA2") amount *= 500;
            else if (buttonId === "medium_planA2") amount *= 1000;
            else if (buttonId === "large_planA2") amount *= 5000;
            else if (buttonId === "custom_planA2") {
              const state = await State.findOne({ userPhone });
              if (state) {
                state.userState = "awaiting_custom_amount_plan_A2";
                await state.save();
              }

              const message = {
                text: "🍯 Please enter the amount you'd like to order in ml(must be divisible by 500).",
              };

              return await sendMessage(userPhone, message);
            }
            const user = await User.findOne({ phone: userPhone });
            const state = await State.findOne({ userPhone });

            state.userAmount = amount;
            state.planType = "plan_A2";
            await state.save();
            if (user.address) {
              const buttonMessage = {
                text: `📍 to continue with this address for delivery?\n\n🏡 *Address:* ${user.address}\n ✅ *Confirm* or provide a new address to proceed!`,
                buttons: [
                  {
                    id: "old_address",
                    title: "old address",
                  },
                  {
                    id: "new_address",
                    title: "New Address",
                  },
                ],
              };

              return await sendMessage(userPhone, buttonMessage);
            }
            const message = {
              text: `🏠 Please provide your address to complete your subscription. \n📋 *Address Format:*\nName: [Your Name]\nHouse No/Street: [Your House/Street]\nCity: [Your City]\nState: [Your State]\nPincode: [Your Pincode]`,
            };

            if (state) {
              state.useradd = "awaiting_address";
              await state.save();
            }
            return await sendMessage(userPhone, message);
          } else if (buttonId.includes("_A2")) {
            let amount = 1;
            if (buttonId === "small_A2") amount *= 899 + 150;
            else if (buttonId === "medium_A2") amount *= 1699 + 150;
            else if (buttonId === "large_A2") amount *= 8250 + 250;
            else if (buttonId === "plan_A2") {
              return await buttonHandlers.handleBuyGheePlanQuantity(
                userPhone,
                buttonId
              );
            } else if (buttonId === "custom_A2") {
              const state = await State.findOne({ userPhone });
              if (state) {
                state.userState = "awaiting_custom_amount_A2";
                await state.save();
              }

              const message = {
                text: "🍯 Please enter the amount you'd like to order in ml(must be divisible by 500).",
              };

              return await sendMessage(userPhone, message);
            }
            const user = await User.findOne({ phone: userPhone });
            const state = await State.findOne({ userPhone });
            if (amount === 1049) user.userOrderQuantity = "500";
            else if (amount === 1849) user.userOrderQuantity = "1000";
            else if (amount === 8500) user.userOrderQuantity = "5000";
            user.userOrderType = "A2";
            state.userAmount = amount;
            state.planType = "A2";
            await state.save();
            await user.save();

            if (user.address) {
              const buttonMessage = {
                text: `📍 Would you like to continue with this address for delivery?\n\n🏡 *Address:* ${user.address}\n✅ *Confirm* or provide a new address to proceed!`,
                buttons: [
                  {
                    id: "old_address",
                    title: "Old address",
                  },
                  {
                    id: "new_address",
                    title: "New Address",
                  },
                ],
              };

              return await sendMessage(userPhone, buttonMessage);
            }
            const message = {
              text: `🏠 Please provide your address to complete your payment. \n\n📋 *Address Format:*\nName: [Your Name]\nHouse No/Street: [Your House/Street]\nCity: [Your City]\nState: [Your State]\nPincode: [Your Pincode]`,
            };
            state.useradd = "awaiting_address";
            await state.save();

            return await sendMessage(userPhone, message);
          } else if (buttonId.includes("_planbuffalo")) {
            let amount = 1;

            if (buttonId === "small_planbuffalo") amount *= 500;
            else if (buttonId === "medium_planbuffalo") amount *= 1000;
            else if (buttonId === "large_planbuffalo") amount *= 5000;
            else if (buttonId === "custom_planbuffalo") {
              const state = await State.findOne({ userPhone });
              if (state) {
                state.userState = "awaiting_custom_amount_plan_buffalo";
                await state.save();
              }

              const message = {
                text: "🍯 Please enter the amount you'd like to order in ml(must be divisible by 500).",
              };

              return await sendMessage(userPhone, message);
            }
            const user = await User.findOne({ phone: userPhone });
            const state = await State.findOne({ userPhone });

            state.userAmount = amount;
            state.planType = "plan_buffalo";
            await state.save();
            if (user.address) {
              const buttonMessage = {
                text: `📍 Hi ${user.name}! Would you like to continue with this address for delivery?\n\n🏡 *Address:* ${user.address}\n\n✅ *Confirm* or provide a new address to proceed!`,
                buttons: [
                  {
                    id: "old_address",
                    title: "Old Address",
                  },
                  {
                    id: "new_address",
                    title: "New Address",
                  },
                ],
              };

              return await sendMessage(userPhone, buttonMessage);
            }
            const message = {
              text: `🏠 Please provide your address to complete your payment. \n \n📋 *Address Format:*\nName: [Your Name]\nHouse No/Street: [Your House/Street]\nCity: [Your City]\nState: [Your State]\nPincode: [Your Pincode]`,
            };

            if (state) {
              state.useradd = "awaiting_address";
              await state.save();
            }
            return await sendMessage(userPhone, message);
          } else if (buttonId.includes("_buffalo")) {
            let amount = 1;
            if (buttonId === "small_buffalo") amount *= 799 + 150;
            else if (buttonId === "medium_buffalo") amount *= 1499 + 150;
            else if (buttonId === "large_buffalo") amount *= 7250 + 250;
            else if (buttonId === "plan_buffalo") {
              return await buttonHandlers.handleBuyGheePlanQuantity(
                userPhone,
                buttonId
              );
            } else if (buttonId == "custom_buffalo") {
              const state = await State.findOne({ userPhone });
              if (state) {
                state.userState = "awaiting_custom_amount_buffalo";
                await state.save();
              }

              const message = {
                text: "🍯 Please enter the amount you'd like to order in *ml*(must be divisible by 500).",
              };

              return await sendMessage(userPhone, message);
            }
            const user = await User.findOne({ phone: userPhone });
            const state = await State.findOne({ userPhone });
            if (amount === 949) user.userOrderQuantity = "500";
            else if (amount === 1649) user.userOrderQuantity = "1000";
            else if (amount === 7500) user.userOrderQuantity = "5000";
            user.userOrderType = "Buffalo";
            state.userAmount = amount;
            state.planType = "buffalo";
            await state.save();
            await user.save();

            if (user.address) {
              const buttonMessage = {
                text: `📍 Would you like to continue with this address for delivery?\n\n🏡 *Address:* ${user.address}\n  `,
                buttons: [
                  {
                    id: "old_address",
                    title: "Old Address",
                  },
                  {
                    id: "new_address",
                    title: "New Address",
                  },
                ],
              };

              return await sendMessage(userPhone, buttonMessage);
            }
            const message = {
              text: `🏠 Please provide your address to complete your payment. \n \n📋 *Address Format:*\nName: [Your Name]\nHouse No/Street: [Your House/Street]\nCity: [Your City]\nState: [Your State]\nPincode: [Your Pincode]`,
            };

            if (state) {
              state.useradd = "awaiting_address";
              await state.save();
            }
            return await sendMessage(userPhone, message);
          } else if (buttonId.includes("_address")) {
            const state = await State.findOne({ userPhone });
            if (buttonId === "edit_address") {
              const user = await User.findOne({ phone: userPhone });
              state.useradd = "awaiting_edit_address";
              await state.save();
              const message = {
                text: `🏠 Please provide your address to complete your payment. \n\n📋 *Address Format:*\nName: [Your Name]\nHouse No/Street: [Your House/Street]\nCity: [Your City]\nState: [Your State]\nPincode: [Your Pincode]`,
              };

              return await sendMessage(userPhone, message);
            } else if (buttonId === "same_address") {
              state.useradd = "awaiting_same_address";
              await state.save();
              const message = {
                text: "📍 We’re continuing with the same address for your delivery. Please hold on while we process your request... 🚚",
              };

              await sendMessage(userPhone, message);
              return await handleAddressInput("same address", userPhone);
            }
          } else if (buttonId === "buy_ghee") {
            return await buttonHandlers.handleBuyGhee(userPhone);
          } else if (buttonId === "customer_support") {
            // Call the handler for "Customer Support"
            return await buttonHandlers.handleCustomerSupport(userPhone);
          } else if (buttonId === "know_about_us") {
            // Call the handler for "B2B"
            return await buttonHandlers.handleknowaboutus(userPhone);
          } else if (buttonId === "view_plans") {
            const user = await User.findOne({ phone: userPhone });
            deliveryDate = user.deliveryDate;

            const msg = {
              text: `📦 Your current plan is: ${
                user.subscriptionType
              } Ghee with a quantity of ${
                user.subscriptionQuantity
              }ml.\nStarted on: ${user.subscriptionStartDate.toLocaleDateString()}\nScheduled delivery: ${deliveryDate.toLocaleDateString()}\n
            *Total amount*: ₹ ${user.subscriptionAmount}`,
              buttons: [
                { id: "edit_date", title: "Edit Date" },
                // { id: "edit_quantity", title: "Edit Qty" },
                { id: "edit_address_existing", title: "Edit Address" },
              ],
            };

            await sendMessage(userPhone, msg);
            const msg2 = {
              text: "❌ Do you want to cancel your subscription?\nPlease confirm below:",
              buttons: [{ id: "cancel_subscription", title: "Cancel" }],
            };

            return await sendMessage(userPhone, msg2);
          } else if (buttonId === "yes_cancel") {
            state.useredit = "awaiting_cancel_subscription";
            await state.save();
            const msg = {
              text: "❌ To cancel your subscription, simply reply with 'cancel'.",
            };

            return await sendMessage(userPhone, msg);
          } else if (buttonId === "no_cancel") {
            const msg = {
              text: "🚫 Subscription not cancelled. Type 'Hi' to get assistance!",
            };

            return await sendMessage(userPhone, msg);
          }
        }

        return; // Acknowledge receipt of the button interaction
      } else {
        // Default message if no recognized text
        resetUserState(userPhone);
        return await sendMessage(userPhone, {
          text: "💬 Need assistance? Click below for help!",
          buttons: [{ id: "help", title: "Get Help" }],
        });
      }
    }

    return;
  } catch (error) {
    console.log(error);

    return res.sendStatus(500); // Internal server error if something goes wrong
  }
};

async function handleAddress(userPhone) {
  const state = await State.findOne({ userPhone });
  if (state.planType === "plan_buffalo" || state.planType === "plan_A2") {
    message = {
      text: "🎉 Thank you for providing your address! Now, let us know the day (1-28) you'd like to receive your monthly Ghee delivery. 📅",
    };

    // Update user state to await subscription date

    state.useradd = "awaiting_subscription_date";
    await state.save();
    return await sendMessage(userPhone, message);
  } else {
    message = {
      text: "🎉 Thank you for providing your address! We’ll process your order and deliver it ASAP. 🚚",
    };
    await sendMessage(userPhone, message);
    if (state.planType === "A2")
      await createPayment_A2(userPhone, state.userAmount);
    if (state.planType === "buffalo")
      await createPayment_buffalo(userPhone, state.userAmount);
    state.planType = null;
    return await state.save();
  }
}

// Function to process custom amount input from the user
async function handleCustomAmountInput_A2(messageText, userPhone) {
  let amount = parseInt(messageText); // Convert input to a number

  if (isNaN(amount) || amount <= 0 || amount % 500 != 0 || amount > 5000) {
    // Send error message if the input is not a valid positive number
    const errorMessage = {
      text: "⚠️ Please enter a valid amount in ml. Ensure it’s a number divsible by 500. \n*It must be less than 5000*",
    };
    return await sendMessage(userPhone, errorMessage);
  }
  let quantity = amount;

  const x = amount;
  const n1 = Math.floor(x / 5000);
  // console.log(n1)
  const x1 = x % 5000;
  // console.log(x1);
  const n2 = Math.floor(x1 / 1000);
  // console.log(n2)
  const x2 = x1 % 1000;
  // console.log(x2);
  const n3 = Math.floor(x2 / 500);
  // console.log(n3);

  let Price = n1 * 8250 + n2 * 1699 + n3 * 899;
  //console.log(Price);
  if (x >= 6000) Price += 500;
  else if (x < 6000 && x >= 3000) Price += 250;
  else Price += 150;
  let totalPrice = Price;

  const user = await User.findOne({ phone: userPhone });
  const state = await State.findOne({ userPhone });
  user.userOrderType = "A2";
  user.userOrderQuantity = quantity;
  state.userState = null;
  state.userAmount = totalPrice;
  state.planType = "A2";
  await state.save();
  await user.save();
  if (user.address) {
    const buttonMessage = {
      text: `📍 Would you like to continue with this address for delivery?\n\n🏡 *Address:* ${user.address}\n`,
      buttons: [
        {
          id: "old_address",
          title: "Same Address",
        },
        {
          id: "new_address",
          title: "New Address",
        },
      ],
    };
    return await sendMessage(userPhone, buttonMessage);
  }
  const message = {
    text: `🏠 Please provide your address to complete your subscription. \n *Delivery fees Applied *Address Format:*\nName: [Your Name]\nHouse No/Street: [Your House/Street]\nCity: [Your City]\nState: [Your State]\nPincode: [Your Pincode]`, // Adding amount
  };

  if (state) {
    state.useradd = "awaiting_address";
    await state.save();
  }
  return await sendMessage(userPhone, message);
}

async function handleCustomAmountInput_buffalo(messageText, userPhone) {
  let amount = parseInt(messageText); // Convert input to a number

  if (isNaN(amount) || amount <= 0 || amount % 500 != 0 || amount > 5000) {
    // Send error message if the input is not a valid positive number
    const errorMessage = {
      text: "⚠️ Please enter a valid amount in ml. Ensure it’s a number divsible by 500. \n*It must be less than 5000*",
    };
    return await sendMessage(userPhone, errorMessage);
  }
  let quantity = amount;
  const x = amount;
  const n1 = Math.floor(x / 5000);
  // console.log(n1)
  const x1 = x % 5000;
  // console.log(x1);
  const n2 = Math.floor(x1 / 1000);
  // console.log(n2)
  const x2 = x1 % 1000;
  // console.log(x2);
  const n3 = Math.floor(x2 / 500);
  // console.log(n3);

  let Price = n1 * 7250 + n2 * 1499 + n3 * 799;
  //console.log(Price);
  if (x >= 6000) Price += 500;
  else if (x < 6000 && x >= 3000) Price += 250;
  else Price += 150;
  let totalPrice = Price;

  const user = await User.findOne({ phone: userPhone });
  const state = await State.findOne({ userPhone });
  user.userOrderType = "Buffalo";
  user.userOrderQuantity = quantity;
  state.userState = null;
  state.userAmount = totalPrice;

  state.planType = "buffalo";
  await state.save();
  await user.save();
  if (user.address) {
    const buttonMessage = {
      text: `📍 Would you like to continue with this address for delivery?\n\n🏡 *Address:* ${user.address}\n**Confirm* or provide a new address to proceed!`,
      buttons: [
        {
          id: "old_address",
          title: "Same Address",
        },
        {
          id: "new_address",
          title: "New Address",
        },
      ],
    };
    return await sendMessage(userPhone, buttonMessage);
  }
  const message = {
    text: `🏠 Please provide your address to complete your subscription. \n \n📋 *Address Format:*\nName: [Your Name]\nHouse No/Street: [Your House/Street]\nCity: [Your City]\nState: [Your State]\nPincode: [Your Pincode]`,
  };
  if (state) {
    state.useradd = "awaiting_address";
    await state.save();
  }
  return await sendMessage(userPhone, message);
}

// Custom amount input handler for Buffalo Ghee
async function handleCustomAmountInput_plan_buffalo(messageText, userPhone) {
  let amount = parseInt(messageText); // Convert input to a number
  amount *= 1;

  if (isNaN(amount) || amount <= 0 || amount % 500 !== 0 || amount > 5000) {
    const errorMessage = {
      text: "⚠️ Please enter a valid amount in ml. Ensure it’s a number divsible by 500. *It must be less than 5000*",
    };
    return await sendMessage(userPhone, errorMessage);
  }
  const user = await User.findOne({ phone: userPhone });
  const state = await State.findOne({ userPhone });
  state.userState = null;
  state.userAmount = amount;

  state.planType = "plan_buffalo";
  await state.save();
  if (user.address) {
    const buttonMessage = {
      text: `📍 Want to continue with your current address: ${user.address}? \n *Address Format:*\nName:\nHouse No/Street:\nCity:\nState:\nPincode:`,
      buttons: [
        {
          id: "old_address",
          title: "Same Address",
        },
        {
          id: "new_address",
          title: "New Address",
        },
      ],
    };
    return await sendMessage(userPhone, buttonMessage);
  }
  const message = {
    text: `🏠 Please provide your address to complete your subscription. \n *Address Format:*\nName: [Your Name]\nHouse No/Street: [Your House/Street]\nCity: [Your City]\nState: [Your State]\nPincode: [Your Pincode]`,
  };
  if (state) {
    state.useradd = "awaiting_address";
    await state.save();
  }
  return await sendMessage(userPhone, message);
}

// Custom amount input handler for A2 Cow Ghee
async function handleCustomAmountInput_plan_A2(messageText, userPhone) {
  let amount = parseInt(messageText); // Convert input to a number
  amount *= 1;

  if (isNaN(amount) || amount <= 0 || amount % 500 !== 0 || amount > 5000) {
    const errorMessage = {
      text: "⚠️ Please enter a valid amount in ml. Ensure it’s a number divsible by 500. *It must be less than 5000*",
    };
    return await sendMessage(userPhone, errorMessage);
  }
  const user = await User.findOne({ phone: userPhone });
  const state = await State.findOne({ userPhone });
  state.userState = null;
  state.userAmount = amount;

  state.planType = "plan_A2";
  await state.save();
  if (user.address) {
    const buttonMessage = {
      text: `📍 Want to continue with your current address: ${user.address}?  *Address Format:*\nName:\nHouse No/Street:\nCity:\nState:\nPincode:`,
      buttons: [
        {
          id: "old_address",
          title: "Same Address",
        },
        {
          id: "new_address",
          title: "New Address",
        },
      ],
    };
    return await sendMessage(userPhone, buttonMessage);
  }
  const message = {
    text: `🏠 Please provide your address to complete your subscription. \n📋 *Address Format:*\nName: [Your Name]\nHouse No/Street: [Your House/Street]\nCity: [Your City]\nState: [Your State]\nPincode: [Your Pincode]`,
  };
  if (state) {
    state.useradd = "awaiting_address";
    await state.save();
  }
  return await sendMessage(userPhone, message);
}

// Initialize Razorpay with your API credentials
const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function createPayment_A2(userPhone, amount) {
  const description = "Purchase of Ghee";
  try {
    const paymentLink = await generatePaymentLinkWithDivision(
      amount,
      userPhone,
      description
    );
    const user = await User.findOne({ phone: userPhone });
    const baseAmount = amount; // This includes the delivery fee in ₹.
    const userOrderQuantity = parseInt(user.userOrderQuantity, 10); // Convert quantity to integer (in ml).
    let deliveryFee = 0;

    // Determine delivery fee based on quantity.
    if (userOrderQuantity >= 6000) {
      deliveryFee = 500; // ₹500 for ≥6000ml.
    } else if (userOrderQuantity >= 3000) {
      deliveryFee = 250; // ₹250 for >3000ml.
    } else if (baseAmount < 3000) {
      // Less than ₹3000.
      deliveryFee = 150; // ₹150 for orders less than ₹3000.
    }

    // Deduct delivery fee from base amount to calculate product cost.
    const productCost = baseAmount - deliveryFee;

    const message = {
      text: `🧾 *Your Bill Details*:\n
    Product Quantity: *${userOrderQuantity}ml* A2 Cow ghee\n
    Product Cost: *₹${productCost.toFixed(2)}*\n
    Delivery Fee: *₹${deliveryFee.toFixed(2)}*\n
    ——————————————\n
    *Total Amount: ₹${baseAmount.toFixed(2)}*\n
   ——————————————\n
    You can pay here: ${paymentLink}`,
    };

    const state = await State.findOne({ userPhone });
    state.userState = null;
    state.useradd = null;
    state.planType = null;
    state.useredit = null;
    state.username = null;
    state.userAmount = null;
    await state.save();

    return await sendMessage(userPhone, message);
  } catch (error) {
    return;
  }
}

async function createPayment_buffalo(userPhone, amount) {
  const description = "Purchase of Ghee";
  try {
    const paymentLink = await generatePaymentLinkWithDivision(
      amount,
      userPhone,
      description
    );
    const user = await User.findOne({ phone: userPhone });
    const baseAmount = amount; // This includes the delivery fee in ₹.
    const userOrderQuantity = parseInt(user.userOrderQuantity, 10); // Convert quantity to integer (in ml).
    let deliveryFee = 0;

    // Determine delivery fee based on quantity.
    if (userOrderQuantity >= 6000) {
      deliveryFee = 500; // ₹500 for ≥6000ml.
    } else if (userOrderQuantity >= 3000) {
      deliveryFee = 250; // ₹250 for >3000ml.
    } else if (baseAmount < 3000) {
      // Less than ₹3000.
      deliveryFee = 150; // ₹150 for orders less than ₹3000.
    }

    // Deduct delivery fee from base amount to calculate product cost.
    const productCost = baseAmount - deliveryFee;

    const message = {
      text: `🧾 *Your Bill Details*:\nProduct Quantity:Indian Buffalo Ghee *${userOrderQuantity}ml* Indian Buffalo Ghee\nProduct Cost: *₹${productCost.toFixed(
        2
      )}*\nDelivery Fee: *₹${deliveryFee.toFixed(
        2
      )}*\n——————————————\n*Total Amount: ₹${baseAmount.toFixed(
        2
      )}*\n——————————————\nYou can pay here: ${paymentLink}`,
    };
    const state = await State.findOne({ userPhone });
    state.userState = null;
    state.useradd = null;
    state.planType = null;
    state.useredit = null;
    state.username = null;
    state.userAmount = null;
    await state.save();

    return await sendMessage(userPhone, message);
  } catch (error) {
    return;
  }
}

async function createSubscriptionA2(userPhone, amountMultiplier) {
  const description = "Monthly Subscription of A2 Cow Ghee";

  // Calculate pricing logic for different quantities
  const x = amountMultiplier;
  const n1 = Math.floor(x / 5000);
  const x1 = x % 5000;
  const n2 = Math.floor(x1 / 1000);
  const x2 = x1 % 1000;
  const n3 = Math.floor(x2 / 500);

  let Price = n1 * 7837 + n2 * 1614 + n3 * 854;

  // Map plan IDs dynamically for quantities ranging from 1L to 5L and above
  const planIdMap = {
    500: process.env.PLAN_A2_500,
    1000: process.env.PLAN_A2_1000, // 1L
    1500: process.env.PLAN_A2_1500,
    2000: process.env.PLAN_A2_2000,
    2500: process.env.PLAN_A2_2500,
    3000: process.env.PLAN_A2_3000,
    3500: process.env.PLAN_A2_3500,
    4000: process.env.PLAN_A2_4000,
    4500: process.env.PLAN_A2_4500, // 4.5L
    5000: process.env.PLAN_A2_5000, // 5L
  };
console.log(process.env.PLAN_A2_1000);

  // Determine the plan_id from the map based on the amountMultiplier
  let planId;
  if (amountMultiplier > 5000) {
    planId = process.env.SUBSCRIPTION_ID_A2; // Use default for amounts greater than 5L
  } else {
    planId = planIdMap[amountMultiplier]; // Default to 1L plan if not found
  }

  try {
    // Create the subscription using Razorpay
    const subscription = await razorpayInstance.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 12, // Example: 12-month subscription
      quantity: amountMultiplier > 5000 ? Math.round(Price / 100) : 1, // Use calculated price or default quantity
      notes: {
        phone: userPhone,
        description: description,
        amount: amountMultiplier > 5000 ? Math.round(Price / 100) * 100 : Price,
      },
    });

    // Update the user record with subscription details
    const user = await User.findOneAndUpdate(
      { phone: userPhone },
      { planId: planId },
      { new: true }
    );

    if (user) {
      user.subscription = true;
      user.subscriptionQuantity = String(amountMultiplier);
      user.subscriptionType = "A2 Cow"; // Future issue may arise due to space
      user.subscriptionAmount = String(
        amountMultiplier > 5000 ? Math.round(Price / 100) * 100 : Price
      );
    }

    const reminderDate = new Date(user.deliveryDate);
    reminderDate.setMonth(reminderDate.getMonth() + 1); // Advance by one month
    reminderDate.setDate(reminderDate.getDate() - 7);

    // Save the calculated reminder date
    user.nextReminderDate = reminderDate;
    await user.save();
    let newPrice =
      amountMultiplier > 5000 ? Math.round(Price / 100) * 100 : Price;
    // Send subscription confirmation message to the user
    const message = {
      text:
        `You have now subscribed to **Our Monthly Plan of A2 Cow Ghee. 🎉**\n\n` +
        `Your subscription will start on **${user.subscriptionStartDate.toLocaleDateString()}**. Every month, ₹${newPrice} will be automatically deducted from your bank account on the subscription date. 💳\n\n` +
        `Your first delivery is expected on or around **${user.deliveryDate.toLocaleDateString()}**. 📦\n\n` +
        `**Total Price: ₹${newPrice}**\n\n` +
        `Please complete your payment here to activate your subscription: **${subscription.short_url}**\n\n` +
        `**Note:** Payment confirmation and details will be sent to you within **3-5 minutes**. Please hold on. 🙏`,
    };

    await sendMessage(userPhone, message);

    const state = await State.findOne({ userPhone });
    state.userState = null;
    state.useradd = null;
    state.planType = null;
    state.useredit = null;
    state.username = null;
    state.userAmount = null;
    await state.save();

    // Notify the admin of subscription and payment link creation
    const adminPhone = process.env.ADMIN_PHONE || "YOUR_ADMIN_PHONE_NUMBER"; // Replace with your admin phone or load from env
    const adminMessage = {
      text: `Subscription created for ${userPhone}. Payment link: ${subscription.short_url}. Delivery in 4-5 days.`,
    };

    return await sendMessage(adminPhone, adminMessage);
  } catch (error) {
    // Send failure message to user
    const errorMessage = {
      text: "Failed to create subscription. Please try again later.",
    };
    await sendMessage(userPhone, errorMessage);
    console.log(error);

    // Notify the admin of subscription creation failure
    const adminPhone = process.env.ADMIN_PHONE || "YOUR_ADMIN_PHONE_NUMBER"; // Replace with your admin phone or load from env
    const adminMessage = {
      text: `Alert: Subscription creation failed for ${userPhone}. Error: ${
        error.response ? error.response.data.description : error.message
      }`,
    };
    return await sendMessage(adminPhone, adminMessage);
  }
}

async function createSubscriptionBuffalo(userPhone, amountMultiplier) {
  const description = "Monthly Subscription of Buffalo Ghee";

  //this is aaplicable if above 5000 and then use 100rs. per quantity logic
  const x = amountMultiplier;
  const n1 = Math.floor(x / 5000);
  // console.log(n1)
  const x1 = x % 5000;
  // console.log(x1);
  const n2 = Math.floor(x1 / 1000);
  // console.log(n2)
  const x2 = x1 % 1000;
  // console.log(x2);
  const n3 = Math.floor(x2 / 500);
  // console.log(n3);

  let Price = n1 * 6887 + n2 * 1424 + n3 * 759;

  const planIdMap = {
    500: process.env.PLAN_B_500,
    1000: process.env.PLAN_B_1000, // 1L
    1500: process.env.PLAN_B_1500,
    2000: process.env.PLAN_B_2000,
    2500: process.env.PLAN_B_2500,
    3000: process.env.PLAN_B_3000,
    3500: process.env.PLAN_B_3500,
    4000: process.env.PLAN_B_4000,
    4500: process.env.PLAN_B_4500, // 4.5L
    5000: process.env.PLAN_B_5000, // 5L
  };

  // Determine the plan_id from the map based on the amountMultiplier
  let planId;
  if (amountMultiplier > 5000) {
    planId = process.env.SUBSCRIPTION_ID_BUFFALO; // Use default for amounts greater than 5L
  } else {
    planId = planIdMap[amountMultiplier]; // Default to 1L plan if not found
  }
  try {
    // Create the subscription using Razorpay
    const subscription = await razorpayInstance.subscriptions.create({
      plan_id: planId,
      customer_notify: 1, // This will still notify the customer (default behavior)
      total_count: 12, // Example: 12-month subscription
      quantity: amountMultiplier > 5000 ? Math.round(Price / 100) : 1, // Use calculated price or default quantity
      notes: {
        phone: userPhone,
        description: description,
        amount: amountMultiplier > 5000 ? Math.round(Price / 100) * 100 : Price,
      },
    });

    // Update the user record with subscription details
    const user = await User.findOneAndUpdate(
      { phone: userPhone },
      { planId: process.env.SUBSCRIPTION_ID_BUFFALO },
      { new: true }
    );

    if (user) {
      user.subscription = true;
      user.subscriptionQuantity = String(amountMultiplier);
      user.subscriptionType = "Buffalo";
      user.subscriptionAmount = String(
        amountMultiplier > 5000 ? Math.round(Price / 100) * 100 : Price
      );
    }

    const reminderDate = new Date(user.deliveryDate);
    reminderDate.setMonth(reminderDate.getMonth() + 1); // Advance by one month
    reminderDate.setDate(reminderDate.getDate() - 7); // Set to 7 days before the next cycle // Set reminder 7 days before next cycle

    // Save the calculated reminder date
    user.nextReminderDate = reminderDate;
    await user.save();
    let newPrice =
      amountMultiplier > 5000 ? Math.round(Price / 100) * 100 : Price;
    // Send subscription confirmation message to the user
    const message = {
      text:
        `You have now subscribed to **Our Monthly Plan of Indian Buffalo Ghee. 🎉**\n\n` +
        `Your subscription will start on **${user.subscriptionStartDate.toLocaleDateString()}** and will be delivered to the address: **${
          user.address
        }** 📦\n\n` +
        `Your first delivery is expected on or around **${user.deliveryDate.toLocaleDateString()}**.\n` +
        `**Total Price: ₹${newPrice}**\n` +
        `Please complete your payment here to activate: **${subscription.short_url} 💳**\n\n` +
        `**Note:** Payment confirmation and details will be sent to you within **3-5 minutes**. Please hold on. 🙏\n
              *You can view your plan and edit its details anytime by typing 'Hi' and clicking on *View Your Plans**`,
    };

    await sendMessage(userPhone, message);

    const state = await State.findOne({ userPhone });
    state.userState = null;
    state.useradd = null;
    state.planType = null;
    state.useredit = null;
    state.username = null;
    state.userAmount = null;
    await state.save();

    // Notify the admin of subscription and payment link creation
    const adminPhone = process.env.ADMIN_PHONE || "YOUR_ADMIN_PHONE_NUMBER"; // Replace with your admin phone or load from env
    const adminMessage = {
      text: `Subscription created for ${userPhone}. Payment link: ${subscription.short_url}. Subscription ID: ${subscription.id}`,
    };
    return await sendMessage(adminPhone, adminMessage);
  } catch (error) {
    // Send failure message to user
    const errorMessage = {
      text: "Failed to create subscription. Please try again later.",
    };
    await sendMessage(userPhone, errorMessage);

    // Notify the admin of subscription creation failure
    const adminPhone = process.env.ADMIN_PHONE || "YOUR_ADMIN_PHONE_NUMBER"; // Replace with your admin phone or load from env
    const adminMessage = {
      text: `Alert: Subscription creation failed for ${userPhone}. Error: ${
        error.response ? error.response.data.description : error.message
      }`,
    };
    return await sendMessage(adminPhone, adminMessage);
  }
}

// Handle address input
async function handleAddressInput(messageText, userPhone) {
  const user = await User.findOne({ phone: userPhone });
  const state = await State.findOne({ userPhone });
  if (
    state.useradd === "awaiting_address" ||
    state.useradd === "awaiting_edit_address"
  ) {
    // const user = await User.findOne({ phone: userPhone });

    if (user) {
      user.address = messageText;
      await user.save();
    }
  }

  if (state.useradd === "awaiting_address") {
    state.useradd = null;
    await state.save();
    const rewriteAddress = {
      text: `📍 Want to continue with your address: ${user.address}?\n\nOr would you like to edit your address? ✏️\n  *Address Format:*\nName:\nHouse No/Street:\nCity:\nState:\nPincode:`,
      buttons: [
        {
          id: "edit_address",
          title: "Edit Address",
        },
        {
          id: "same_address",
          title: "Same Address",
        },
      ],
    };

    return await sendMessage(userPhone, rewriteAddress);
  }

  if (
    state.useradd === "awaiting_same_address" ||
    state.useradd === "awaiting_edit_address"
  ) {
    let message;

    if (state.planType === "plan_buffalo" || state.planType === "plan_A2") {
      const today = new Date();
      const nextMonth = new Date(today);
      nextMonth.setMonth(today.getMonth() + 1);

      const message = {
        text: `Thank you for providing your address! 🙏\nNow, please select a day (1-28) for your delivery. You can choose a day from *${today.toLocaleDateString()}* onwards, or pick a day before today in the next month *(${nextMonth.toLocaleDateString()})*. 📅`,
      };

      // Update user state to await subscription date

      state.useradd = "awaiting_subscription_date";
      await state.save();
      return await sendMessage(userPhone, message);
    } else {
      state.useradd = null;
      message = {
        text: `Thank you for sharing your address! 🙏\nYour order will reach you in *4-5 days*. 🚚💨 We appreciate your patience! 😊`,
      };
      //  await sendMessage(userPhone, message);
      if (state.planType === "A2")
        await createPayment_A2(userPhone, state.userAmount);
      if (state.planType === "buffalo")
        await createPayment_buffalo(userPhone, state.userAmount);
      state.planType = null;
      return await state.save();
    }
  }
  return;
}

// // Handle subscription date input
// async function handleSubscriptionDateInput(messageText, userPhone) {
//   const dayOfMonth = parseInt(messageText, 10);

//   // Validate that the input is a valid day of the month (1-31)
//   if (isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 29) {
//     const errorMessage = {
//       text: "Please enter a valid day of the month (e.g., 1-28).",
//     };
//     return await sendMessage(userPhone, errorMessage);
//   }

//   // Find the user in the database
//   const user = await User.findOne({ phone: userPhone });
//   const state = await State.findOne({ userPhone });
//   state.useradd = null;
//   if (user) {
//     // Determine the next delivery date based on the entered day
//     const today = new Date();
//     let deliveryDate = new Date(
//       today.getFullYear(),
//       today.getMonth(),
//       dayOfMonth
//     );

//     // If the chosen day has already passed this month, set delivery to next month
//     if (deliveryDate < today) {
//       deliveryDate.setMonth(today.getMonth() + 1);
//     }

//     const subscriptionDate = new Date();

//     // Save the user's preferred day and the calculated first delivery date
//     user.deliveryDate = deliveryDate;
//     user.subscriptionStartDate = subscriptionDate;
//     await user.save();
//   }

//   // Send confirmation message to the user
//   const message = {
//     text: `Your subscription deliveries will begin on ${user.subscriptionStartDate.toLocaleDateString()}.\n\nFrom then on, deliveries will be made on the ${dayOfMonth} of each month.`,
//   };
//   await sendMessage(userPhone, message);

//   // Create subscription after collecting all required info
//   if (state.planType === "plan_A2") {
//     await createSubscriptionA2(userPhone, state.userAmount);
//   } else if (state.planType === "plan_buffalo") {
//     await createSubscriptionBuffalo(userPhone, state.userAmount);
//   }
//   state.planType = null;
//   return await state.save();
// }

async function handleSubscriptionDateInput(messageText, userPhone) {
  try {
    const dayOfMonth = parseInt(messageText, 10);

    // Validate that the input is a valid day of the month (1-28)
    if (isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) {
      const today = new Date();
      const fourDaysLater = new Date(today);
      fourDaysLater.setDate(today.getDate() + 4);
      const errorMessage = {
        text: `Please pick a day between 1 and 28 that is at least 4 days from today (${today.toLocaleDateString()}). You can choose any day from ${fourDaysLater.toLocaleDateString()} onwards.`,
      };
      return await sendMessage(userPhone, errorMessage);
    }

    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Calculate the earliest allowed date (4 days from now)
    const minAllowedDate = new Date(currentYear, currentMonth, currentDay + 4);

    // Determine if the entered date is in the current month or the next month
    const deliveryDateCurrentMonth = new Date(
      currentYear,
      currentMonth,
      dayOfMonth
    );
    const deliveryDateNextMonth = new Date(
      currentYear,
      currentMonth + 1,
      dayOfMonth
    );

    let selectedDate;

    // Allow delivery date in the current month only if it's after minAllowedDate
    if (deliveryDateCurrentMonth >= minAllowedDate) {
      selectedDate = deliveryDateCurrentMonth;
    }
    // Allow delivery date in the next month if it's before the current date of the next month
    else if (dayOfMonth < currentDay) {
      selectedDate = deliveryDateNextMonth;
    }

    // If no valid date is found, send an error message
    if (!selectedDate) {
      const today = new Date();
      const fourDaysLater = new Date(today);
      fourDaysLater.setDate(today.getDate() + 4);

      const errorMessage = {
        text: `*Invalid date* \n Please choose a delivery date that is at least 4 days from today (${today.toLocaleDateString()}) or a date before today in the next month.`,
      };

      return await sendMessage(userPhone, errorMessage);
    }

    // Save selected date in the database
    const user = await User.findOne({ phone: userPhone });
    const state = await State.findOne({ userPhone });
    state.useradd = null;

    if (user) {
      const subscriptionDate = new Date();

      // Save user's preferred day and the calculated first delivery date
      user.deliveryDate = selectedDate;
      user.subscriptionStartDate = subscriptionDate;
      await user.save();
    }

    // Send confirmation message to the user
    const message = {
      text: `Your subscription deliveries will begin on ${selectedDate.toLocaleDateString()}.\n\nFrom then on, deliveries will be made on the ${dayOfMonth} of each month.`,
    };
    await sendMessage(userPhone, message);

    // Create subscription after collecting all required info
    if (state.planType === "plan_A2") {
      await createSubscriptionA2(userPhone, state.userAmount);
    } else if (state.planType === "plan_buffalo") {
      await createSubscriptionBuffalo(userPhone, state.userAmount);
    }
    state.planType = null;
    return await state.save();
  } catch (error) {
    console.error("Error handling subscription date input:", error);
    const errorMessage = {
      text: "Oops! Something went wrong while processing your request. Please try again later.",
    };
    await sendMessage(userPhone, errorMessage);
  }
}
