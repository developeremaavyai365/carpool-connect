const COMPANY_OFFICE = 'Logica Infoway, Sector 62, Noida, Uttar Pradesh - 201301';
const ROUTE_TO = 'Sector 62 Noida';

const LOCALITY_PATTERNS = [
  { re: /sector[- ]?(\d+)/i, pick: (m, addr) => `Sector ${m[1]}${/faridabad|fridabad|fardidabad/i.test(addr) ? ' Faridabad' : ''}` },
  { re: /okhla phase[- ]?(\d+)/i, pick: (m) => `Okhla Phase ${m[1]}` },
  { re: /okhla/i, pick: () => 'Okhla' },
  { re: /sangam vihar/i, pick: () => 'Sangam Vihar' },
  { re: /palam colony|palam village|mahavir enclave|indra park palam/i, pick: () => 'Palam' },
  { re: /jaitpur|badarpur/i, pick: () => 'Jaitpur Badarpur' },
  { re: /rani bagh|sant nagar/i, pick: () => 'Rani Bagh' },
  { re: /patel nagar/i, pick: () => 'Patel Nagar' },
  { re: /kalkaji|alaknanda/i, pick: () => 'Kalkaji' },
  { re: /lakkarpur|shiv durga vihar/i, pick: () => 'Lakkarpur Faridabad' },
  { re: /sihi sector[- ]?8|sector[- ]?8 faridabad/i, pick: () => 'Sector 8 Faridabad' },
  { re: /mehrauli/i, pick: () => 'Mehrauli' },
  { re: /dakshinpuri|ambedkar nagar/i, pick: () => 'Dakshinpuri' },
  { re: /shaheen bagh|jamia nagar|abul fazal/i, pick: () => 'Shaheen Bagh' },
  { re: /surya vihar|sehatpur|agwanpur|sector[- ]?91/i, pick: () => 'Sector 91 Faridabad' },
  { re: /dheeraj nagar|titu colony|yamuna enclave/i, pick: () => 'Dheeraj Nagar Faridabad' },
  { re: /gandhi nagar|dharampura/i, pick: () => 'Gandhi Nagar' },
  { re: /hari nagar/i, pick: () => 'Hari Nagar' },
  { re: /new friends colony|khizrabad/i, pick: () => 'New Friends Colony' },
  { re: /dallupura|pipal/i, pick: () => 'Dallupura' },
  { re: /ramprashta|ramprastha/i, pick: () => 'Ramprastha Ghaziabad' },
  { re: /siraspur|badli/i, pick: () => 'Badli' },
  { re: /anand parbat/i, pick: () => 'Anand Parbat' },
  { re: /lodhi road/i, pick: () => 'Lodhi Road' },
  { re: /moti nagar|sudershan park/i, pick: () => 'Moti Nagar' },
  { re: /madangir/i, pick: () => 'Madangir' },
  { re: /patparganj|aamarpali/i, pick: () => 'Patparganj' },
  { re: /ghaziabad|dlf ghaziabad/i, pick: () => 'Ghaziabad' },
  { re: /noida/i, pick: () => 'Noida' },
  { re: /kangra|netri/i, pick: () => 'Kangra' },
  { re: /vasundhara public school|dallupura/i, pick: () => 'Vasundhara Enclave' },
];

function detectCity(address) {
  const a = address.toLowerCase();
  if (/faridabad|fridabad|fardidabad|lakkarpur|sehatpur|agwanpur/.test(a)) return 'Faridabad';
  if (/ghaziabad|ramprashta|ramprastha/.test(a)) return 'Ghaziabad';
  if (/noida|udaygiri|sector-34/.test(a)) return 'Noida';
  if (/gurgaon|gurugram/.test(a)) return 'Gurgaon';
  if (/kangra|himachal/.test(a)) return 'Chandigarh';
  return 'Delhi';
}

function extractRouteFrom(address) {
  for (const { re, pick } of LOCALITY_PATTERNS) {
    const m = address.match(re);
    if (m) return pick(m, address).trim();
  }
  const cleaned = address
    .replace(/\s-\s*\d{6}\s*$/i, '')
    .replace(/\d{6}\s*$/i, '')
    .replace(/\b(pin code|post office)[^,]*/gi, '')
    .trim();
  const first = cleaned.split(',')[0].trim();
  if (first.length >= 3 && first.length <= 48) return first;
  return cleaned.slice(0, 48).trim() || 'Delhi NCR';
}

function parseCommuteFields(homeAddress) {
  const home_address = (homeAddress || '').trim();
  const city = detectCity(home_address);
  const route_from = extractRouteFrom(home_address);
  return {
    home_address,
    city,
    route_from,
    route_to: ROUTE_TO,
    office_address: COMPANY_OFFICE,
    availability: 'available',
  };
}

module.exports = {
  COMPANY_OFFICE,
  ROUTE_TO,
  detectCity,
  extractRouteFrom,
  parseCommuteFields,
};
