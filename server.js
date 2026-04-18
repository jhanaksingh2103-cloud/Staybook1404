/**
 * StayBook — Full Stack Server
 * Replit Ready: runs on process.env.PORT automatically
 */

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Authentication ──────────────────────────────────────────
const USERS = {
  'admin': { password: 'admin123', name: 'Admin User' },
  'host': { password: 'host123', name: 'Host User' }
};

const VALID_TOKENS = new Set();

// Simple token generator
function generateToken() {
  return uuidv4();
}

// Auth middleware
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !VALID_TOKENS.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

// ── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve properties page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'properties.html'));
});

// Keep explicit app and login routes
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve static files for public assets
app.use(express.static(path.join(__dirname, 'public')));

// ── Database ────────────────────────────────────────────────
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'staybook.db');
const db = new Database(DB_PATH);
console.log(`🗄️ Using DB at: ${DB_PATH}`);

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id           TEXT PRIMARY KEY,
    property_id  TEXT DEFAULT 'property-1',
    guest_name   TEXT NOT NULL,
    guest_email  TEXT NOT NULL,
    guest_phone  TEXT DEFAULT '',
    check_in     TEXT NOT NULL,
    check_out    TEXT NOT NULL,
    check_in_time TEXT DEFAULT '14:00',
    check_out_time TEXT DEFAULT '11:00',
    guests       INTEGER DEFAULT 1,
    nights       INTEGER DEFAULT 1,
    amount       INTEGER DEFAULT 0,
    status       TEXT DEFAULT 'pending',
    color        TEXT DEFAULT '#0d9488',
    initials     TEXT DEFAULT '??',
    booking_source TEXT DEFAULT 'personal',
    form_link    TEXT DEFAULT '',
    form_sent    INTEGER DEFAULT 0,
    form_sent_at TEXT DEFAULT NULL,
    host_notes   TEXT DEFAULT '',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS form_responses (
    id            TEXT PRIMARY KEY,
    booking_id    TEXT NOT NULL,
    response_data TEXT NOT NULL,
    submitted_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
  );

  CREATE TABLE IF NOT EXISTS host_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Safe migrations for existing DBs
const bookingCols = db.prepare("PRAGMA table_info(bookings)").all().map(c => c.name);
if (!bookingCols.includes('booking_source')) {
  db.exec("ALTER TABLE bookings ADD COLUMN booking_source TEXT DEFAULT 'personal';");
}
if (!bookingCols.includes('property_id')) {
  db.exec("ALTER TABLE bookings ADD COLUMN property_id TEXT DEFAULT 'property-1';");
}
db.exec("UPDATE bookings SET property_id='property-1' WHERE property_id IS NULL OR trim(property_id)='';");
db.exec("UPDATE bookings SET property_id='property-1' WHERE property_id NOT IN ('property-1','property-2','property-3','property-4');");

// ── Seed demo data ──────────────────────────────────────────
const count = db.prepare('SELECT COUNT(*) as c FROM bookings').get();
if (count.c === 0) {
  console.log('🌱 Seeding demo data...');

  const ins = db.prepare(`
    INSERT INTO bookings
      (id,guest_name,guest_email,guest_phone,check_in,check_out,check_in_time,check_out_time,guests,nights,amount,status,color,initials,form_link,form_sent,form_sent_at,host_notes)
    VALUES
      (@id,@guest_name,@guest_email,@guest_phone,@check_in,@check_out,@check_in_time,@check_out_time,@guests,@nights,@amount,@status,@color,@initials,@form_link,@form_sent,@form_sent_at,@host_notes)
  `);

  const now = new Date().getFullYear();
  const nm = new Date().getMonth();

  // Use current month for demo bookings so they always show up
  const pad = n => String(n).padStart(2,'0');
  const date = (d) => `${now}-${pad(nm+1)}-${pad(d)}`;

  const seeds = [
    { id: uuidv4(), guest_name:'Sarah Mehta',  guest_email:'sarah.m@email.com',  guest_phone:'+91 98765 43210',
      check_in:date(6), check_out:date(8), check_in_time:'14:00', check_out_time:'11:00', guests:2, nights:3, amount:12500,
      status:'confirmed', color:'#0d9488', initials:'SM',
      form_link:'https://forms.gle/example', form_sent:1, form_sent_at:date(1)+'T10:00:00',
      host_notes:'Repeat guest. Very clean. ⭐⭐⭐⭐⭐' },
    { id: uuidv4(), guest_name:'Priya Kapoor', guest_email:'priya.k@email.com',  guest_phone:'+91 91234 56789',
      check_in:date(14), check_out:date(16), check_in_time:'15:00', check_out_time:'10:00', guests:3, nights:3, amount:12300,
      status:'confirmed', color:'#6366f1', initials:'PK',
      form_link:'https://forms.gle/example2', form_sent:1, form_sent_at:date(5)+'T14:00:00',
      host_notes:'First time guest. Verified ID.' },
    { id: uuidv4(), guest_name:'Rahul Desai',  guest_email:'rahul.d@email.com',  guest_phone:'+91 90000 11122',
      check_in:date(20), check_out:date(22), check_in_time:'16:00', check_out_time:'11:00', guests:4, nights:3, amount:13500,
      status:'pending', color:'#f59e0b', initials:'RD',
      form_link:'', form_sent:0, form_sent_at:null, host_notes:'' },
    { id: uuidv4(), guest_name:'Anjali Singh', guest_email:'anjali.s@email.com', guest_phone:'+91 99887 76655',
      check_in:date(25), check_out:date(27), check_in_time:'14:30', check_out_time:'11:30', guests:1, nights:3, amount:12300,
      status:'confirmed', color:'#ec4899', initials:'AS',
      form_link:'', form_sent:0, form_sent_at:null, host_notes:'' }
  ];

  seeds.forEach(b => ins.run(b));

  // Seed form responses for Sarah & Priya
  const sarahId = db.prepare("SELECT id FROM bookings WHERE guest_name='Sarah Mehta'").get()?.id;
  const priyaId = db.prepare("SELECT id FROM bookings WHERE guest_name='Priya Kapoor'").get()?.id;

  const insR = db.prepare(`INSERT INTO form_responses (id, booking_id, response_data) VALUES (?, ?, ?)`);

  if (sarahId) insR.run(uuidv4(), sarahId, JSON.stringify({
    'Purpose of stay': 'Leisure trip with family',
    'Estimated arrival time': '3:00 PM',
    'Special requests': 'Baby cot needed, quiet room preferred',
    'ID proof type': 'Aadhar Card',
    'Emergency contact': '+91 87654 32100',
    'Dietary restrictions': 'Vegetarian'
  }));

  if (priyaId) insR.run(uuidv4(), priyaId, JSON.stringify({
    'Purpose of stay': 'Business trip',
    'Estimated arrival time': '6:00 PM',
    'Special requests': 'Early check-in if possible',
    'ID proof type': 'Passport',
    'Emergency contact': '+91 76543 21098',
    'Dietary restrictions': 'None'
  }));

  // Default settings
  const insSetting = db.prepare("INSERT OR IGNORE INTO host_settings VALUES (?, ?)");
  insSetting.run('property_name', 'My Property');
  insSetting.run('price_per_night', '4100');
  insSetting.run('google_form_link', 'https://docs.google.com/forms/d/e/1FAIpQLSdXNH19FkTCYcSeQSiX38v-fWaVNM2_icyQBohKSSdDEdZPLw/viewform?usp=header');

  console.log('✅ Demo data seeded!');
}

// Seed default email settings
const insSettingDefault = db.prepare("INSERT OR IGNORE INTO host_settings VALUES (?, ?)");
insSettingDefault.run('gmail_user', '');
insSettingDefault.run('gmail_app_password', '');

// ── Helpers ─────────────────────────────────────────────────
const SOURCE_COLORS = {
  personal: '#86efac', // light green
  airbnb: '#fca5a5'    // light red
};
const normalizeSource = (s) => (String(s || 'personal').toLowerCase() === 'airbnb' ? 'airbnb' : 'personal');
const colorForSource = (s) => SOURCE_COLORS[normalizeSource(s)] || SOURCE_COLORS.personal;
const getInitials = name => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

const safeParseResponseData = (raw) => {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
};

const withResponses = (b) => {
  const responses = db.prepare('SELECT * FROM form_responses WHERE booking_id = ? ORDER BY submitted_at DESC').all(b.id);
  const latest = responses[0] || null;
  const responseHistory = responses.map(r => ({
    id: r.id,
    submitted_at: r.submitted_at,
    response_data: safeParseResponseData(r.response_data)
  }));
  const booking_source = normalizeSource(b.booking_source);
  return {
    ...b,
    booking_source,
    color: colorForSource(booking_source),
    form_sent: !!b.form_sent,
    form_responded: responseHistory.length > 0,
    form_response_count: responseHistory.length,
    form_responses: latest ? safeParseResponseData(latest.response_data) : {},
    form_responses_history: responseHistory
  };
};

// ── ROUTES ──────────────────────────────────────────────────

// Authentication endpoints
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  const user = USERS[username];
  
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  
  const token = generateToken();
  VALID_TOKENS.add(token);
  
  res.json({
    success: true,
    token,
    username,
    name: user.name
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    VALID_TOKENS.delete(token);
  }
  
  res.json({ success: true });
});

app.get('/api/auth/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !VALID_TOKENS.has(token)) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  res.json({ success: true });
});

// Protected routes - require authentication
// GET /api/bookings
app.get('/api/bookings', requireAuth, (req, res) => {
  const { month, year, property_id } = req.query;
  const pid = String(property_id || 'property-1');
  let q = "SELECT * FROM bookings WHERE status != 'cancelled'";
  const p = [pid];
  q += ' AND property_id = ?';
  if (month !== undefined && year !== undefined) {
    q += " AND strftime('%m', check_in) = ? AND strftime('%Y', check_in) = ?";
    p.push(String(parseInt(month) + 1).padStart(2, '0'), String(year));
  }
  q += ' ORDER BY check_in ASC';
  const rows = db.prepare(q).all(...p);
  res.json({ success: true, data: rows.map(withResponses) });
});

// GET /api/bookings/:id
app.get('/api/bookings/:id', requireAuth, (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: withResponses(b) });
});

// POST /api/bookings
app.post('/api/bookings', requireAuth, (req, res) => {
  const { guest_name, guest_email, guest_phone, check_in, check_out, check_in_time, check_out_time, guests, amount, booking_source, property_id } = req.body || {};
  const normalizedPropertyId = String(property_id || 'property-1').trim() || 'property-1';
  const normalizedCheckInTime = String(check_in_time || '14:00').trim() || '14:00';
  const normalizedCheckOutTime = String(check_out_time || '11:00').trim() || '11:00';
  const parsedGuests = guests === undefined || guests === null || String(guests).trim() === ''
    ? 1
    : parseInt(guests, 10);
  const requiredFields = {
    guest_name,
    guest_phone,
    check_in,
    check_out,
    amount
  };

  const missingFields = Object.entries(requiredFields)
    .filter(([, v]) => v === undefined || v === null || String(v).trim() === '')
    .map(([k]) => k);

  if (missingFields.length) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missingFields.join(', ')}`
    });
  }

  const parsedAmount = parseInt(amount, 10);
  if (Number.isNaN(parsedAmount) || parsedAmount <= 0)
    return res.status(400).json({ success: false, message: 'Amount is required and must be greater than 0' });

  if (Number.isNaN(parsedGuests) || parsedGuests <= 0)
    return res.status(400).json({ success: false, message: 'Guests is required and must be greater than 0' });

  const newCheckIn = normalizedCheckInTime;
  const newCheckOut = normalizedCheckOutTime;

  const checkInDate = new Date(check_in);
  const checkOutDate = new Date(check_out);
  if (checkOutDate < checkInDate) {
    return res.status(400).json({
      success: false,
      message: 'Check-out must be on or after check-in date'
    });
  }

  // Check for overlapping bookings with time consideration
  const overlap = db.prepare(`
    SELECT guest_name, check_in, check_out, check_in_time, check_out_time FROM bookings 
    WHERE status != 'cancelled' 
    AND property_id = ?
    AND NOT (
      (check_out < ? OR (check_out = ? AND check_out_time <= ?)) OR
      (check_in > ? OR (check_in = ? AND check_in_time >= ?))
    )
  `).get(normalizedPropertyId, check_in, check_in, newCheckIn, check_out, check_out, newCheckOut);

  if (overlap) {
    const overlapCheckIn = `${overlap.check_in} ${overlap.check_in_time}`;
    const overlapCheckOut = `${overlap.check_out} ${overlap.check_out_time}`;
    return res.status(409).json({ 
      success: false, 
      message: `Booking conflicts with ${overlap.guest_name} (${overlapCheckIn} to ${overlapCheckOut})` 
    });
  }

  const nights = Math.max(1, Math.ceil((new Date(check_out) - new Date(check_in)) / 86400000));
  const normalizedSource = normalizeSource(booking_source);
  const b = {
    id: uuidv4(), guest_name, guest_email: guest_email || '',
    property_id: normalizedPropertyId,
    guest_phone,
    check_in, check_out,
    check_in_time: normalizedCheckInTime,
    check_out_time: normalizedCheckOutTime,
    guests: parsedGuests,
    nights,
    amount: parsedAmount,
    status: 'pending',
    color: colorForSource(normalizedSource),
    initials: getInitials(guest_name),
    booking_source: normalizedSource,
    form_link: '', form_sent: 0, form_sent_at: null, host_notes: ''
  };

  db.prepare(`
    INSERT INTO bookings (id,property_id,guest_name,guest_email,guest_phone,check_in,check_out,check_in_time,check_out_time,guests,nights,amount,status,color,initials,booking_source,form_link,form_sent,host_notes)
    VALUES (@id,@property_id,@guest_name,@guest_email,@guest_phone,@check_in,@check_out,@check_in_time,@check_out_time,@guests,@nights,@amount,@status,@color,@initials,@booking_source,@form_link,@form_sent,@host_notes)
  `).run(b);

  res.status(201).json({ success: true, data: { ...b, form_responded: false, form_responses: {} } });
});

// PATCH /api/bookings/:id
app.patch('/api/bookings/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  if (!existing)
    return res.status(404).json({ success: false, message: 'Not found' });

  const allowed = [
    'status','host_notes','form_link',
    'guest_name','guest_email','guest_phone',
    'check_in','check_out','check_in_time','check_out_time',
    'guests','amount','booking_source'
  ];
  const updates = {};
  allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  if (!Object.keys(updates).length)
    return res.status(400).json({ success: false, message: 'Nothing to update' });

  const merged = {
    ...existing,
    ...updates
  };

  const requiredFields = {
    guest_name: merged.guest_name,
    guest_phone: merged.guest_phone,
    check_in: merged.check_in,
    check_out: merged.check_out,
    amount: merged.amount
  };

  const missingFields = Object.entries(requiredFields)
    .filter(([, v]) => v === undefined || v === null || String(v).trim() === '')
    .map(([k]) => k);

  if (missingFields.length) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missingFields.join(', ')}`
    });
  }

  const parsedAmount = parseInt(merged.amount, 10);
  if (Number.isNaN(parsedAmount) || parsedAmount <= 0)
    return res.status(400).json({ success: false, message: 'Amount is required and must be greater than 0' });

  const normalizedCheckInTime = String(merged.check_in_time || '14:00').trim() || '14:00';
  const normalizedCheckOutTime = String(merged.check_out_time || '11:00').trim() || '11:00';
  const parsedGuests = merged.guests === undefined || merged.guests === null || String(merged.guests).trim() === ''
    ? 1
    : parseInt(merged.guests, 10);

  if (Number.isNaN(parsedGuests) || parsedGuests <= 0)
    return res.status(400).json({ success: false, message: 'Guests is required and must be greater than 0' });

  const checkInDateTime = new Date(`${merged.check_in}T${normalizedCheckInTime}`);
  const checkOutDateTime = new Date(`${merged.check_out}T${normalizedCheckOutTime}`);
  if (checkOutDateTime <= checkInDateTime) {
    return res.status(400).json({
      success: false,
      message: 'Check-out must be after check-in'
    });
  }

  // Check overlap against other bookings (exclude current booking id)
  const overlap = db.prepare(`
    SELECT guest_name, check_in, check_out, check_in_time, check_out_time FROM bookings
    WHERE status != 'cancelled'
      AND id != ?
      AND property_id = ?
      AND NOT (
        (check_out < ? OR (check_out = ? AND check_out_time <= ?)) OR
        (check_in > ? OR (check_in = ? AND check_in_time >= ?))
      )
    LIMIT 1
  `).get(id, merged.property_id || 'property-1', merged.check_in, merged.check_in, normalizedCheckInTime, merged.check_out, merged.check_out, normalizedCheckOutTime);

  if (overlap) {
    const overlapCheckIn = `${overlap.check_in} ${overlap.check_in_time}`;
    const overlapCheckOut = `${overlap.check_out} ${overlap.check_out_time}`;
    return res.status(409).json({
      success: false,
      message: `Booking conflicts with ${overlap.guest_name} (${overlapCheckIn} to ${overlapCheckOut})`
    });
  }

  updates.check_in_time = normalizedCheckInTime;
  updates.check_out_time = normalizedCheckOutTime;
  updates.amount = parsedAmount;
  updates.guests = parsedGuests;
  if (updates.booking_source !== undefined) {
    updates.booking_source = normalizeSource(updates.booking_source);
    updates.color = colorForSource(updates.booking_source);
  }
  updates.nights = Math.max(1, Math.ceil((new Date(merged.check_out) - new Date(merged.check_in)) / 86400000));
  if (updates.guest_name !== undefined) {
    updates.initials = getInitials(String(merged.guest_name));
  }
  updates.updated_at = new Date().toISOString();
  const set = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE bookings SET ${set} WHERE id = @id`).run({ ...updates, id });

  res.json({ success: true, data: withResponses(db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)) });
});

// DELETE /api/bookings/:id  (cancel)
app.delete('/api/bookings/:id', requireAuth, (req, res) => {
  db.prepare("UPDATE bookings SET status='cancelled', updated_at=? WHERE id=?")
    .run(new Date().toISOString(), req.params.id);
  res.json({ success: true, message: 'Booking cancelled' });
});

// POST /api/bookings/:id/send-form
app.post('/api/bookings/:id/send-form', requireAuth, async (req, res) => {
  const { form_link } = req.body;
  if (!form_link) return res.status(400).json({ success: false, message: 'form_link required' });

  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ success: false, message: 'Booking not found' });
  // Get Gmail credentials from property-specific settings
  const propertySettings = readPropertySettings(b.property_id || getDefaultPropertyId());
  

  

 

    // Update DB after successful send
    const now = new Date().toISOString();
    db.prepare("UPDATE bookings SET form_link=?, form_sent=1, form_sent_at=?, updated_at=? WHERE id=?")
      .run(form_link, now, now, req.params.id);

    
  
});

// POST /api/bookings/:id/send-whatsapp
app.post('/api/bookings/:id/send-whatsapp', requireAuth, (req, res) => {
  const { form_link } = req.body;
  if (!form_link) return res.status(400).json({ success: false, message: 'form_link required' });

  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ success: false, message: 'Booking not found' });

  const rawPhone = String(b.guest_phone || '').trim();
  if (!rawPhone) {
    return res.status(400).json({ success: false, message: 'Guest phone number not found' });
  }

  // Keep digits only; WhatsApp expects country code + number without symbols
  let phone = rawPhone.replace(/\D/g, '');
  if (phone.length === 10) phone = `91${phone}`; // default to India country code for local numbers
  if (phone.length < 11) {
    return res.status(400).json({ success: false, message: 'Invalid guest phone number for WhatsApp' });
  }

  const propertyName = db.prepare("SELECT value FROM host_settings WHERE key='property_name'").get()?.value || 'StayBook';
  const message = `Hi ${b.guest_name}, please fill your guest form for ${propertyName}: ${form_link}`;
  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  const now = new Date().toISOString();
  db.prepare("UPDATE bookings SET form_link=?, form_sent=1, form_sent_at=?, updated_at=? WHERE id=?")
    .run(form_link, now, now, req.params.id);

  res.json({
    success: true,
    message: 'WhatsApp link ready',
    data: { whatsapp_url: whatsappUrl }
  });
});

// POST /api/submit-form/:id  ← PUBLIC webhook (Google Form / Apps Script posts here)
const handleSubmitForm = (req, res) => {
  const booking_id = String(req.params.id || req.params.booking_id || '').trim();
  if (!booking_id) {
    return res.status(400).json({ success: false, message: 'booking_id is required' });
  }

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking_id);
  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }

  if (!booking.form_sent_at) {
    return res.status(400).json({ success: false, message: 'Form link has not been sent for this booking yet' });
  }

  const validFrom = new Date(`${booking.check_in}T00:00:00`);
  const validUntil = new Date(`${booking.check_out}T23:59:59.999`);
  if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validUntil.getTime())) {
    return res.status(400).json({ success: false, message: 'Invalid check-in/check-out date on booking' });
  }

  const now = new Date();
  if (now < validFrom) {
    return res.status(403).json({
      success: false,
      message: `Form link will be active from check-in date (${booking.check_in})`
    });
  }

  if (now > validUntil) {
    return res.status(410).json({
      success: false,
      message: `Form link expired after checkout date (${booking.check_out})`
    });
  }

  const {
    guest_name,
    guest_phone,
    guest_email,
    members,
    photo_of_members,
    id_of_members
  } = req.body || {};

  console.log('Incoming data:', req.body || {});

  const data = {
    guest_name: guest_name || '',
    guest_phone: guest_phone || '',
    guest_email: guest_email || '',
    members: members || '',
    photo_of_members: photo_of_members || '',
    id_of_members: id_of_members || ''
  };

  db.prepare("INSERT INTO form_responses (id, booking_id, response_data) VALUES (?, ?, ?)")
    .run(uuidv4(), booking_id, JSON.stringify(data));

  const submissionCount = db.prepare('SELECT COUNT(*) as c FROM form_responses WHERE booking_id = ?').get(booking_id)?.c || 0;

  db.prepare("UPDATE bookings SET status='confirmed', updated_at=? WHERE id=?")
    .run(new Date().toISOString(), booking_id);

  console.log(`📋 Form response received for booking ${booking_id}`);
  res.json({ success: true, message: 'Response saved', data: { submission_count: submissionCount } });
};

app.post('/api/submit-form/:id', handleSubmitForm);
app.post('/api/submit-form/:booking_id', handleSubmitForm);

// GET /api/stats
app.get('/api/stats', requireAuth, (req, res) => {
  const { month, year, property_id } = req.query;
  const pid = String(property_id || 'property-1');
  const mm = String(parseInt(month ?? new Date().getMonth()) + 1).padStart(2, '0');
  const yy = String(year ?? new Date().getFullYear());

  const s = db.prepare(`
    SELECT COUNT(*) as total_bookings, SUM(nights) as total_nights, SUM(amount) as total_revenue,
      SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) as confirmed,
      SUM(CASE WHEN status='pending'   THEN 1 ELSE 0 END) as pending
    FROM bookings
    WHERE strftime('%m',check_in)=? AND strftime('%Y',check_in)=? AND status!='cancelled' AND property_id=?
  `).get(mm, yy, pid);

  const dim = new Date(parseInt(yy), parseInt(mm), 0).getDate();
  res.json({ success: true, data: {
    ...s,
    occupancy: s.total_nights ? Math.min(100, Math.round((s.total_nights / dim) * 100)) : 0
  }});
});

// GET /api/settings
app.get('/api/settings', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM host_settings').all();
  const out = {};
  rows.forEach(r => { out[r.key] = r.value; });
  res.json({ success: true, data: out });
});

// PATCH /api/settings
app.patch('/api/settings', requireAuth, (req, res) => {
  const upsert = db.prepare('INSERT OR REPLACE INTO host_settings (key, value) VALUES (?, ?)');
  Object.entries(req.body).forEach(([k, v]) => upsert.run(k, String(v)));
  res.json({ success: true, message: 'Settings updated' });
});

// Catch-all → redirect to login
app.get('*', (req, res) => {
  res.redirect('/');
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏠 StayBook running on port ${PORT}`);
  console.log(`\n📡 API Endpoints:`);
  console.log(`   GET    /api/bookings`);
  console.log(`   POST   /api/bookings`);
  console.log(`   PATCH  /api/bookings/:id`);
  console.log(`   DELETE /api/bookings/:id`);
  console.log(`   POST   /api/bookings/:id/send-form`);
  console.log(`   POST   /api/bookings/:id/send-whatsapp`);
  console.log(`   POST   /api/submit-form/:booking_id  ← Google Forms webhook`);
  console.log(`   GET    /api/stats`);
  console.log(`   GET    /api/settings\n`);
});
