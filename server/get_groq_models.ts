import dotenv from 'dotenv';
import Groq from 'groq-sdk';

dotenv.config({ path: './.env' });

const getModels = async () => {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const models = await groq.models.list();
  
  const visionModels = models.data.filter(m => m.id.includes('vision') || m.id.includes('llama-3.2')).map(m => m.id);
  console.log("VISION MODELS:", visionModels);
};

getModels().catch(console.error);
