const express = require('express');
const app = express();
const path = require('path');

// Serve static files from the "video" folder
// app.use('/video', express.static(path.join(__dirname, 'ghee')));

// Example endpoint
app.get('/', (req, res) => {
  res.send('Server is running!');
});

// Start the server
app.listen(5000, () => {
  console.log('Server is running on port 5000');
});
