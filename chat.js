// ─── NETLIFY FUNCTION : Relais sécurisé vers l'API Gemini (Google) ─────────
// Emplacement : netlify/functions/chat.js
// Variable d'environnement à configurer sur Netlify :
//   GEMINI_API_KEY = AIza...
// ───────────────────────────────────────────────────────────────────────────

exports.handler = async function (event) {

  // ── CORS & méthode ────────────────────────────────────────────────────────
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  // ── Lecture du corps ───────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Corps invalide' }) };
  }

  const { messages, systemPrompt } = body;

  // ── Validation ─────────────────────────────────────────────────────────────
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Messages manquants' }) };
  }

  // Limite : 15 échanges = 30 messages (user + model alternés)
  if (messages.length > 30) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        error: 'LIMITE_ATTEINTE',
        message: "J'ai répondu à beaucoup de vos questions 😊 Pour aller plus loin, vous pouvez réserver directement dans l'app ou nous appeler au 07 53 41 61 15 — on sera ravis de vous aider !"
      })
    };
  }

  // ── Clé API ────────────────────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Clé API non configurée' })
    };
  }

  // ── Formatage des messages pour Gemini ─────────────────────────────────────
  // Gemini attend : { role: "user" | "model", parts: [{ text: "..." }] }
  // Notre app envoie : { role: "user" | "assistant", content: "..." }
  const geminiMessages = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  // ── Appel API Gemini ────────────────────────────────────────────────────────
  const GEMINI_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt || '' }]
        },
        contents: geminiMessages,
        generationConfig: {
          maxOutputTokens: 600,
          temperature: 0.7,
        }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini error:', response.status, errText);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: 'Erreur API',
          message: "L'assistant est momentanément indisponible. Appelez-nous au 07 53 41 61 15."
        })
      };
    }

    const data = await response.json();

    // Extraire le texte de la réponse Gemini
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Réponse vide',
          message: "Je n'ai pas pu générer une réponse. Réessayez ou appelez-nous au 07 53 41 61 15."
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply: text }),
    };

  } catch (err) {
    console.error('Fetch error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Erreur serveur',
        message: "L'assistant est momentanément indisponible. Appelez-nous au 07 53 41 61 15."
      })
    };
  }
};
