/**
 * Fetches every fantasy start list and stores only static data in
 * startlists.json. The job is intended for a manual GitHub Action run.
 * 15 km and 30 km are explicitly limited to start group 1A.
 */
import { readFile, writeFile } from 'node:fs/promises';

const BASE_URL = 'https://startlists.lidingoloppet.se';
const inputPath = new URL('../startlists.json', import.meta.url);
const browserDataPath = new URL('../startlists.js', import.meta.url);
const EVENT_GROUP_ID = '1';
const YEAR = '2026';
const targets = [
  { id: 'P15', competitionId: '1792', label: /Pojkar 15 år/i },
  { id: 'F15', competitionId: '1792', label: /Flickor 15 år/i },
  { id: 'P17', competitionId: '1790', label: /Pojkar 17 år/i },
  { id: 'F17', competitionId: '1790', label: /Flickor 17 år/i },
  { id: 'P19', competitionId: '1790', label: /Pojkar 19 år/i },
  { id: 'F19', competitionId: '1790', label: /Flickor 19 år/i },
  { id: 'M 15 km', competitionId: '1789', label: /15 km\s+Män/i, startGroup: '1A' },
  { id: 'K 15 km', competitionId: '1789', label: /15 km\s+Kvinnor/i, startGroup: '1A' },
  { id: 'M 30 km', competitionId: '1788', label: /30 km\s+Män/i, startGroup: '1A' },
  { id: 'K 30 km', competitionId: '1788', label: /30 km\s+Kvinnor/i, startGroup: '1A' }
];

const clean = value => value.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const get = async path => {
  const response = await fetch(`${BASE_URL}${path}`, { headers: { 'User-Agent': 'Lidingoloppet-Fantasy data importer' } });
  if (!response.ok) throw new Error(`LL request failed: ${response.status} ${path}`);
  return response.text();
};

async function classOptions(competitionId) {
  const response = await fetch(`${BASE_URL}/Start/GetCompetitionClass/?LanguageId=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Lidingoloppet-Fantasy data importer' },
    body: new URLSearchParams({ competitionid: competitionId })
  });
  if (!response.ok) throw new Error(`Could not find classes for competition ${competitionId}`);
  const classes = await response.json();
  return classes.map(item => ({ value: String(item.Id ?? item.id ?? item.Value ?? item.value), label: String(item.Name ?? item.name ?? item.Text ?? item.text) }));
}

async function startGroupId(classId, groupName) {
  const response = await fetch(`${BASE_URL}/Start/GetClassStartGroup/?LanguageId=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Lidingoloppet-Fantasy data importer' },
    body: new URLSearchParams({ classId })
  });
  if (!response.ok) throw new Error(`Could not find start group for class ${classId}`);
  const groups = await response.json();
  const group = groups.find(item => String(item.Text ?? item.text ?? item.Name ?? item.name).trim() === groupName);
  const value = group?.Value ?? group?.value ?? group?.Id ?? group?.id;
  if (!value) throw new Error(`Start group ${groupName} was not found for class ${classId}`);
  return String(value);
}

function runnersFrom(html, classId) {
  const pattern = /(\d+)\.\s*&nbsp;[\s\S]*?class="history"\s+data-id="(\d+)">([\s\S]*?)<\/a>[\s\S]*?<div class="col-9 col-sm-4">([\s\S]*?)<\/div>/gi;
  return [...html.matchAll(pattern)].map(([, bib, registrationId, name, club]) => ({
    bib: clean(bib), registrationId: clean(registrationId), name: clean(name), club: clean(club), classId, stars: 1
  }));
}

async function allPages(parameters, classId) {
  const query = new URLSearchParams(parameters);
  const firstPage = await get(`/Start?${query}`);
  const pageNumbers = [...firstPage.matchAll(/[?&]PageNo=(\d+)/g)].map(match => Number(match[1]));
  const pageCount = Math.max(1, ...pageNumbers);
  const runners = runnersFrom(firstPage, classId);
  for (let page = 2; page <= pageCount; page++) {
    query.set('PageNo', String(page));
    runners.push(...runnersFrom(await get(`/Start?${query}`), classId));
  }
  return runners;
}

const output = JSON.parse(await readFile(inputPath, 'utf8'));
for (const target of targets) {
  const classOption = (await classOptions(target.competitionId)).find(option => target.label.test(option.label));
  if (!classOption) throw new Error(`Could not find ${target.id} in competition ${target.competitionId}`);
  const parameters = { EventGroupId: EVENT_GROUP_ID, LanguageId: '1', Year: YEAR, CompetitionId: target.competitionId, ClassId: classOption.value, Search: 'Sök i startlistan' };
  if (target.startGroup) parameters.StartGroupId = await startGroupId(classOption.value, target.startGroup);
  output.classes[target.id] = await allPages(parameters, target.id);
  console.log(`${target.id}: ${output.classes[target.id].length} runners${target.startGroup ? ` (${target.startGroup} only)` : ''}`);
}
output.updatedAt = new Date().toISOString();
await writeFile(inputPath, `${JSON.stringify(output, null, 2)}\n`);
await writeFile(browserDataPath, `window.LL_STARTLISTS = ${JSON.stringify(output)};\n`);
