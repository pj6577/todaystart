const sharp = require('sharp')
const path = require('node:path')
const fs = require('node:fs')
const source = path.resolve(__dirname, '../assets/icon.svg')
const store = path.resolve(__dirname, '../release/store')
fs.mkdirSync(store, { recursive: true })
Promise.all([
  sharp(source).resize(512, 512).png().toFile(path.resolve(__dirname, '../assets/icon.png')),
  sharp(source).resize(128, 128).removeAlpha().png().toFile(path.join(store, 'icon-128.png')),
  sharp(source).resize(512, 512).removeAlpha().png().toFile(path.join(store, 'icon-512.png'))
]).catch(error => { console.error(error); process.exitCode = 1 })
