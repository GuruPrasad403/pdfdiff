import Groq from 'groq-sdk';
const groq = new Groq({ apiKey: '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' });

const getModels = async () => {
  const models = await groq.models.list();
  console.log("ALL MODELS:", models.data.map(m => m.id));
};
getModels().catch(console.error);
