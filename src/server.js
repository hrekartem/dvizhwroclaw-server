require('dotenv').config();
const express = require("express");
const app = require('./app');

const port = process.env.PORT || 5001;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
