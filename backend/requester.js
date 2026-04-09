const axios = require('axios');

/**
 * Execute an API request and return timing + response metadata
 */
async function executeRequest({ url, method = 'GET', headers = {}, body = '', timeout = 15000 }) {
  const start = Date.now();
  let result = {
    status_code: null,
    response_time: null,
    response_body: null,
    response_headers: {},
    error: null,
  };

  try {
    const config = {
      url,
      method: method.toUpperCase(),
      headers: typeof headers === 'string' ? JSON.parse(headers || '{}') : headers,
      timeout,
      validateStatus: () => true,  // don't throw on 4xx/5xx
    };

    if (['POST', 'PUT', 'PATCH'].includes(config.method) && body) {
      try {
        config.data = typeof body === 'string' ? JSON.parse(body) : body;
        if (!config.headers['Content-Type'] && !config.headers['content-type']) {
          config.headers['Content-Type'] = 'application/json';
        }
      } catch {
        config.data = body;
      }
    }

    const response = await axios(config);
    result.response_time = Date.now() - start;
    result.status_code = response.status;
    result.response_headers = response.headers || {};

    const ct = (response.headers['content-type'] || '').toLowerCase();
    if (ct.includes('application/json')) {
      result.response_body = JSON.stringify(response.data, null, 2);
    } else {
      result.response_body = String(response.data).slice(0, 50000); // cap at 50KB
    }
  } catch (err) {
    result.response_time = Date.now() - start;
    if (err.code === 'ECONNABORTED') {
      result.error = `Timeout after ${timeout}ms`;
    } else if (err.code === 'ENOTFOUND') {
      result.error = `DNS resolution failed: ${err.hostname}`;
    } else if (err.code === 'ECONNREFUSED') {
      result.error = `Connection refused`;
    } else {
      result.error = err.message;
    }
  }

  return result;
}

module.exports = { executeRequest };
