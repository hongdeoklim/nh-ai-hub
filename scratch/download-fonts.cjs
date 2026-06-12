const fs = require('fs');
const path = require('path');
const https = require('https');

const fontsDir = path.join(__dirname, '..', 'public', 'fonts');
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

const fontFiles = [
  'Pretendard-Regular.woff2',
  'Pretendard-Medium.woff2',
  'Pretendard-SemiBold.woff2',
  'Pretendard-Bold.woff2'
];

const cdnBase = 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  console.log('Downloading Pretendard fonts to ' + fontsDir + '...');
  for (const font of fontFiles) {
    const url = `${cdnBase}${font}`;
    const dest = path.join(fontsDir, font);
    console.log(`Downloading ${font} to ${dest}...`);
    try {
      await downloadFile(url, dest);
      console.log(`Successfully downloaded ${font}`);
    } catch (err) {
      console.error(`Error downloading ${font}:`, err);
    }
  }
  console.log('All downloads completed!');
}

run();
