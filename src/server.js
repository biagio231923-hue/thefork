import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { chromium } from 'playwright';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const sessions = new Map();
let browser;

function normalize(row) {
  const get = (...keys) => {
    for (const key of keys) {
      const value = row[key] ?? row[key.toLowerCase()];
      if (value !== undefined && String(value).trim()) return String(value).trim();
    }
    return '';
  };
  return {
    nome: get('nome', 'name', 'first_name'),
    cognome: get('cognome', 'surname', 'last_name'),
    email: get('email', 'e-mail'),
    telefono: get('telefono', 'phone', 'cellulare'),
  };
}

app.post('/api/csv/preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) throw new Error('Carica un file CSV');
    const text = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    const rows = parse(text, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true });
    const profiles = rows.slice(0, 4).map(normalize);
    if (profiles.length !== 4) throw new Error('Il CSV deve contenere esattamente 4 persone');
    if (profiles.some(p => !p.nome || !p.cognome || !p.email)) {
      throw new Error('Ogni riga deve contenere almeno nome, cognome ed email');
    }
    res.json({ ok: true, profiles });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

async function getBrowser() {
  if (!browser) browser = await chromium.launch({ headless: true });
  return browser;
}

const signupText = /registrati|crea un account|sign up|register|create account/i;
const loginText = /accedi|sign in|log in|account/i;
const verificationText = /captcha|recaptcha|verifica.*email|verify.*email|codice.*verifica|verification code/i;

async function createAccount(profile) {
  const b = await getBrowser();
  const context = await b.newContext();
  const page = await context.newPage();
  try {
    await page.goto('https://www.thefork.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

    const login = page.getByRole('button', { name: loginText }).first();
    if (await login.count()) await login.click().catch(() => {});
    else {
      const link = page.getByText(loginText).first();
      if (await link.count()) await link.click().catch(() => {});
    }
    await page.waitForTimeout(800);

    const signup = page.getByRole('link', { name: signupText }).first();
    if (await signup.count()) await signup.click().catch(() => {});
    else {
      const button = page.getByRole('button', { name: signupText }).first();
      if (await button.count()) await button.click().catch(() => {});
      else {
        const text = page.getByText(signupText).first();
        if (await text.count()) await text.click().catch(() => {});
      }
    }
    await page.waitForTimeout(1000);

    if (verificationText.test(await page.locator('body').innerText())) {
      return { status: 'verification_required', email: profile.email, message: 'TheFork richiede una verifica/CAPTCHA: completala manualmente.' };
    }

    const fields = [
      { labels: /nome|first name/i, value: profile.nome },
      { labels: /cognome|last name|surname/i, value: profile.cognome },
      { labels: /email|e-mail/i, value: profile.email },
      { labels: /telefono|phone|mobile/i, value: profile.telefono },
    ];
    for (const field of fields) {
      if (!field.value) continue;
      const locator = page.getByLabel(field.labels).first();
      if (await locator.count()) await locator.fill(field.value).catch(() => {});
    }

    const submit = page.getByRole('button', { name: /crea|registrati|sign up|register|continua|continue/i }).last();
    if (await submit.count()) await submit.click().catch(() => {});
    await page.waitForTimeout(1500);

    const body = await page.locator('body').innerText();
    if (verificationText.test(body)) {
      return { status: 'verification_required', email: profile.email, message: 'Registrazione avviata; è richiesta una verifica manuale.' };
    }
    return { status: 'submitted', email: profile.email, message: 'Dati di registrazione inviati. Il risultato dipende dal flusso mostrato da TheFork.' };
  } finally {
    await context.close();
  }
}

app.post('/api/accounts/prepare', async (req, res) => {
  try {
    const profiles = req.body.profiles;
    if (!Array.isArray(profiles) || profiles.length !== 4) throw new Error('Servono esattamente 4 profili');
    const results = [];
    for (const profile of profiles) results.push(await createAccount(profile));
    res.json({ ok: true, results });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/api/bookings/prepare', async (req, res) => {
  try {
    const bookings = req.body.bookings;
    if (!Array.isArray(bookings) || bookings.length !== 4) throw new Error('Servono esattamente 4 prenotazioni');
    res.json({ ok: true, results: bookings.map(b => ({ ...b, status: 'ready_for_booking_flow' })) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.listen(PORT, () => console.log(`TheFork family app listening on ${PORT}`));
