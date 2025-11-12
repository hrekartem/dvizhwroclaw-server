const express = require('express');
const multer = require('multer');
const { fetchUpcomingEvents, fetchOnlyActiveEvents, fetchCreateEvent, fetchSeatIcons, fetchAllEvents, fetchUpdateEventSeats, fetchEventById, fetchEventSeats, fetchDeleteEvent, fetchUpdateEvent} = require('../controllers/eventsController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.get('/upcoming', fetchUpcomingEvents);
router.get('/only-active', fetchOnlyActiveEvents);
router.get('/all', fetchAllEvents);
router.get('/seat-icons', fetchSeatIcons);
router.put('/create', authMiddleware, fetchCreateEvent);

router.get('/:id/seats', fetchEventSeats);

router.get('/:id', fetchEventById); // роут по id в конце
router.put('/:id', authMiddleware, upload.fields([
  { name: 'main_image', maxCount: 1 },
  { name: 'gallery', maxCount: 1000 }
]), fetchUpdateEvent);
router.put("/:id/seats", authMiddleware, upload.any(), fetchUpdateEventSeats);
router.delete('/:id', authMiddleware, fetchDeleteEvent);

module.exports = router;
