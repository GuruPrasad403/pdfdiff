import Groq from 'groq-sdk';
const groq = new Groq({ apiKey: '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' });

const getModels = async () => {
  const models = await groq.models.list();
  const visionModels = models.data.filter(m => m.id.includes('vision') || m.id.includes('llama-3.2')).map(m => m.id);
  console.log("VISION MODELS:", visionModels);
};
getModels().catch(console.error);
