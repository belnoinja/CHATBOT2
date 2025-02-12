const { sendMessage } = require('../utils/whatsappAPI');
const User = require('../models/User');  // Import your User model

// Handle Buy Ghee selection
exports.handleBuyGhee = async (userPhone) => {
  const buttonMessage = {
    text: "✨ Please choose the variety of Ghee you would like to purchase: ✨",
    buttons: [
      {
        id: "A2_ghee",
        title: "A2 Cow Ghee"
      },
      {
        id: "buffalo",
        title: "Indian Buffalo Ghee"
      }
    ]
  };
  return await sendMessage(userPhone, buttonMessage);
};

exports.handleBuyGheeQuantity = async(userPhone, buttonId) => {
  const user= await User.findOne({phone:userPhone});

  // Handle A2_ghee selection
  if (buttonId === "A2_ghee") {
    const quantityMessage = {
      text: "🎉 You selected A2 Cow Ghee! Please choose the quantity you'd like to purchase:\n Delivery Fee :\n ₹150 for orders upto 3L\n ₹250 for orders above 3L",
      buttons: [
        {
          id: "small_A2",
          title: "500ml - ₹899 "
        },
        {
          id: "medium_A2",
          title: "1L - ₹1699"
        },
        {
          id: "large_A2",
          title: "5L - ₹8250"
        },
      ]
    };
    
    const customOrderMessage = {
      text: "✍️ If you'd like to order a custom quantity, please select this option:",
      buttons: [
        {
          id: "custom_A2",
          title: "Custom Amount"
        },
      ]
    };


    // const planOrderMessage = {
    //   text: "🎉 Subscribe to our monthly plan and enjoy **5% off** + **NO delivery fee**! 🚚✨ Click here to learn more!",
    //   buttons: [
    //     {
    //       id: "plan_A2",
    //       title: "Monthly Plan"
    //     },
    //   ]
    // }

    // Send quantity options for A2 Ghee
    await sendMessage(userPhone, quantityMessage);
    await sendMessage(userPhone, customOrderMessage);
    // if(!user.subscriptionPaymentStatus){
    //     await sendMessage(userPhone, planOrderMessage);
    // }
    return;
  }

  // Handle buffalo selection
  if (buttonId === "buffalo") {
    const quantityMessage = {
      text: "🎉 You selected Buffalo Ghee! Please choose the quantity you'd like to purchase: \n Delivery Fee :\n ₹150 for orders upto 3L\n ₹250 for orders above 3L",
      buttons: [
        {
          id: "small_buffalo",
          title: "500ml - ₹799"
        },
        {
          id: "medium_buffalo",
          title: "1L - ₹1499"
        },
        {
          id: "large_buffalo",
          title: "5L - ₹7250"
        }
      ],
      
    };

    const customOrderMessage = {
      text: "✍️ If you'd like to order a custom quantity, please select this option:",
      buttons: [
        {
          id: "custom_buffalo",
          title: "Custom Amount"
        },
      ]
    };

    // const planOrderMessage = {
    //   text: "🎉 Subscribe to our monthly plan and enjoy **5% off** + **NO delivery fee**! 🚚✨ Click here to learn more!",
    //   buttons: [
    //     {
    //       id: "plan_buffalo",
    //       title: "Monthly Plan"
    //     },
    //   ]
    // }

    // Send quantity options for Buffalo Ghee
    await sendMessage(userPhone, quantityMessage);
    await sendMessage(userPhone, customOrderMessage);
  //   if(!user.subscriptionPaymentStatus){
  //     await sendMessage(userPhone, planOrderMessage);
  // }
  return;    
  }
 
};


exports.handleCustomerSupport = async (userPhone) => {

  const adminPhone = process.env.ADMIN_PHONE || "YOUR_ADMIN_PHONE_NUMBER"; 
  const user= await User.findOne({phone:userPhone});
  const adminMessage = {
    text: `Customer Support required for  name:${user.name} phone : ${userPhone}.`,
  };


  // Send initial support message
  const supportMessage = {
    text: "💬 Our support team is here to assist you. We will contact you within 24 hours."
  };

  // Send button options for support
  const buttonMessage = {
    buttons: [
      {
        id: "help",
        title: "Go Back ◀"
      }
    ]
  };

  await sendMessage(adminPhone, adminMessage);
  await sendMessage(userPhone, supportMessage);
  return await sendMessage(userPhone, buttonMessage);
  
};


// Handle B2B selection
exports.handleknowaboutus = async (userPhone) => {
  const b2bMessage = {
    text: `Growing up in the peaceful *village* of Pilimandhopri, Haryana, my fondest memories are from my nani’s kitchen. 🍽️ Her churma, made with love and homemade cow ghee, was always the highlight of family visits. 🐄
  As I grew older, I realized the incredible health benefits of ghee and its importance in our culture. 🌟 Inspired by my childhood and nani's wisdom, I created Nani’s Bilona Ghee to share the purity and love of her kitchen with the world.
  At Nani's Bilona Ghee, we promise to preserve tradition, promote wellness, and deliver only the highest quality ghee. 🌼 Join us in this delicious journey! 🧑‍🍳
  – Amandeep Sigar, Founder of Nani’s Bilona Ghee`,
    buttons: [
      { id: "ghee_prep", title: "Ghee making" },
      { id: "faq", title: "FAQs" },
      // { id: "contact", title: "Contact Us" }
    ]
  };
  
  await sendMessage(userPhone, b2bMessage);
  const msg={
    buttons:[
      {id:"helpp", title:"Go Back ◀"}
    ]
  }
  return await sendMessage(userPhone, msg);
  // Send button message for B2B interaction
 
};


exports.handleBuyGheePlanQuantity = async(userPhone,buttonId) => {
  if (buttonId === "plan_A2") {
    const quantityMessage = {
      text: `🎉 You've made a great choice with *A2 Cow Ghee*! 🌟\n\nSelect the quantity you'd like to purchase— *NO delivery charges applied* 🚚\n\n💡 Plus, enjoy *monthly ghee delivery* without any hustle. We've got you covered! 🛍️`,
      buttons: [
        {
          id: "small_planA2",
          title: `500ml 1̶0̶4̶9̶  ₹854`
        },
        {
          id: "medium_planA2",
          title: `1L 1̶8̶4̶9̶  ₹1614`
        },
        {
          id: "large_planA2",
          title: `5L 8̶5̶0̶0̶  ₹7837`
        },
      ]
    };
    const customOrderMessage = {
      text: "✍️ If you'd like to order a custom quantity, please select this option: ",
      buttons: [
        {
          id: "custom_planA2",
          title: "Custom Amount"
        },
      ]
    };


    // Send quantity options for A2 Ghee
    await sendMessage(userPhone, quantityMessage);
    return await sendMessage(userPhone, customOrderMessage);
    
  }

  // Handle buffalo selection
  if (buttonId === "plan_buffalo") {
    const quantityMessage = {
      text: `🎉 You've made a great choice with *Indian Buffalo Ghee*! 🌟\n\nSelect the quantity you'd like to purchase— *NO delivery charges applied* 🚚\n\n💡 Plus, enjoy *monthly ghee delivery* without any hustle. We've got you covered! 🛍️`,
      buttons: [
        {
          id: "small_planbuffalo",
          title: "500ml 9̶4̶9̶  ₹759"
        },
        {
          id: "medium_planbuffalo",
          title: "1L 1̶6̶4̶9̶  ₹1424"
        },
        {
          id: "large_planbuffalo",
          title: "5L 7̶5̶0̶0̶  ₹6887"
        }
      ],
      
    };
    const customOrderMessage = {
      text: "✍️ If you'd like to order a custom quantity, please select this option:",
      buttons: [
        {
          id: "custom_planbuffalo",
          title: "Custom Amount"
        },
      ]
    };


    // Send quantity options for Buffalo Ghee
    await sendMessage(userPhone, quantityMessage);
    return await sendMessage(userPhone, customOrderMessage);
  }
}
