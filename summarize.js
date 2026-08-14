// Grupo Zen — Radar Inmobiliario
// Funcion serverless (Vercel) que recibe las noticias seleccionadas en el panel
// y le pide a Claude que redacte un resumen ejecutivo real, sintetizado.
//
// La clave ANTHROPIC_API_KEY se lee de las variables de entorno de Vercel.
// NUNCA se expone al navegador — solo este servidor la usa.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { articles } = req.body || {};
  if (!Array.isArray(articles) || articles.length === 0) {
    res.status(400).json({ error: 'No se recibieron noticias para resumir.' });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Falta configurar ANTHROPIC_API_KEY en Vercel.' });
    return;
  }

  const articlesText = articles
    .map((a, i) => `NOTICIA ${i + 1}\nTítulo: ${a.title}\nFuente: ${a.source} — ${a.date}\nTexto disponible:\n${a.text}`)
    .join('\n\n---\n\n');

  const prompt = `Eres un analista inmobiliario senior que redacta resúmenes ejecutivos para Grupo Zen, una desarrolladora inmobiliaria en Costa Rica. Te doy varias noticias reales sobre el mercado inmobiliario costarricense. Sintetiza SOLO la información contenida en ellas — nunca inventes cifras ni datos que no estén en el texto.

Responde ÚNICAMENTE con un objeto JSON válido (sin texto antes ni después, sin backticks de markdown) con esta forma exacta:

{
  "hallazgoPrincipal": "Un párrafo (3-5 oraciones) sintetizando el punto más importante que conecta estas noticias, en tono ejecutivo y directo.",
  "cifras": [
    {"etiqueta": "Nombre corto de la cifra", "valor": "El número o dato", "nota": "Breve contexto de una línea"}
  ],
  "tendencias": [
    "Una tendencia identificada, en una oración clara."
  ],
  "implicaciones": [
    "Una implicación concreta y accionable para una desarrolladora inmobiliaria como Grupo Zen."
  ]
}

Reglas:
- "cifras": incluye SOLO si las noticias traen números concretos (montos, porcentajes, cantidades). Si ninguna noticia trae cifras claras, devuelve un array vacío [].
- "tendencias": 2 a 4 elementos.
- "implicaciones": 2 a 4 elementos, pensados específicamente para una empresa desarrolladora de proyectos inmobiliarios.
- Sé conciso. Nada de relleno ni frases genéricas de introducción.

Noticias a analizar:

${articlesText}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      res.status(502).json({ error: data.error?.message || 'Error al llamar a la API de Claude.' });
      return;
    }

    const rawText = (data.content || []).map(b => b.text || '').join('\n').trim();

    let parsed;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch (parseErr) {
      res.status(502).json({ error: 'Claude respondió en un formato inesperado.', raw: rawText });
      return;
    }

    res.status(200).json({
      hallazgoPrincipal: parsed.hallazgoPrincipal || '',
      cifras: Array.isArray(parsed.cifras) ? parsed.cifras : [],
      tendencias: Array.isArray(parsed.tendencias) ? parsed.tendencias : [],
      implicaciones: Array.isArray(parsed.implicaciones) ? parsed.implicaciones : []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
