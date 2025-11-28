const timestamp = () => new Date().toISOString();

const log = (...args) => {
  console.log(timestamp(), ...args);
};

const logError = (...args) => {
  console.error(timestamp(), ...args);
};

module.exports = { log, logError };

