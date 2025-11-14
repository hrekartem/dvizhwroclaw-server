const { getUpcomingEvents,createEvent, getAvailableSeats, getAllEvents, getSeatIcons, getOnlyActiveEvents, getEventById, getEventSeats, deleteEvent, updateEvent, updateEventSeats } = require('../services/eventsService');

async function fetchAvailableSeats(req, res) {
  try {
    const { id } = req.params;
    const event = await getAvailableSeats(id);
    res.status(200).json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

async function fetchCreateEvent(req, res) {
  try {
    const event = await createEvent();
    res.status(200).json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

async function fetchUpcomingEvents(req, res) {
  try {
    const events = await getUpcomingEvents();
    res.status(200).json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

async function fetchSeatIcons(req, res) {
  try {
    const icons = await getSeatIcons();
    res.status(200).json(icons);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

async function fetchUpdateEventSeats(req, res) {
  try {
    const { id } = req.params;
    const files = req.files || [];
    let seats = [];

    // --- Парсим JSON мест ---
    if (req.body.seats) {
      if (Array.isArray(req.body.seats)) {
        seats = req.body.seats.map((s) => JSON.parse(s));
      } else {
        seats = [JSON.parse(req.body.seats)];
      }
    }

    // --- Фон ---
    const backgroundFile = files.find((f) => f.fieldname === "background") || null;

    // --- Передаём в сервис ---
    const result = await updateEventSeats({ eventId: id, seats, backgroundFile });

    res.status(200).json(result);
  } catch (err) {
    console.error("❌ Ошибка:", err);
    res.status(500).json({ error: err.message });
  }
}

async function fetchUpdateEvent(req, res) {
  try {
    const { id } = req.params;
    const { body, files, user } = req;

    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "Доступ запрещён" });
    }

    const updated = await updateEvent(id, body, files);

    if (!updated) {
      return res.status(404).json({ error: "Событие не найдено" });
    }

    res.status(200).json({ message: "Event updated successfully", updated });
  } catch (err) {
    console.error("❌ Ошибка при обновлении события:", err);
    res.status(500).json({ error: err.message });
  }
}

async function fetchAllEvents(req, res) {
  try {
    const events = await getAllEvents();
    res.status(200).json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

async function fetchOnlyActiveEvents(req, res) {
  try {
    const events = await getOnlyActiveEvents();
    res.status(200).json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

async function fetchDeleteEvent(req, res) {
  try {
    const { id } = req.params;
    await deleteEvent(id);
    res.status(200).json({ message: 'Event deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function fetchEventById(req, res) {
  try {
    const { id } = req.params;

    const event = await getEventById(id);
    res.status(200).json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function fetchEventSeats(req, res) {
  try {
    const { id } = req.params;
    const seats = await getEventSeats(id);
    res.status(200).json(seats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
module.exports = {fetchCreateEvent, fetchSeatIcons, fetchAvailableSeats, fetchUpcomingEvents, fetchOnlyActiveEvents, fetchAllEvents, fetchEventById, fetchEventSeats, fetchDeleteEvent, fetchUpdateEvent, fetchUpdateEventSeats };
