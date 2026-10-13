const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  // CORS Headers για αποδοχή αιτημάτων
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
      body: JSON.stringify({ error: 'Missing Supabase environment variables' })
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    let rawData = {};
    if (event.body) {
      try {
        rawData = JSON.parse(event.body);
      } catch (e) {
        // Υποστήριξη Form-encoded δεδομένων (από IVR/SMS/Webhooks)
        const querystring = require('querystring');
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

    // Ανάγνωση & Μορφοποίηση Εισόδου
    let callsign = rawData.callsign || rawData.Digits || rawData.Body || '';
    let action = rawData.action || 'ON';
    let name = rawData.name || 'Στέλεχος ΕΟΔΑ';
    let channel = rawData.channel || '🌐 Web App';

    // Αν η εισαγωγή προέρχεται από IVR/SMS (π.χ. "1 352" ή "2 352")
    if (callsign.startsWith('1')) {
      action = 'ON';
      callsign = callsign.substring(1).trim();
    } else if (callsign.startsWith('2')) {
      action = 'OFF';
      callsign = callsign.substring(1).trim();
    }

    // Κανόνας Callsign (0352/0306/0307 -> 352/306/307, όλα τα άλλα -> ΑΤ-)
    let numOnly = callsign.replace(/[^0-9]/g, '');
    if (['0352', '352', '0306', '306', '0307', '307'].includes(numOnly)) {
      callsign = numOnly.replace(/^0+/, '');
    } else if (numOnly) {
      callsign = 'ΑΤ-' + numOnly;
    }

    const now = new Date().toISOString();

    if (action === 'ON') {
      // Check-in
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

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: `Check-in successful for ${callsign}`, callsign, status: 'ON' })
      };
    } else {
      // Check-out
      const { data, error } = await supabase
        .from('attendance')
        .update({
          status: 'OFF',
          check_out: now
        })
        .eq('callsign', callsign)
        .eq('status', 'ON');

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: `Check-out successful for ${callsign}`, callsign, status: 'OFF' })
      };
    }

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
