const PDFDocument = require("pdfkit");
const supabase = require("../config/supabase");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const axios = require('axios');

exports.getProfile = async (req, res) => {
  // Берем userId из токена (req.user), либо из query как fallback
  const userId = req.user?.id || req.query.userId;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;

    res.json(profile);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getUserRole = async (req, res) => {
  const userId = req.user?.id || req.query.userId;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  try {
    const { data: profile, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    res.json({ role: profile.role });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getTickets = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });

  try {
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select(`
    id,
    qr_code,
    price_paid_pln,
    price_paid_eur,
    event_id,
    events (name, date, location, main_image_url),
    event_seats (name)
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ tickets });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.downloadTicketPdf = async (req, res) => {
  const userId = req.user?.id;
  const { ticketId } = req.params;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!ticketId) return res.status(400).json({ error: "Ticket ID is required" });

  try {
    // 1️⃣ Получаем данные билета из Supabase
    // (Логика получения данных остается прежней)
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select(`
            *,
            events (name, date, location, main_image_url),
            event_seats (name)
        `)
      .eq("id", ticketId)
      .eq("user_id", userId)
      .single();

    if (ticketError || !ticket) return res.status(404).json({ error: "Ticket not found" });

    // 2️⃣ Генерация PDF на лету
    const doc = new PDFDocument({ size: "A4", margin: 0 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ticket-${ticket.id}.pdf"`
    );

    doc.pipe(res);

    // ----------------- ПОДКЛЮЧАЕМ ШРИФТ -----------------
    // Используем тот же шрифт, чтобы сохранить кириллицу
    const fontPath = path.join(process.cwd(), "src", "assets", "TicketFont.ttf");
    if (!fs.existsSync(fontPath)) {
      throw new Error("Шрифт для кириллицы не найден в assets!");
    }
    const boldFontPath = path.join(process.cwd(), "src", "assets", "TicketFont.ttf");
    if (!fs.existsSync(boldFontPath)) {
      throw new Error("Жирный для кириллицы не найден в assets!");
    }
    doc.registerFont("TicketFont", fontPath);
    doc.registerFont("TicketFont-Bold", boldFontPath);
    doc.font("TicketFont");

    // ----------------- ФОН (Чёрный, как на скриншоте) -----------------
    // Полностью чёрный фон с небольшой непрозрачностью для текстуры, если background.png есть
    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#000000"); // Основной фон - ЧЁРНЫЙ

    const backgroundPath = path.join(process.cwd(), "src", "assets", "background.png");
    if (fs.existsSync(backgroundPath)) {
      doc.image(backgroundPath, 0, 0, {
        width: doc.page.width,
        height: doc.page.height,
        fit: [doc.page.width, doc.page.height],
        opacity: 0.15, // Немного текстуры
      });
    }


    // ----------------- КОНСТАНТЫ РАЗМЕРОВ И ЦВЕТОВ -----------------
    const TEXT_WIDTH = 400; // Уменьшенная ширина контента для "мобильного" вида
    const PADDING = (doc.page.width - TEXT_WIDTH) / 2; // Горизонтальный отступ
    const YELLOW_COLOR = "#fcc600";
    const WHITE_COLOR = "#ffffff";
    const QR_SIZE = 250; // Увеличим QR-код
    const DETAIL_LINE_HEIGHT = 18; // Высота строки для деталей

    let currentY = 80; // Начальный отступ сверху


    // Функция для центрирования
    const getCenteredX = (width) => (doc.page.width - width) / 2;
    let detailX = getCenteredX(TEXT_WIDTH);


    // ----------------- НАЗВАНИЕ ИВЕНТА И ГЛАВНЫЙ ЗАГОЛОВОК -----------------
    doc.y = currentY;

    // Главный заголовок ("DVIZH ЛАГЕРЬ" на скриншоте)
    doc
      .fillColor(WHITE_COLOR)
      .fontSize(28)
      .text(ticket.events.name.toUpperCase() || "DVIZH ИВЕНТ", { align: "center", width: doc.page.width });

    currentY = doc.y;

    // ----------------- ДЕТАЛИ СОБЫТИЯ -----------------

    const printDetailRow = (label, value, isBold = false) => {
      doc.y = currentY;

      const labelWidth = doc.widthOfString(label);
      const valueWidth = doc.widthOfString(value);

      const totalTextWidth = labelWidth + valueWidth;
      const startX = getCenteredX(totalTextWidth);

      // Печатаем label
      doc.fillColor(WHITE_COLOR).fontSize(16).text(label, startX, currentY);

      // Печатаем value, смещаем на ширину label
      if (isBold) doc.font("TicketFont-Bold");
      doc.fillColor(YELLOW_COLOR).fontSize(16).text(value, startX + labelWidth, currentY);
      if (isBold) doc.font("TicketFont");

      currentY += DETAIL_LINE_HEIGHT;
    };
    printDetailRow(``, ``);
    
    printDetailRow(`${ticket.events.date}`, ``);

    // Применяем стилизацию скриншота
    currentY += 40; // Отступ перед деталями
    printDetailRow("Локация: ", "В ЧЕТА ИВЕНТА"); // Предполагаемое значение из скриншота

    // Место на ивенте/Проживание
    if (ticket.event_seats?.name) {
      printDetailRow("Место на ивенте: ", ticket.event_seats.name);
    } else {
      // Используем значение из скриншота, если места нет
      printDetailRow("Место на ивенте: ", `Hostel "Santana"`);
    }

    // Цена (самая контрастная)
    printDetailRow("Цена: ", `${ticket.price_paid_pln || 600} PLN`, true); // Используем 600 PLN как на скриншоте по умолчанию

    currentY += 30;
    doc.y = currentY;

    // ----------------- ЗАГОЛОВОК QR-КОДА -----------------
    printDetailRow("QR-CODE", "", false);

    currentY = doc.y + 40;
    doc.y = currentY;

    // ----------------- ГЕНЕРАЦИЯ И ОТОБРАЖЕНИЕ QR-КОДА -----------------
    if (ticket.qr_code) {
      // Генерация QR-кода (оставляем логику)
      const qrDataUrl = await QRCode.toDataURL(ticket.qr_code, {
        color: {
          dark: "#ffffff", // Белый QR-код
          light: "#000000", // Чёрный фон
        },
        width: 300,
      });

      const qrImageBuffer = Buffer.from(
        qrDataUrl.replace(/^data:image\/png;base64,/, ""),
        "base64"
      );

      const qrX = getCenteredX(QR_SIZE); // Центрируем

      // Рамка/заливка вокруг QR (Белый квадрат на чёрном фоне)
      doc
        .rect(qrX - 5, doc.y - 5, QR_SIZE + 10, QR_SIZE + 10)
        .fill(WHITE_COLOR);

      // Рисуем сам QR-код (он будет чёрным на белом фоне)
      doc.image(qrImageBuffer, qrX, doc.y, {
        width: QR_SIZE,
        height: QR_SIZE,
      });

      currentY = doc.y + QR_SIZE + 30; // Обновляем Y
    }
    doc.y = currentY;

    // ----------------- ИМИТАЦИЯ КНОПОК -----------------

    const drawButton = (text, y, backgroundColor, textColor, link = null) => {
      const BUTTON_HEIGHT = 50;
      const BUTTON_WIDTH = 250;
      const buttonX = getCenteredX(BUTTON_WIDTH);

      // Рисуем прямоугольник кнопки
      doc
        .rect(buttonX, y, BUTTON_WIDTH, BUTTON_HEIGHT)
        .fill(backgroundColor);

      // Добавляем текст
      doc
        .fillColor(textColor)
        .fontSize(16)
        .text(text, buttonX, y + (BUTTON_HEIGHT - doc.currentLineHeight()) / 2, {
          width: BUTTON_WIDTH,
          align: "center"
        });

      // Если есть ссылка, делаем весь прямоугольник кликабельным
      if (link) {
        doc.link(buttonX, y, BUTTON_WIDTH, BUTTON_HEIGHT, link);
      }

      return y + BUTTON_HEIGHT + 20; // Возвращаем Y для следующего элемента
    };

    // 1. Кнопка "Спасибо за покупку" (имитация 'Закрыть')
    currentY = drawButton(
      "СПАСИБО ЗА ПОКУПКУ",
      currentY,
      "#333333", // Тёмно-серый фон
      WHITE_COLOR
    );

    // 2. Кнопка "dvizhwroclaw.eu" (имитация 'PDF' / 'Сайт')
    currentY = drawButton(
      "DVIZHWROCLAW.EU",
      currentY,
      YELLOW_COLOR, // Жёлтый фон
      "#000000", // Чёрный текст
      "https://dvizhwroclaw.eu" // Ссылка
    );


    let startX_id = getCenteredX(`${doc.widthOfString(ticket.id)}`) + 23;
    doc
      .fillColor("#696969")
      .fontSize(14)
      .text(ticket.id, startX_id, doc.page.height - 40);
    doc.end();

  } catch (error) {
    // Обработка ошибок
    console.error("Ошибка при генерации PDF:", error);
    res.status(500).json({ error: "Ошибка при генерации PDF" });
  }
};
