const fs = require('fs');
const path = require('path');

const logToFile = (data) => {
  const logFile = path.join(__dirname, 'registration.log'); // путь к файлу логов
  const logEntry = `[${new Date().toISOString()}] ${JSON.stringify(data)}\n`;

  fs.appendFile(logFile, logEntry, (err) => {
    if (err) console.error("Ошибка при записи лога:", err);
  });
};

module.exports = logToFile;