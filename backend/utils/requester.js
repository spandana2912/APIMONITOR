const axios = require('axios');

async function executeRequest({ url, method = 'GET', headers = {}, body = '', timeout = 15000 }) {
  const start = Date.now();
  let result = { status_code: null, response_time: null, response_body: null, response_headers: {}, error: null };
  try {
    const config = {
      url, method: method.toUpperCase(),
      headers: typeof headers === 'string' ? JSON.parse(headers || '{}') : headers,
      timeout, validateStatus: () => true,
    };
    if (['POST','PUT','PATCH'].includes(config.method) && body) {
      try { config.data = typeof body === 'string' ? JSON.parse(body) : body; }
      catch { config.data = body; }
      if (!config.headers['Content-Type']) config.headers['Content-Type'] = 'application/json';
    }
    const response = await axios(config);
    result.response_time = Date.now() - start;
    result.status_code = response.status;
    result.response_headers = response.headers || {};
    const ct = (response.headers['content-type'] || '').toLowerCase();
    result.response_body = ct.includes('application/json')
      ? JSON.stringify(response.data, null, 2)
      : String(response.data).slice(0, 50000);
  } catch(err) {
    result.response_time = Date.now() - start;
    if (err.code === 'ECONNABORTED') result.error = `Timeout after ${timeout}ms`;
    else if (err.code === 'ENOTFOUND') result.error = `DNS resolution failed`;
    else if (err.code === 'ECONNREFUSED') result.error = `Connection refused`;
    else result.error = err.message;
  }
  return result;
}

module.exports = { executeRequest };