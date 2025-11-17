import express from 'express';
import dayjs from 'dayjs';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

// These will come from Render environment variables later
const GHL_API_KEY = process.env.GHL_API_KEY || '';
const FORMATTED_CV_ID = process.env.FORMATTED_CV_ID || '';

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

    // Combine date + time into a single string that JS Date can parse reasonably
    const raw = `${webinar_date} ${webinar_time}`;

    // Parse with plain JS Date
    const d = new Date(raw);
    if (isNaN(d.getTime())) {
      return res.status(400).json({ error: 'Invalid date/time', raw });
    }

    // Build pretty string manually: "Thursday, December 30th @ 11:00 AM EST"
    const weekdays = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    function dayWithSuffix(n) {
      if (n > 3 && n < 21) return n + "th";
      switch (n % 10) {
        case 1: return n + "st";
        case 2: return n + "nd";
        case 3: return n + "rd";
        default: return n + "th";
      }
    }

    function formatTime(date) {
      let h = date.getHours();
      let m = date.getMinutes();
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      if (h === 0) h = 12;
      const mm = m < 10 ? '0' + m : '' + m;
      return `${h}:${mm} ${ampm}`;
    }

    const weekday = weekdays[d.getDay()];
    const monthName = months[d.getMonth()];
    const dayText = dayWithSuffix(d.getDate());
    const timeText = formatTime(d);
    const zoneText = tzLabel || 'EST';

    const formatted = `${weekday}, ${monthName} ${dayText} @ ${timeText} ${zoneText}`;
    console.log('Formatting webinar as:', formatted);

    // If no GHL vars set, just return the formatted value (for testing)
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
