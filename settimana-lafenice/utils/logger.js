// utils/logger.js
const chalk = require('chalk');

const log = (level, message, data = {}) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  let levelColor;
  switch (level.toUpperCase()) {
    case 'ERROR':
      levelColor = chalk.red;
      break;
    case 'WARN':
      levelColor = chalk.yellow;
      break;
    case 'INFO':
      levelColor = chalk.green;
      break;
    case 'DEBUG':
      levelColor = chalk.blue;
      break;
    case 'SYSTEM':
      levelColor = chalk.gray;
      break;
    default:
      levelColor = chalk.white;
  }

  let logLine = `${chalk.gray(timestamp)} [${levelColor.bold(level.toUpperCase())}] ${message}`;

  if (Object.keys(data).length > 0) {
    logLine += ` | data: ${JSON.stringify(data)}`;
  }

  console.log(logLine);
};

module.exports = log; 