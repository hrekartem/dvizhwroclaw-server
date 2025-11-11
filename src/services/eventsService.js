const supabase = require("../config/supabase"); // клиент напрямую

async function createEvent() {
  const { data, error } = await supabase
    .from("events")
    .insert([
      {
        name: "Example",
        description: "Example",
        date: "example",
        location: "Example",
        price_pln: 0,
        price_eur: 0,
        main_image_url: "https://varoopazbqlwaiehaxoj.supabase.co/storage/v1/object/public/event-images/main/fd0f2bb2-f225-4c01-8569-e64e2ad1ed9f.jpeg",
        has_seat_map: false,
        is_active: false,
        what_you_get: ["example", "example2"],
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getUpcomingEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("is_active", true)
    .order("date", { ascending: true })
    .limit(3);

  if (error) throw new Error(error.message);
  return data;
}

async function getSeatIcons() {
  try {
    // Получаем список файлов из папки "seat-icons"
    const { data: files, error } = await supabase.storage
      .from("seat-icons")
      .list(""); // пустая строка — корень хранилища

    if (error) throw new Error(error.message);

    // Формируем публичные ссылки
    const urls = files.map(file => {
      const { data } = supabase.storage
        .from("seat-icons")
        .getPublicUrl(file.name);

      return data?.publicUrl; // теперь правильно
    });

    return urls; // массив ссылок на иконки
  } catch (err) {
    console.error(err);
    return [];
  }
}




async function updateEvent(id, body, files) {
  try {
    // 1️⃣ Извлекаем данные из body
    const {
      name,
      description,
      date,
      location,
      price_pln,
      price_eur,
      main_image_url,
      has_seat_map,
      is_active,
      what_you_get,
    } = body;

    let newMainImageUrl = main_image_url || null;
    const uploadedGalleryUrls = [];

    // 2️⃣ Функция загрузки в Supabase Storage
    const uploadImageToStorage = async (file, pathPrefix) => {
      const ext = file.originalname.split(".").pop();
      const uuid =
        crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const filePath = `${pathPrefix}/${uuid}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("event-images")
        .upload(filePath, file.buffer, {
          upsert: false,
          contentType: file.mimetype,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("event-images")
        .getPublicUrl(filePath);

      return data.publicUrl;
    };

    // 3️⃣ Загружаем главное изображение (если передано)
    if (files?.main_image) {
      const mainFile = Array.isArray(files.main_image)
        ? files.main_image[0]
        : files.main_image;
      newMainImageUrl = await uploadImageToStorage(mainFile, "main");
    }

    // 4️⃣ Загружаем галерею (если есть)
    if (files?.gallery) {
      const galleryFiles = Array.isArray(files.gallery)
        ? files.gallery
        : [files.gallery];

      for (const file of galleryFiles) {
        const url = await uploadImageToStorage(file, "gallery");
        uploadedGalleryUrls.push(url);
      }
    }

    let benefits = null;
    if (what_you_get) {
      if (typeof what_you_get === "string") {
        try {
          benefits = JSON.parse(what_you_get);
          if (!Array.isArray(benefits)) benefits = null;
        } catch (err) {
          benefits = null;
        }
      } else if (Array.isArray(what_you_get)) {
        benefits = what_you_get;
      }
    }
    // 5️⃣ Обновляем таблицу events
    const { data: updatedEvent, error: updateError } = await supabase
      .from("events")
      .update({
        name,
        description,
        date,
        location,
        price_pln: price_pln ? Number(price_pln) : null,
        price_eur: price_eur ? Number(price_eur) : null,
        main_image_url: newMainImageUrl,
        has_seat_map: has_seat_map === "true" || has_seat_map === true,
        is_active: is_active === "true" || is_active === true,
        what_you_get: benefits,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    // 6️⃣ Добавляем записи в таблицу event_gallery
    if (uploadedGalleryUrls.length > 0) {
      const galleryRows = uploadedGalleryUrls.map((url) => ({
        event_id: id,
        image_url: url,
      }));

      const { error: galleryError } = await supabase
        .from("event_gallery")
        .insert(galleryRows);

      if (galleryError) throw galleryError;
    }

    return updatedEvent;
  } catch (err) {
    console.error("❌ Ошибка updateEvent:", err);
    throw new Error(err.message || "Ошибка обновления события");
  }
}

async function updateEventSeats({ eventId, seats, backgroundFile }) {
  const result = {};

  // === ФОН ===
  if (backgroundFile) {
    const ext = backgroundFile.originalname.split(".").pop();
    const fileName = `bg-${eventId}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("event-maps")
      .upload(fileName, backgroundFile.buffer, { upsert: true });

    if (uploadError) throw new Error(uploadError.message);

    const { data: { publicUrl } } = supabase.storage
      .from("event-maps")
      .getPublicUrl(fileName);

    // Сохраняем в базу
    const { data: existingBg } = await supabase
      .from("seat_map_backgrounds")
      .select("*")
      .eq("event_id", eventId)
      .single();

    if (existingBg) {
      await supabase
        .from("seat_map_backgrounds")
        .update({ image_url: publicUrl })
        .eq("event_id", eventId);
    } else {
      await supabase
        .from("seat_map_backgrounds")
        .insert({ event_id: eventId, image_url: publicUrl });
    }

    result.background = publicUrl;
  }

  // === МЕСТА ===
  let insertedSeats = [];
  if (seats.length) {
    // Очистка старых мест
    await supabase.from("event_seats").delete().eq("event_id", eventId);

    // Подготовка к вставке с временным tempId
    const seatsToInsert = seats.map((seat) => ({
      event_id: eventId,
      name: seat.name,
      seat_type: seat.seat_type,
      capacity: seat.capacity,
      price_pln: seat.price_pln,
      price_eur: seat.price_eur,
      position_x: seat.position_x,
      position_y: seat.position_y,
      icon_url: seat.icon_url,
      tempId: seat.id, // временный идентификатор для связи с иконками
    }));

    const { data, error: insertError } = await supabase
      .from("event_seats")
      .insert(seatsToInsert)
      .select();

    if (insertError) throw new Error(insertError.message);

    // Добавляем tempId обратно в память, чтобы связать с иконками
    insertedSeats = data.map((row, i) => ({
      ...row,
      tempId: seatsToInsert[i].tempId,
    }));

    result.seats = insertedSeats;

    // === Обновление ticket_count в таблице events ===
    const totalTickets = seats.reduce((sum, seat) => sum + (seat.capacity || 0), 0);

    await supabase
      .from("events")
      .update({ ticket_count: totalTickets })
      .eq("id", eventId);
  }

  return result;
}



async function getOnlyActiveEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("is_active", true)
    .order("date", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

async function getAllEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("date", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}


async function getEventById(id) {
  // Получаем событие
  const { data: event, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;

  // Получаем галерею
  const { data: gallery, error: galleryError } = await supabase
    .from('event_gallery')
    .select('*')
    .eq('event_id', id);

  if (galleryError) throw galleryError;

  return { event, gallery };
}

async function getAvailableSeats(eventId) {
  // 1. Берём все места для события
  const { data: seats, error: seatsError } = await supabase
    .from("event_seats")
    .select("id, name, capacity, reserved")
    .eq("event_id", eventId);

  if (seatsError) throw seatsError;

  const availableSeats = seats.map(seat => {
    const reserved = seat.reserved || 0;
    const capacity = seat.capacity || 0;

    const available = Math.max(capacity - reserved, 0);

    return {
      ...seat,
      available,
    };
  });

  return availableSeats;
}

module.exports = { getAvailableSeats };


async function getEventSeats(eventId) {
  if (!eventId) throw new Error("Missing event ID");

  try {
    // Получаем background карты
    const { data: bgData, error: bgError } = await supabase
      .from("seat_map_backgrounds")
      .select("image_url")
      .eq("event_id", eventId)
      .maybeSingle();
    if (bgError) throw bgError;

    // Получаем список мест
    const { data: seatsData, error: seatsError } = await supabase
      .from("event_seats")
      .select("*")
      .eq("event_id", eventId);
    if (seatsError) throw seatsError;

    // Получаем проданные билеты
    const { data: soldTickets, error: ticketsError } = await supabase
      .from("tickets")
      .select("seat_id")
      .eq("event_id", eventId)
      .eq("status", "active")
      .not("seat_id", "is", null);
    if (ticketsError) throw ticketsError;

    const soldSeatIds = soldTickets ? soldTickets.map(t => t.seat_id) : [];

    // Получаем зарезервированные места
    const now = new Date().toISOString();
    const { data: reservedData, error: resError } = await supabase
      .from("reservations")
      .select("seat_ids")
      .eq("event_id", eventId)
      .gt("expires_at", now);
    if (resError) throw resError;

    const reservedSeatIds = reservedData ? reservedData.flatMap(r => r.seat_ids) : [];

    // Вычисляем доступные места для каждого seat
    const seatsWithAvailability = seatsData.map(seat => {
      const soldCount = soldSeatIds.filter(id => id === seat.id).length;
      const reservedCount = reservedSeatIds.filter(id => id === seat.id).length;
      const available = Math.max(0, seat.capacity - soldCount - reservedCount);
      return Object.assign({}, seat, { available });
    });

    return {
      background: bgData ? bgData.image_url : null,
      seats: seatsWithAvailability
    };
  } catch (err) {
    console.error("Error fetching seats:", err);
    throw err;
  }
}

async function deleteEvent(eventId) {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId);

  if (error) throw error;
}




module.exports = {createEvent, getSeatIcons, getUpcomingEvents, getAllEvents, updateEventSeats, getOnlyActiveEvents, getEventById, getAvailableSeats, getEventSeats, deleteEvent, updateEvent };
