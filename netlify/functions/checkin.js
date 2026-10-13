const { createClient } = require('@supabase/supabase-js');
const querystring = require('querystring');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_KEY environment variables' })
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    let rawData = {};
    if (event.body) {
      try {
        rawData = JSON.parse(event.body);
      } catch (e) {
        rawData = querystring.parse(event.body);
      }
    }

    // Διαγραφή Εγγραφής (Admin PIN 9999)
    if (rawData.action === 'DELETE' && rawData.recordId) {
      const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('id', rawData.recordId);

      if (error) throw error;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Record deleted successfully' })
      };
    }

    // Ανάγνωση εισερχόμενων παραμέτρων από διάφορα κανάλια
    let rawInput = rawData.callsign || rawData.Digits || rawData.Body || rawData.text || '';
    let name = rawData.name || rawData.From || 'Στέλεχος ΕΟΔΑ';
    let channel = rawData.channel || (rawData.Digits ? '📞 Phone IVR' : (rawData.From ? '✉️ SMS / Webhook' : '🌐 Web App'));
    let action = rawData.action || 'ON';

    rawInput = rawInput.trim();

    // Ανάγνωση πρόθεσης 1 (Check-in) ή 2 (Check-out)
    if (rawInput.startsWith('1')) {
      action = 'ON';
      rawInput = rawInput.substring(1).trim();
    } else if (rawInput.startsWith('2')) {
      action = 'OFF';
      rawInput = rawInput.substring(1).trim();
    }

    // Καθαρισμός και μορφοποίηση Callsign
    let numOnly = rawInput.replace(/[^0-9]/g, '');
    let callsign = rawInput;

    if (['0352', '352', '0306', '306', '0307', '307'].includes(numOnly)) {
      callsign = numOnly.replace(/^0+/, '');
    } else if (numOnly) {
      callsign = 'ΑΤ-' + numOnly;
    }

    if (!callsign) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid or missing callsign' })
      };
    }

    const now = new Date().toISOString();

    if (action === 'ON') {
      // 🟢 CHECK-IN
      const { data, error } = await supabase
        .from('attendance')
        .insert([
          {
            callsign: callsign,
            name: name,
            status: 'ON',
            check_in: now,
            channel: channel
          }
        ]);

      if (error) throw error;

      // Επιστροφή TwiML αν είναι τηλεφωνική κλήση
      if (rawData.Digits) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'text/xml' },
          body: `<Response><Say language="el-GR">Η παρουσια για το κλητικο ${callsign} καταχωρηθηκε επιτυχως.</Say></Response>`
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: `Check-in successful for ${callsign}`, callsign, status: 'ON' })
      };
    } else {
      // 🔴 CHECK-OUT
      const { data: existingRecords, error: fetchErr } = await supabase
        .from('attendance')
        .select('*')
        .eq('callsign', callsign)
        .eq('status', 'ON')
        .order('check_in', { ascending: false })
        .limit(1);

      if (fetchErr) throw fetchErr;

      let durationMinutes = null;
      if (existingRecords && existingRecords.length > 0) {
        const checkInTime = new Date(existingRecords[0].check_in);
        const checkOutTime = new Date(now);
        durationMinutes = Math.round((checkOutTime - checkInTime) / (1000 * 60));
      }

      const { error: updateErr } = await supabase
        .from('attendance')
        .update({
          status: 'OFF',
          check_out: now,
          duration_minutes: durationMinutes
        })
        .eq('callsign', callsign)
        .eq('status', 'ON');

      if (updateErr) throw updateErr;

      if (rawData.Digits) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'text/xml' },
          body: `<Response><Say language="el-GR">Η αποχωρηση για το κλητικο ${callsign} καταχωρηθηκε επιτυχως.</Say></Response>`
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: `Check-out successful for ${callsign}`, callsign, status: 'OFF', duration_minutes: durationMinutes })
      };
    }

  } catch (err) {
    console.error('Serverless Error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
