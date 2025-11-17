import express from 'express';
import dayjs from 'dayjs';
import utc from 'dayjs-plugin-utc';
import timezone from 'dayjs-plugin-timezone';
import fetch from 'node-fetch';

dayjs.extend(utc);
dayjs.extend(timezone);

const app = express();
app.use(express.json());

// These will come from Render environment variables later
const GHL_API_KEY = process.env.GHL_API_KEY || '';
const FORMATTED_CV_ID = process.env.FORMATTED_CV_ID || ''; 

// Map simple timezone labels to IANA timezones
const TZ_MAP = {
  EST: 'America/New_York',
  EDT: 'America/New_York',
  CST: 'America/Chicago',
  CDT: 'America/Chicago',
  MST: 'America/Denver',
  MDT: 'America/Denver',
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles'
};

// Simple health-check route
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Webinar formatter API running' });
});

// Main route GHL will call
app.post('/format-webinar', async (req, res) => {
  try {
    const { location_id, webinar_date, webinar_time, timezone: tzLabel } = req.body;

    if (!location_id || !webinar_date || !webinar_time) {
      return res.status(400).json({ error: 'Missing location_id or webinar_date or webinar_time' });
    }

    const tzName = TZ_MAP[tzLabel] || tzLabel || 'America/New_York';
    const raw = `${webinar_date} ${webinar_time}`;

    // Parse input "YYYY-MM-DD h:mm A" in the given timezone
    const dt = dayjs.tz(raw, 'YYYY-MM-DD h:mm A', tzName);

    if (!dt.isValid()) {
      return res.status(400).json({ error: 'Invalid date/time', raw, tzName });
    }

    const formatted = dt.format('dddd, MMMM Do @ h:mm A z'); 
    console.log('Formatting webinar as:', formatted);

    if (!GHL_API_KEY || !FORMATTED_CV_ID) {
      return res.json({
        warning: 'GHL_API_KEY or FORMATTED_CV_ID not set yet',
        formatted
      });
    }

    const resp = await fetch(
      `https://services.leadconnectorhq.com/v1/custom-values/${FORMATTED_CV_ID}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GHL_API_KEY}`,
          Version: '2021-07-28'
        },
        body: JSON.stringify({
          locationId: location_id,
          value: formatted
        })
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      console.error('GHL error:', text);
      return res.status(500).json({ error: 'Failed to update CV', details: text });
    }

    return res.json({ success: true, formatted });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error', details: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Webinar formatter API listening on port', PORT);
});
