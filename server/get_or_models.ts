import 'dotenv/config';

const getModels = async () => {
  const res = await fetch('https://openrouter.ai/api/v1/models');
  const data = await res.json();
  
  const freeModels = data.data.filter(m => m.id.endsWith(':free'));
  
  console.log("FREE MODELS:");
  freeModels.forEach(m => {
    // Check if it supports vision/multimodal by checking architecture or features if available
    // But OpenRouter model list doesn't strictly say "vision", we just print all free models and look for vision ones
    console.log(m.id);
  });
};

getModels().catch(console.error);
