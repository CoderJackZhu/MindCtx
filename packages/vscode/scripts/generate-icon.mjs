/**
 * Generates icon.png from icon.svg.
 * Run before packaging: node scripts/generate-icon.mjs
 */
import { readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = join(__dirname, '..', 'assets', 'icon.svg');
const pngPath = join(__dirname, '..', 'assets', 'icon.png');

const svgBuffer = readFileSync(svgPath);
const info = await sharp(svgBuffer).resize(128, 128).png().toFile(pngPath);

console.log(`icon.png generated (${info.width}x${info.height}, ${info.size} bytes)`);
