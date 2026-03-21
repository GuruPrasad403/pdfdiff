const https = require('https');
require('dotenv').config({ path: 'c:/Users/gurup/Downloads/pdfdiff---ai-feedback-verifier (1)/server/.env' });

const options = {
  hostname: 'api.groq.com',
  port: 443,
  path: '/openai/v1/models',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const data = JSON.parse(body);
    if (data.data) {
        const visionModels = data.data.map(m => m.id).filter(id => id.includes('vision') || id.includes('llama-3.2'));
        console.log("Available relevant models:", visionModels);
    } else {
        console.error("Error:", data);
    }
  });
});

req.on('error', (e) => console.error(e));
req.end();
