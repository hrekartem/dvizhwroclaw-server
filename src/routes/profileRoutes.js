const express = require('express');
const { getProfile, getUserRole, getTickets, downloadTicketPdf} = require('../controllers/profileController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authMiddleware, getProfile);
router.get('/role', authMiddleware, getUserRole);
router.get('/tickets', authMiddleware, getTickets);
router.get("/tickets/:ticketId/pdf", authMiddleware, downloadTicketPdf);

module.exports = router;
