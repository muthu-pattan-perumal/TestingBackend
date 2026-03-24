const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer to be within the project folder.
  // This ensures it survives the build -> runtime transition on Render.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
