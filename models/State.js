const mongoose = require('mongoose');

// Define the State schema
const state = new mongoose.Schema({
    userState: { type: String ,default:null}, // Example field for state name
    useradd: { type: String,default:null },
    userAmount: { type: Number,default:null },
    planType: { type: String,default:null },
    useredit: { type: String,default:null },
    username : { type: String,default:null },
    adminstate:{type:String, default:null},
    name: {
        type: String,
        default:null,
        ref: 'User',
    },
    userPhone: {
        type: String,
        required: true,
        ref: 'User',
    },
});

module.exports = mongoose.model('State', state);
