const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ---- CONFIG ----
const API_KEY = 'ee0e1a79d5be4fe6b60d7b8f63a0d278'; // <-- REPLACE
const ADMIN_PASSWORD = 'innoswa2024!';
const ADMIN_EMAIL = 'innoswaifx7@gmail.com';
const JWT_SECRET = 'trading-platform-secret-2024';

// ---- DATABASE (simple in-memory for demo; later replace with PostgreSQL) ----
const users = []; // { id, email, passwordHash, subscriptionTier, subscriptionExpiry, isAdmin }
const trades = [];
const dailyViews = { count: 0, date: new Date().toDateString() };
const strategies = ['ORB', 'Wyckoff', 'SMC', 'Scalping', 'Trend Following', 'Donchian', 'News'];

// ---- IN-MEMORY USER STORE (for demo) ----
// Pre-create admin user
users.push({
  id: 1,
  email: ADMIN_EMAIL,
  passwordHash: ADMIN_PASSWORD, // plain text for demo – NEVER do this in production
  subscriptionTier: 'admin',
  subscriptionExpiry: null,
  isAdmin: true
});

// ---- HELPER: Track Daily Views ----
function incrementView() {
  const today = new Date().toDateString();
  if (dailyViews.date !== today) {
    dailyViews.count = 1;
    dailyViews.date = today;
  } else {
    dailyViews.count++;
  }
}

// ---- MIDDLEWARE: Verify JWT ----
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ---- API: Live Price ----
app.get('/api/price/:symbol', async (req, res) => {
  try {
    const response = await axios.get(`https://api.twelvedata.com/price?symbol=${req.params.symbol}&apikey=${API_KEY}`);
    res.json(response.data);
  } catch (e) {
    res.status(500).json({ error: 'Price fetch failed' });
  }
});

// ---- API: NY Close Analysis + Strategy Recommendation ----
app.get('/api/analysis/:symbol', async (req, res) => {
  try {
    // Fetch last 2 daily candles
    const candlesRes = await axios.get(`https://api.twelvedata.com/time_series?symbol=${req.params.symbol}&interval=1day&outputsize=2&apikey=${API_KEY}`);
    const data = candlesRes.data.values;
    if (!data || data.length < 2) return res.json({ error: 'Not enough data' });

    const prevDay = data[1];
    const priceRes = await axios.get(`https://api.twelvedata.com/price?symbol=${req.params.symbol}&apikey=${API_KEY}`);
    const currentPrice = parseFloat(priceRes.data.price);
    const high = parseFloat(prevDay.high);
    const low = parseFloat(prevDay.low);
    const close = parseFloat(prevDay.close);

    // Breakout detection
    let breakout = 'none';
    if (currentPrice > high) breakout = 'up';
    else if (currentPrice < low) breakout = 'down';

    // Basic strategy suggestion (can be expanded)
    let suggested = 'ORB';
    if (breakout === 'up') suggested = 'Trend Following (Bullish)';
    else if (breakout === 'down') suggested = 'Donchian Channel Breakout';
    else suggested = 'Wyckoff / Reversal';

    // Simulated star ranking (based on volatility, etc.)
    const stars = Math.floor(Math.random() * 3) + 3; // 3-5

    res.json({
      symbol: req.params.symbol,
      ny_close_high: high,
      ny_close_low: low,
      ny_close_close: close,
      current_price: currentPrice,
      breakout,
      suggested_strategy: suggested,
      stars,
      all_strategies: strategies.map(s => ({
        name: s,
        score: Math.floor(Math.random() * 5) + 1
      }))
    });
  } catch (e) {
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// ---- API: News with sentiment (simulated) ----
app.get('/api/news', (req, res) => {
  // In production, use NewsAPI or ForexFactory scraping
  const news = [
    { title: 'Fed signals rate hike', affected: 'EUR/USD, Gold', sentiment: 'bearish' },
    { title: 'Oil prices surge on supply fears', affected: 'XTI/USD, XBR/USD', sentiment: 'bullish' }
  ];
  res.json(news);
});

// ---- API: Admin Login ----
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ userId: 1, isAdmin: true }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// ---- API: Admin - Get Users ----
app.get('/api/admin/users', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.sendStatus(403);
  res.json(users);
});

// ---- API: Admin - Mass Email (simulated) ----
app.post('/api/admin/mass-email', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.sendStatus(403);
  const { subject, message } = req.body;
  // In production, use SendGrid or Nodemailer
  console.log(`Mass email to ${users.length} users: ${subject}`);
  res.json({ success: true, recipients: users.length });
});

// ---- API: Admin - Grant Temporary Access ----
app.post('/api/admin/grant', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.sendStatus(403);
  const { userEmail, hours } = req.body;
  const tempToken = jwt.sign(
    { email: userEmail, grantExpiry: Date.now() + hours * 3600000 },
    JWT_SECRET
  );
  res.json({ tempToken });
});

// ---- API: User Registration ----
app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email exists' });
  users.push({
    id: users.length + 1,
    email,
    passwordHash: password, // WARNING: plaintext for demo only
    subscriptionTier: 'free',
    subscriptionExpiry: null,
    isAdmin: false
  });
  const token = jwt.sign({ userId: users.length, isAdmin: false }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// ---- API: User Login ----
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && u.passwordHash === password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ userId: user.id, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// ---- API: Simulated Trade Execution (placeholder for MT5 bridge) ----
app.post('/api/trade/execute', authMiddleware, (req, res) => {
  const { symbol, volume, action } = req.body;
  // Here you would call your MT5/MT4 bridge later
  const trade = {
    id: trades.length + 1,
    userId: req.user.userId,
    symbol,
    volume,
    action,
    openTime: new Date(),
    profit: 0
  };
  trades.push(trade);
  res.json({ success: true, tradeId: trade.id });
});

// ---- API: Daily Views ----
app.get('/api/admin/views', (req, res) => {
  incrementView();
  res.json({ views: dailyViews.count });
});

// ---- Serve frontend pages ----
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
