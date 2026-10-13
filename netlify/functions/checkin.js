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

  let params = event.queryStringParameters || {};
  if (event.body) {
    try {
      params = { ...params, ...JSON.parse(event.body) };
    } catch (e) {
      const querystring = require('querystring');
      params = { ...params, ...querystring.parse(event.body) };
    }
  }

  // Αναγνώριση εντολής (π.χ. "1 352" ή "2 352")
  let rawInput = params.callsign || params.text || params.subject || params.Body || '';
  let sender = params.from || params.sender || 'Στέλεχος ΕΟΔΑ';
  let channel = params.channel || '📱 Κινητό / Επαφή';
  let action = 'ON';

  rawInput = rawInput.trim();

  if (rawInput.startsWith('1')) {
    action = 'ON';
    rawInput = rawInput.substring(1).trim();
  } else if (rawInput.startsWith('2')) {
    action = 'OFF';
    rawInput = rawInput.substring(1).trim();
  }

  // Μορφοποίηση Callsign
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
      body: JSON.stringify({ error: 'Μη έγκυρο κλητικό' })
    };
  }

  const now = new Date().toISOString();

  // Ενημέρωση στη Supabase
  if (supabaseUrl && supabaseKey) {
    try {
      if (action === 'ON') {
        await fetch(`${supabaseUrl}/rest/v1/attendance`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            callsign: callsign,
            name: sender,
            status: 'ON',
            check_in: now,
            channel: channel
          })
        });
      } else {
        await fetch(`${supabaseUrl}/rest/v1/attendance?callsign=eq.${callsign}&status=eq.ON`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'OFF',
            check_out: now
          })
        });
      }
    } catch (err) {
      console.error('Database Error:', err);
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      message: `Καταχωρήθηκε ${action === 'ON' ? 'Check-in' : 'Check-out'} για το ${callsign}`
    })
  };
};
