/**
 * One-off LL data import. This script is deliberately run only on demand;
 * the published fantasy page never requests data from Lidingöloppet.
 *
 * It reads the existing startlists.json, adds LL history and a 1–5 star
 * price to each runner, then writes the static JSON back to disk.
 */
import { readFile, writeFile } from 'node:fs/promises';

const BASE_URL = 'https://startlists.lidingoloppet.se';
const inputPath = new URL('../startlists.json', import.meta.url);
const browserDataPath = new URL('../startlists.js', import.meta.url);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => value.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/\s+/g, ' ').trim();

function historyRows(html, distance) {
  const rows = [];
  const pattern = /<div[^>]*col-sm-4 col-6[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div[^>]*col-sm-1 col-6[^>]*>\s*(\d+)/g;
  for (const match of html.matchAll(pattern)) {
    const text = clean(match[1].replace(/<[^>]*>/g, ' '));
    const year = Number(text.match(/\b(20\d{2})\b/)?.[1]);
    if (year && text.includes(`${distance} km`)) rows.push({ year, place: Number(match[2]) });
  }
  return rows.sort((a, b) => b.year - a.year).slice(0, 3);
}

function priceFor(history, distance) {
  const relevant = historyRows(history, distance);
  if (!relevant.length) return { stars: 1, relevant };
  const averagePlace = relevant.reduce((sum, result) => sum + result.place, 0) / relevant.length;
  const stars = averagePlace <= 10 ? 5 : averagePlace <= 50 ? 4 : averagePlace <= 200 ? 3 : averagePlace <= 500 ? 2 : 1;
  return { stars, relevant };
}

async function personHistory(registrationId) {
  const url = `${BASE_URL}/Result/PersonResult/?LanguageId=1&registrationId=${encodeURIComponent(registrationId)}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Lidingoloppet-Fantasy data importer' } });
  if (!response.ok) throw new Error(`LL history request failed (${response.status}) for ${registrationId}`);
  return response.text();
}

const data = JSON.parse(await readFile(inputPath, 'utf8'));
let updated = 0;
for (const [classId, runners] of Object.entries(data.classes)) {
  const distance = classId.includes('15 km') ? 15 : classId.includes('30 km') ? 30 : classId.includes('P15') || classId.includes('F15') ? 6 : 10;
  for (const runner of runners) {
    if (!runner.registrationId) continue;
    const html = await personHistory(runner.registrationId);
    runner.llId = html.match(/Liding(?:ö|&#246;)lopps ID:\s*(\d+)/i)?.[1] ?? null;
    const rating = priceFor(html, distance);
    runner.stars = rating.stars;
    runner.relevantHistory = rating.relevant;
    updated++;
    await pause(250);
  }
}
data.updatedAt = new Date().toISOString();
await writeFile(inputPath, `${JSON.stringify(data, null, 2)}\n`);
await writeFile(browserDataPath, `window.LL_STARTLISTS = ${JSON.stringify(data)};\n`);
console.log(`Updated history and star prices for ${updated} runners.`);
