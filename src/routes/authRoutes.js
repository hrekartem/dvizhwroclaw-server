const express = require("express");
const { loginUser, registerUser, getSession, signOutUser } = require("../controllers/authController");
const router = express.Router();

router.post("/login", loginUser);
router.post("/register", registerUser);
router.get("/session", getSession);
router.get("/logout", signOutUser);

module.exports = router;
