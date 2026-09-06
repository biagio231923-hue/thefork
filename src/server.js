import express from 'express';
import { chromium } from 'playwright';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const browserState = { browser: null, context: null };

const required = (value, name) => {
  if (!value) throw new Error(`${name} is required`);
  return value;
};

async function getBrowserContext() {
  if (!browserState.browser) browserState.browser = await chromium.launch({ headless: true });
  if (!browserState.context) browserState.context = await browserState.browser.newContext();
  return browserState.context;
}

async function createAccount(profile) {
  const context = await getBrowserContext();
  const page = await context.newPage();
  try {
    await page.goto('https://www.thefork.com/', { waitUntil: 'domcontentloaded' });
    return {
      status: 'ready_for_provider_flow',
      email: profile.email,
      message: 'The provider signup flow must be completed with the user-provided account details and any verification challenge required by TheFork.'
    };
  } finally {
    await page.close();
  }
}

async function bookRestaurant(booking) {
  const context = await getBrowserContext();
  const page = await context.newPage();
  try {
    await page.goto('https://www.thefork.com/', { waitUntil: 'domcontentloaded' });
    return {
      status: 'ready_for_provider_flow',
      restaurant: booking.restaurant,
      date: booking.date,
      time: booking.time,
      partySize: booking.partySize,
      message: 'The provider booking flow is prepared, but final booking should only occur using the account and reservation details supplied by the user.'
    };
  } finally {
    await page.close();
  }
}

app.post('/api/accounts/prepare', async (req, res) => {
  try {
    const profiles = required(req.body.profiles, 'profiles');
    if (!Array.isArray(profiles) || profiles.length !== 4) throw new Error('Exactly 4 family profiles are required');
    const results = [];
    for (const profile of profiles) results.push(await createAccount(profile));
    res.json({ ok: true, results });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/api/bookings/prepare', async (req, res) => {
  try {
    const bookings = required(req.body.bookings, 'bookings');
    if (!Array.isArray(bookings) || bookings.length !== 4) throw new Error('Exactly 4 restaurant bookings are required');
    const results = [];
    for (const booking of bookings) results.push(await bookRestaurant(booking));
    res.json({ ok: true, results });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.listen(PORT, () => console.log(`TheFork family app listening on ${PORT}`));
