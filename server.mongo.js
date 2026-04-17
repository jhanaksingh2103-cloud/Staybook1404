/**
 * StayBook — MongoDB Server
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/staybook';

// ── Authentication ──────────────────────────────────────────
const USERS = {
  admin: { password: 'admin123', name: 'Admin User' },
  host: { password: 'host123', name: 'Host User' }
};

const VALID_TOKENS = new Set();

function generateToken() {
  return uuidv4();
}

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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'properties.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// ── MongoDB Models ──────────────────────────────────────────
const bookingSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  property_id: { type: String, default: 'property-1', index: true },
  guest_name: { type: String, required: true },
  guest_email: { type: String, default: '' },
  guest_phone: { type: String, default: '' },
  check_in: { type: String, required: true },
  check_out: { type: String, required: true },
  check_in_time: { type: String, default: '14:00' },
  check_out_time: { type: String, default: '11:00' },
  guests: { type: Number, default: 1 },
  nights: { type: Number, default: 1 },
  amount: { type: Number, default: 0 },
  status: { type: String, default: 'pending', index: true },
  color: { type: String, default: '#0d9488' },
  initials: { type: String, default: '??' },
  booking_source: { type: String, default: 'personal' },
  form_link: { type: String, default: '' },
  form_sent: { type: Boolean, default: false },
  form_sent_at: { type: String, default: null },
  host_notes: { type: String, default: '' },
  created_at: { type: String, default: () => new Date().toISOString() },
  updated_at: { type: String, default: () => new Date().toISOString() }
}, { versionKey: false });

const formResponseSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  booking_id: { type: String, required: true, index: true },
  response_data: { type: mongoose.Schema.Types.Mixed, required: true },
  submitted_at: { type: String, default: () => new Date().toISOString() }
}, { versionKey: false });

const hostSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: String, required: true }
}, { versionKey: false });

const Booking = mongoose.model('Booking', bookingSchema);
const FormResponse = mongoose.model('FormResponse', formResponseSchema);
const HostSetting = mongoose.model('HostSetting', hostSettingSchema);

// ── Helpers ─────────────────────────────────────────────────
const SOURCE_COLORS = {
  personal: '#86efac',
  airbnb: '#fca5a5'
};

const normalizeSource = (s) => (String(s || 'personal').toLowerCase() === 'airbnb' ? 'airbnb' : 'personal');
const colorForSource = (s) => SOURCE_COLORS[normalizeSource(s)] || SOURCE_COLORS.personal;
const getInitials = (name) => String(name || '').split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '??';

function toDateTime(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr || '00:00'}:00`);
}

function calculateNights(checkIn, checkOut) {
  return Math.max(1, Math.ceil((new Date(checkOut) - new Date(checkIn)) / 86400000));
}

function normalizeBookingDoc(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  delete obj._id;
  return obj;
}

async function withResponses(bookingDoc) {
  const booking = normalizeBookingDoc(bookingDoc);
  const response = await FormResponse.findOne({ booking_id: booking.id }).sort({ submitted_at: -1 }).lean();
  const booking_source = normalizeSource(booking.booking_source);

  return {
    ...booking,
    booking_source,
    color: colorForSource(booking_source),
    form_sent: !!booking.form_sent,
    form_responded: !!response,
    form_responses: response ? response.response_data : {}
  };
}

async function hasOverlap({ property_id, check_in, check_out, check_in_time, check_out_time, excludeId }) {
  const existing = await Booking.find({
    status: { $ne: 'cancelled' },
    property_id,
    ...(excludeId ? { id: { $ne: excludeId } } : {})
  }).lean();

  const newStart = toDateTime(check_in, check_in_time);
  const newEnd = toDateTime(check_out, check_out_time);

  for (const b of existing) {
    const oldStart = toDateTime(b.check_in, b.check_in_time || '14:00');
    const oldEnd = toDateTime(b.check_out, b.check_out_time || '11:00');
    if (newStart < oldEnd && oldStart < newEnd) {
      return b;
    }
  }

  return null;
}

async function upsertSetting(key, value) {
  await HostSetting.findOneAndUpdate(
    { key },
    { key, value: String(value) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function seedDefaults() {
  const count = await Booking.countDocuments();
  if (count === 0) {
    console.log('🌱 Seeding demo data...');

    const now = new Date().getFullYear();
    const nm = new Date().getMonth();
    const pad = (n) => String(n).padStart(2, '0');
    const date = (d) => `${now}-${pad(nm + 1)}-${pad(d)}`;

    const seeds = [
      {
        id: uuidv4(),
        guest_name: 'Sarah Mehta',
        guest_email: 'sarah.m@email.com',
        guest_phone: '+91 98765 43210',
        check_in: date(6),
        check_out: date(8),
        check_in_time: '14:00',
        check_out_time: '11:00',
        guests: 2,
        nights: 3,
        amount: 12500,
        status: 'confirmed',
        color: '#0d9488',
        initials: 'SM',
        booking_source: 'personal',
        form_link: 'https://forms.gle/example',
        form_sent: true,
        form_sent_at: `${date(1)}T10:00:00`,
        host_notes: 'Repeat guest. Very clean. ⭐⭐⭐⭐⭐',
        property_id: 'property-1'
      },
      {
        id: uuidv4(),
        guest_name: 'Priya Kapoor',
        guest_email: 'priya.k@email.com',
        guest_phone: '+91 91234 56789',
        check_in: date(14),
        check_out: date(16),
        check_in_time: '15:00',
        check_out_time: '10:00',
        guests: 3,
        nights: 3,
        amount: 12300,
        status: 'confirmed',
        color: '#6366f1',
        initials: 'PK',
        booking_source: 'personal',
        form_link: 'https://forms.gle/example2',
        form_sent: true,
        form_sent_at: `${date(5)}T14:00:00`,
        host_notes: 'First time guest. Verified ID.',
        property_id: 'property-1'
      }
    ];

    await Booking.insertMany(seeds);

    await FormResponse.create({
      id: uuidv4(),
      booking_id: seeds[0].id,
      response_data: {
        'Purpose of stay': 'Leisure trip with family',
        'Estimated arrival time': '3:00 PM',
        'Special requests': 'Baby cot needed, quiet room preferred'
      }
    });

    await FormResponse.create({
      id: uuidv4(),
      booking_id: seeds[1].id,
      response_data: {
        'Purpose of stay': 'Business trip',
        'Estimated arrival time': '6:00 PM',
        'Special requests': 'Early check-in if possible'
      }
    });

    console.log('✅ Demo data seeded!');
  }

  await upsertSetting('property_name', 'My Property');
  await upsertSetting('price_per_night', '4100');
  await upsertSetting('google_form_link', 'https://docs.google.com/forms/d/e/1FAIpQLSdXNH19FkTCYcSeQSiX38v-fWaVNM2_icyQBohKSSdDEdZPLw/viewform?usp=header');
  await upsertSetting('gmail_user', '');
  await upsertSetting('gmail_app_password', '');
}

// ── ROUTES ──────────────────────────────────────────────────
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
  if (token) VALID_TOKENS.delete(token);
  res.json({ success: true });
});

app.get('/api/auth/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !VALID_TOKENS.has(token)) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  res.json({ success: true });
});

app.get('/api/bookings', requireAuth, async (req, res) => {
  try {
    const { month, year, property_id } = req.query;
    const pid = String(property_id || 'property-1');

    let rows = await Booking.find({
      status: { $ne: 'cancelled' },
      property_id: pid
    }).lean();

    if (month !== undefined && year !== undefined) {
      const m = String(parseInt(month, 10) + 1).padStart(2, '0');
      const y = String(year);
      rows = rows.filter((r) => String(r.check_in || '').slice(5, 7) === m && String(r.check_in || '').slice(0, 4) === y);
    }

    rows.sort((a, b) => `${a.check_in} ${a.check_in_time}`.localeCompare(`${b.check_in} ${b.check_in_time}`));

    const data = await Promise.all(rows.map((r) => withResponses(r)));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/bookings/:id', requireAuth, async (req, res) => {
  try {
    const booking = await Booking.findOne({ id: req.params.id });
    if (!booking) return res.status(404).json({ success: false, message: 'Not found' });

    res.json({ success: true, data: await withResponses(booking) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/bookings', requireAuth, async (req, res) => {
  try {
    const {
      guest_name, guest_email, guest_phone,
      check_in, check_out, check_in_time, check_out_time,
      guests, amount, booking_source, property_id
    } = req.body || {};

    const normalizedPropertyId = String(property_id || 'property-1').trim() || 'property-1';
    const normalizedCheckInTime = String(check_in_time || '14:00').trim() || '14:00';
    const normalizedCheckOutTime = String(check_out_time || '11:00').trim() || '11:00';
    const parsedGuests = guests === undefined || guests === null || String(guests).trim() === '' ? 1 : parseInt(guests, 10);

    const requiredFields = { guest_name, guest_phone, check_in, check_out, amount };
    const missingFields = Object.entries(requiredFields)
      .filter(([, v]) => v === undefined || v === null || String(v).trim() === '')
      .map(([k]) => k);

    if (missingFields.length) {
      return res.status(400).json({ success: false, message: `Missing required fields: ${missingFields.join(', ')}` });
    }

    const parsedAmount = parseInt(amount, 10);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount is required and must be greater than 0' });
    }

    if (Number.isNaN(parsedGuests) || parsedGuests <= 0) {
      return res.status(400).json({ success: false, message: 'Guests is required and must be greater than 0' });
    }

    const checkInDate = new Date(check_in);
    const checkOutDate = new Date(check_out);
    if (checkOutDate < checkInDate) {
      return res.status(400).json({ success: false, message: 'Check-out must be on or after check-in date' });
    }

    const overlap = await hasOverlap({
      property_id: normalizedPropertyId,
      check_in,
      check_out,
      check_in_time: normalizedCheckInTime,
      check_out_time: normalizedCheckOutTime
    });

    if (overlap) {
      const overlapCheckIn = `${overlap.check_in} ${overlap.check_in_time}`;
      const overlapCheckOut = `${overlap.check_out} ${overlap.check_out_time}`;
      return res.status(409).json({
        success: false,
        message: `Booking conflicts with ${overlap.guest_name} (${overlapCheckIn} to ${overlapCheckOut})`
      });
    }

    const normalizedSource = normalizeSource(booking_source);
    const booking = {
      id: uuidv4(),
      guest_name,
      guest_email: guest_email || '',
      property_id: normalizedPropertyId,
      guest_phone,
      check_in,
      check_out,
      check_in_time: normalizedCheckInTime,
      check_out_time: normalizedCheckOutTime,
      guests: parsedGuests,
      nights: calculateNights(check_in, check_out),
      amount: parsedAmount,
      status: 'pending',
      color: colorForSource(normalizedSource),
      initials: getInitials(guest_name),
      booking_source: normalizedSource,
      form_link: '',
      form_sent: false,
      form_sent_at: null,
      host_notes: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await Booking.create(booking);
    res.status(201).json({ success: true, data: { ...booking, form_responded: false, form_responses: {} } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.patch('/api/bookings/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Booking.findOne({ id }).lean();
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });

    const allowed = [
      'status', 'host_notes', 'form_link',
      'guest_name', 'guest_email', 'guest_phone',
      'check_in', 'check_out', 'check_in_time', 'check_out_time',
      'guests', 'amount', 'booking_source'
    ];

    const updates = {};
    allowed.forEach((f) => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    const merged = { ...existing, ...updates };

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
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount is required and must be greater than 0' });
    }

    const normalizedCheckInTime = String(merged.check_in_time || '14:00').trim() || '14:00';
    const normalizedCheckOutTime = String(merged.check_out_time || '11:00').trim() || '11:00';
    const parsedGuests = merged.guests === undefined || merged.guests === null || String(merged.guests).trim() === '' ? 1 : parseInt(merged.guests, 10);

    if (Number.isNaN(parsedGuests) || parsedGuests <= 0) {
      return res.status(400).json({ success: false, message: 'Guests is required and must be greater than 0' });
    }

    const checkInDateTime = toDateTime(merged.check_in, normalizedCheckInTime);
    const checkOutDateTime = toDateTime(merged.check_out, normalizedCheckOutTime);

    if (checkOutDateTime <= checkInDateTime) {
      return res.status(400).json({ success: false, message: 'Check-out must be after check-in' });
    }

    const overlap = await hasOverlap({
      property_id: merged.property_id || 'property-1',
      check_in: merged.check_in,
      check_out: merged.check_out,
      check_in_time: normalizedCheckInTime,
      check_out_time: normalizedCheckOutTime,
      excludeId: id
    });

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
    updates.nights = calculateNights(merged.check_in, merged.check_out);

    if (updates.booking_source !== undefined) {
      updates.booking_source = normalizeSource(updates.booking_source);
      updates.color = colorForSource(updates.booking_source);
    }

    if (updates.guest_name !== undefined) {
      updates.initials = getInitials(String(merged.guest_name));
    }

    updates.updated_at = new Date().toISOString();

    await Booking.updateOne({ id }, { $set: updates });
    const updated = await Booking.findOne({ id });

    res.json({ success: true, data: await withResponses(updated) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/bookings/:id', requireAuth, async (req, res) => {
  try {
    await Booking.updateOne(
      { id: req.params.id },
      { $set: { status: 'cancelled', updated_at: new Date().toISOString() } }
    );

    res.json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/bookings/:id/send-form', requireAuth, async (req, res) => {
  try {
    const { form_link } = req.body;
    if (!form_link) return res.status(400).json({ success: false, message: 'form_link required' });

    const b = await Booking.findOne({ id: req.params.id }).lean();
    if (!b) return res.status(404).json({ success: false, message: 'Booking not found' });

    const now = new Date().toISOString();
    await Booking.updateOne(
      { id: req.params.id },
      { $set: { form_link, form_sent: true, form_sent_at: now, updated_at: now } }
    );

    res.json({ success: true, message: 'Form link marked as sent' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/bookings/:id/send-whatsapp', requireAuth, async (req, res) => {
  try {
    const { form_link } = req.body;
    if (!form_link) return res.status(400).json({ success: false, message: 'form_link required' });

    const b = await Booking.findOne({ id: req.params.id }).lean();
    if (!b) return res.status(404).json({ success: false, message: 'Booking not found' });

    const rawPhone = String(b.guest_phone || '').trim();
    if (!rawPhone) {
      return res.status(400).json({ success: false, message: 'Guest phone number not found' });
    }

    let phone = rawPhone.replace(/\D/g, '');
    if (phone.length === 10) phone = `91${phone}`;
    if (phone.length < 11) {
      return res.status(400).json({ success: false, message: 'Invalid guest phone number for WhatsApp' });
    }

    const setting = await HostSetting.findOne({ key: 'property_name' }).lean();
    const propertyName = setting?.value || 'StayBook';
    const message = `Hi ${b.guest_name}, please fill your guest form for ${propertyName}: ${form_link}`;
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    const now = new Date().toISOString();
    await Booking.updateOne(
      { id: req.params.id },
      { $set: { form_link, form_sent: true, form_sent_at: now, updated_at: now } }
    );

    res.json({
      success: true,
      message: 'WhatsApp link ready',
      data: { whatsapp_url: whatsappUrl }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

async function handleSubmitForm(req, res) {
  try {
    const booking_id = String(req.params.id || req.params.booking_id || '').trim();
    if (!booking_id) {
      return res.status(400).json({ success: false, message: 'booking_id is required' });
    }

    const booking = await Booking.findOne({ id: booking_id }).lean();
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

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

    const existingResponse = await FormResponse.findOne({ booking_id }).lean();
    if (existingResponse) {
      return res.json({ success: true, message: 'Form already submitted for this booking' });
    }

    await FormResponse.create({
      id: uuidv4(),
      booking_id,
      response_data: data,
      submitted_at: new Date().toISOString()
    });

    await Booking.updateOne(
      { id: booking_id },
      { $set: { status: 'confirmed', updated_at: new Date().toISOString() } }
    );

    console.log(`📋 Form response received for booking ${booking_id}`);
    res.json({ success: true, message: 'Response saved' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

app.post('/api/submit-form/:id', handleSubmitForm);
app.post('/api/submit-form/:booking_id', handleSubmitForm);

app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const { month, year, property_id } = req.query;
    const pid = String(property_id || 'property-1');
    const mm = String(parseInt(month ?? new Date().getMonth(), 10) + 1).padStart(2, '0');
    const yy = String(year ?? new Date().getFullYear());

    const rows = await Booking.find({
      status: { $ne: 'cancelled' },
      property_id: pid
    }).lean();

    const scoped = rows.filter((r) => String(r.check_in || '').slice(5, 7) === mm && String(r.check_in || '').slice(0, 4) === yy);

    const total_bookings = scoped.length;
    const total_nights = scoped.reduce((acc, b) => acc + (Number(b.nights) || 0), 0);
    const total_revenue = scoped.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);
    const confirmed = scoped.filter((b) => b.status === 'confirmed').length;
    const pending = scoped.filter((b) => b.status === 'pending').length;

    const dim = new Date(parseInt(yy, 10), parseInt(mm, 10), 0).getDate();

    res.json({
      success: true,
      data: {
        total_bookings,
        total_nights,
        total_revenue,
        confirmed,
        pending,
        occupancy: total_nights ? Math.min(100, Math.round((total_nights / dim) * 100)) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const rows = await HostSetting.find({}).lean();
    const out = {};
    rows.forEach((r) => { out[r.key] = r.value; });
    res.json({ success: true, data: out });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.patch('/api/settings', requireAuth, async (req, res) => {
  try {
    const entries = Object.entries(req.body || {});
    await Promise.all(entries.map(([k, v]) => upsertSetting(k, String(v))));
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('*', (req, res) => {
  res.redirect('/');
});

// ── Start ───────────────────────────────────────────────────
async function start() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    });

    console.log(`🗄️ Connected to MongoDB: ${MONGODB_URI}`);

    await seedDefaults();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🏠 StayBook running on port ${PORT}`);
      console.log(`\n📡 API Endpoints:`);
      console.log(`   GET    /api/bookings`);
      console.log(`   POST   /api/bookings`);
      console.log(`   PATCH  /api/bookings/:id`);
      console.log(`   DELETE /api/bookings/:id`);
      console.log(`   POST   /api/bookings/:id/send-form`);
      console.log(`   POST   /api/bookings/:id/send-whatsapp`);
      console.log(`   POST   /api/submit-form/:booking_id`);
      console.log(`   GET    /api/stats`);
      console.log(`   GET    /api/settings\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
