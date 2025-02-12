const mongoose = require('mongoose');
require('dotenv').config();

// Ensure you have MONGO_URI defined in your .env file
const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
  console.error('Error: MONGO_URI is not defined in .env file');
  process.exit(1); // Exit process if no MongoDB URI is found
}

// Connect to MongoDB
mongoose.connect(mongoURI)
  .then(() => {
    console.log('Successfully connected to MongoDB');
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1); // Exit process if connection fails
  });

// Export the connection object
module.exports = mongoose.connection;
