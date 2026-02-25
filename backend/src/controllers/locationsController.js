const path = require('path');
const fs = require('fs');

let cached = null;

function getLocations() {
  if (cached) return cached;
  const filePath = path.join(__dirname, '../../data/locations.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    cached = JSON.parse(raw);
    return cached;
  } catch (err) {
    return { countries: [], states: [], cities: [] };
  }
}

function getCountries(req, res) {
  try {
    const { countries } = getLocations();
    res.json({ success: true, data: countries || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function getStates(req, res) {
  try {
    const { country_id } = req.query;
    if (!country_id) {
      return res.json({ success: true, data: [] });
    }
    const { states } = getLocations();
    const list = (states || []).filter(s => s.country_id === country_id);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function getCities(req, res) {
  try {
    const { state_id } = req.query;
    if (!state_id) {
      return res.json({ success: true, data: [] });
    }
    const { cities } = getLocations();
    const list = (cities || []).filter(c => c.state_id === state_id);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getCountries,
  getStates,
  getCities
};
