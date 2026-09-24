/// <reference types="vite/client" />

export type Severity = "critical" | "high" | "medium" | "low";

export type IssueDraft = {
  title?: string;
  category?: string;
  otherCategory?: string;
  neighborhood?: string;
  address?: string;
  description?: string;
  severity?: Severity;
  anonymous?: boolean;
};

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatbotStructuredResponse = {
  mode: "help" | "report";
  reply: string;
  detectedIssue: boolean;
  issueData: IssueDraft;
  missingFields: string[];
  readyToSubmit: boolean;
};

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

function safeJsonParse(text: string): ChatbotStructuredResponse | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}$/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function sanitizeSeverity(value: unknown): Severity | undefined {
  if (value === "critical" || value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return undefined;
}

function normalizeIssueDraft(input?: IssueDraft): IssueDraft {
  return {
    title: input?.title?.trim() || undefined,
    category: input?.category?.trim() || undefined,
    otherCategory: input?.otherCategory?.trim() || undefined,
    neighborhood: input?.neighborhood?.trim() || undefined,
    address: input?.address?.trim() || undefined,
    description: input?.description?.trim() || undefined,
    severity: sanitizeSeverity(input?.severity),
    anonymous: typeof input?.anonymous === "boolean" ? input.anonymous : undefined,
  };
}

function localChatbotFallback(
  userMessage: string,
  currentDraft: IssueDraft,
  currentUserName?: string
): ChatbotStructuredResponse {
  const normalizedMsg = userMessage
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove accents

  const draft = { ...currentDraft };

  // 1. Detect Category
  if (!draft.category) {
    if (/\b(agua|vazamento|cano|falta d'agua|abastecimento|hidrometro)\b/.test(normalizedMsg)) {
      draft.category = "Abastecimento de Água";
    } else if (/\b(arvore|galho|folha|praca|meio ambiente|poda|plantar|verde|jardim)\b/.test(normalizedMsg)) {
      draft.category = "Arborização e Meio Ambiente";
    } else if (/\b(calcada|pedestre|acessibilidade|cadeirante|rampa|obstaculo|passarela|meio-fio)\b/.test(normalizedMsg)) {
      draft.category = "Calçadas e Acessibilidade";
    } else if (/\b(patrimonio|monumento|historico|museu|estatua|igreja|teatro|casarao|ruina)\b/.test(normalizedMsg)) {
      draft.category = "Conservação do Patrimônio";
    } else if (/\b(alagamento|enchente|bueiro|boca de lobo|inundacao|alagado|chuva|canal|enxurrada)\b/.test(normalizedMsg)) {
      draft.category = "Drenagem e Alagamentos";
    } else if (/\b(esgoto|saneamento|fossa|catinga|cheiro ruim|dejeto|esgoto a ceu aberto)\b/.test(normalizedMsg)) {
      draft.category = "Esgoto e Saneamento";
    } else if (/\b(iluminacao|poste|apagado|lampada|escura|escuro|breu|sem luz)\b/.test(normalizedMsg)) {
      draft.category = "Iluminação Pública";
    } else if (/\b(lixo|entulho|saco|lixeira|sujeira|descarte|coleta|entulho|despejo|sacos de lixo)\b/.test(normalizedMsg)) {
      draft.category = "Resíduos Sólidos";
    } else if (/\b(seguranca|assalto|roubo|policia|guardas|vandalismo|pichacao|pichado|droga|assaltos)\b/.test(normalizedMsg)) {
      draft.category = "Segurança Urbana / Espaço Público";
    } else if (/\b(sinalizacao|semaforo|sinal|placa|faixa de pedestre|faixa|radar)\b/.test(normalizedMsg)) {
      draft.category = "Sinalização de Trânsito";
    } else if (/\b(buraco|asfalto|cratera|pista|rua|pavimento|remendo|buracos|via|piso)\b/.test(normalizedMsg)) {
      draft.category = "Vias e Pavimentação";
    }
  }

  // 2. Detect Neighborhood in Belém
  const neighborhoods = [
    "Batista Campos", "Nazaré", "Umarizal", "Marco", "Pedreira", "Reduto", 
    "Cidade Velha", "Campina", "Jurunas", "Guamá", "Cremação", "Condor", 
    "Telégrafo", "Sacramenta", "Barreiro", "Marambaia", "Val-de-Cans", 
    "Souza", "Bengui", "Tapanã", "Coqueiro", "Una", "Tenoné", "Icoaraci", 
    "Outeiro", "Cotijuba", "Mosqueiro"
  ];

  if (!draft.neighborhood) {
    for (const nh of neighborhoods) {
      const normalizedNh = nh
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const regex = new RegExp(`\\b${normalizedNh}\\b`, "i");
      if (regex.test(normalizedMsg)) {
        draft.neighborhood = nh;
        break;
      }
    }
  }

  // 3. Detect Address
  if (!draft.address) {
    const streetRegex = /(?:na rua|na av|na avenida|na travessa|na tv|no endereco|na trav|no beco|passagem|travessa|avenida|rua)\s+([a-zA-Z0-9ºª\s\-]+?)(?:,|$| no bairro| em | perto| proximo| de | da | do )/i;
    const match = userMessage.match(streetRegex);
    if (match && match[1] && match[1].trim().length > 3) {
      draft.address = match[1].trim();
    } else {
      // Look for street words directly if no preposition
      const directRegex = /\b(rua|avenida|av\.|travessa|tv\.|passagem|beco)\s+([a-zA-Z0-9ºª\s\-]+?)(?:,|$| no bairro| em | perto| proximo| de | da | do )/i;
      const matchDirect = userMessage.match(directRegex);
      if (matchDirect && matchDirect[0]) {
        draft.address = matchDirect[0].trim();
      }
    }
  }

  // 4. Set Description and Title
  if (!draft.description) {
    draft.description = userMessage;
  }
  if (!draft.title && draft.category) {
    // Make a short, pretty title
    let type = "Problema";
    if (draft.category === "Vias e Pavimentação") type = "Buraco ou Pavimentação danificada";
    else if (draft.category === "Iluminação Pública") type = "Poste sem iluminação";
    else if (draft.category === "Resíduos Sólidos") type = "Acúmulo inadequado de lixo";
    else if (draft.category === "Drenagem e Alagamentos") type = "Alagamento na via";
    else if (draft.category === "Calçadas e Acessibilidade") type = "Calçada inacessível/danificada";
    
    draft.title = draft.neighborhood ? `${type} no bairro ${draft.neighborhood}` : `${type} detectado`;
  } else if (!draft.title) {
    draft.title = "Ocorrência relatada por Assistente";
  }

  // 5. Detect Severity
  if (!draft.severity) {
    if (/\b(urgente|perigo|perigoso|critico|acidente|risco|morrer|grave)\b/.test(normalizedMsg)) {
      draft.severity = "critical";
    } else if (/\b(ruim|preocupante|alta|complicado|feio)\b/.test(normalizedMsg)) {
      draft.severity = "high";
    } else if (/\b(medio|regular|normal|aceitavel)\b/.test(normalizedMsg)) {
      draft.severity = "medium";
    } else if (/\b(leve|baixa|pouco|tranquilo)\b/.test(normalizedMsg)) {
      draft.severity = "low";
    } else {
      draft.severity = "medium";
    }
  }

  // 6. Detect Anonymous
  if (draft.anonymous === undefined) {
    if (/\b(anonimo|sem nome|oculto|esconder|privado|secreto)\b/.test(normalizedMsg)) {
      draft.anonymous = true;
    }
  }

  // Determine mode, missing fields and readiness
  const isReport = !!(draft.category || draft.neighborhood || draft.address || draft.description);
  
  const missingFields: string[] = [];
  if (!draft.category) missingFields.push("category");
  if (!draft.neighborhood) missingFields.push("neighborhood");
  if (!draft.address) missingFields.push("address");
  if (!draft.description) missingFields.push("description");
  
  const readyToSubmit = !!(draft.category && draft.neighborhood && draft.address && draft.description);

  let reply = "";
  if (readyToSubmit) {
    reply = `Perfeito, ${currentUserName || "Usuário"}! Consegui reunir todas as informações cruciais (categoria, bairro, endereço e descrição). Por favor, revise o rascunho abaixo e clique em 'Relatar agora' para oficializar sua ocorrência!`;
  } else if (!draft.category) {
    reply = `Olá! Sou o Zé. Entendi que você deseja relatar um problema urbano em Belém. Poderia me dizer qual a categoria ou tipo do problema (ex: buraco na rua, vazamento de água, falta de luz)?`;
  } else if (!draft.neighborhood || !draft.address) {
    const catMsg = draft.category ? `sobre ${draft.category}` : "";
    reply = `Legal, anotei o problema ${catMsg}. Agora, para que possamos localizar e atuar, onde exatamente isso está acontecendo? Por favor, me informe a rua e o bairro correspondentes.`;
  } else {
    reply = `Entendi as informações! Só preciso de mais alguns detalhes sobre o problema para descrevê-lo da melhor forma possível. Pode me dar uma breve descrição?`;
  }

  return {
    mode: isReport ? "report" : "help",
    reply,
    detectedIssue: isReport,
    issueData: draft,
    missingFields,
    readyToSubmit
  };
}

export async function sendMessageToChatbot(params: {
  userMessage: string;
  history: ChatHistoryMessage[];
  currentDraft?: IssueDraft;
  currentUserName?: string;
}): Promise<ChatbotStructuredResponse> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  const normalizedDraft = normalizeIssueDraft(params.currentDraft);

  if (!apiKey) {
    console.warn("Groq API key not found in .env. Falling back to local NLP.");
    return localChatbotFallback(params.userMessage, normalizedDraft, params.currentUserName);
  }

  const systemPrompt = `
Você é o Zé, assistente virtual amigável do Zela — sistema colaborativo de problemas urbanos de Belém do Pará.

Seu papel principal:
1. Detectar quando o usuário quer REPORTAR um problema urbano.
2. Conduzir uma CONVERSA GUIADA, perguntando UMA COISA POR VEZ, como um atendente humano prestativo.
3. Responder dúvidas gerais sobre o sistema de forma clara e curta.

FLUXO DE COLETA (siga esta ordem, mas de forma natural):
Passo 1 — Confirmar interesse: Ao detectar um problema, pergunte: "Quer que eu te ajude a registrar essa ocorrência?"
Passo 2 — Descrição do problema: Se ainda não tiver, peça uma descrição do problema.
Passo 3 — Localização: Pergunte o endereço ou bairro onde acontece o problema. Informe que a pessoa também pode usar o botão de localização automática.
Passo 4 — Urgência: Pergunte o nível de urgência (baixa, média, alta ou crítica) de forma simples.
Passo 5 — Anonimato: Pergunte se a pessoa quer que o nome dela apareça ou prefere registrar de forma anônima.
Passo 6 — Confirmação: Quando tiver todos os dados, diga que vai montar o resumo e pergunte se a pessoa deseja publicar.

REGRAS IMPORTANTES:
- Faça APENAS UMA PERGUNTA por vez. Nunca liste várias perguntas juntas.
- Seja breve, acolhedor e direto. Máximo 2-3 frases por mensagem.
- Tente inferir categoria, título e severidade automaticamente a partir do que o usuário disse. Não pergunte o que já está claro.
- No campo "description" de "issueData", SEMPRE analise o relato do usuário, corrija erros ortográficos e de digitação de forma sutil, e faça um resumo claro, conciso e objetivo. O usuário não deve notar que o texto foi corrigido (não mencione a correção na sua resposta).
- Se o usuário já deu o endereço junto com a descrição do problema, não pergunte de novo.
- Quando readyToSubmit for true, a interface vai mostrar um card de confirmação automaticamente. Avise o usuário que o resumo vai aparecer para ele confirmar.
- Se o usuário não quiser reportar, ajude normalmente.
- Responda sempre em português do Brasil.

Categorias válidas:
- Abastecimento de Água
- Arborização e Meio Ambiente
- Calçadas e Acessibilidade
- Conservação do Patrimônio
- Drenagem e Alagamentos
- Esgoto e Saneamento
- Iluminação Pública
- Resíduos Sólidos
- Segurança Urbana / Espaço Público
- Sinalização de Trânsito
- Vias e Pavimentação
- Outros

Níveis de severity: critical, high, medium, low

IMPORTANTE:
Você DEVE responder APENAS em JSON válido.
Sem markdown. Sem crases. Sem texto fora do JSON.

Formato obrigatório:
{
  "mode": "help" | "report",
  "reply": "texto da mensagem para o usuário (curto, 1-3 frases)",
  "detectedIssue": true | false,
  "issueData": {
    "title": string | undefined,
    "category": string | undefined,
    "otherCategory": string | undefined,
    "neighborhood": string | undefined,
    "address": string | undefined,
    "description": string | undefined,
    "severity": "critical" | "high" | "medium" | "low" | undefined,
    "anonymous": boolean | undefined
  },
  "missingFields": string[],
  "readyToSubmit": boolean
}
`.trim();

  const messages = [
    {
      role: "system" as const,
      content: systemPrompt,
    },
    {
      role: "system" as const,
      content: `Nome do usuário: ${params.currentUserName || "Usuário"}`,
    },
    {
      role: "system" as const,
      content: `Rascunho atual da ocorrência: ${JSON.stringify(normalizedDraft)}`,
    },
    ...params.history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: "user" as const,
      content: params.userMessage,
    },
  ];

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages,
      }),
    });

    if (!response.ok) {
      console.warn("Groq API error. Falling back to local NLP.");
      return localChatbotFallback(params.userMessage, normalizedDraft, params.currentUserName);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      console.warn("Empty Groq content. Falling back to local NLP.");
      return localChatbotFallback(params.userMessage, normalizedDraft, params.currentUserName);
    }

    const parsed = safeJsonParse(content);

    if (!parsed) {
      console.warn("Failed to parse Groq response JSON. Falling back to local NLP.");
      return localChatbotFallback(params.userMessage, normalizedDraft, params.currentUserName);
    }

    return {
      mode: parsed.mode === "report" ? "report" : "help",
      reply:
        typeof parsed.reply === "string" && parsed.reply.trim()
          ? parsed.reply.trim()
          : "Desculpe, não consegui entender totalmente. Pode me explicar de outra forma?",
      detectedIssue: Boolean(parsed.detectedIssue),
      issueData: normalizeIssueDraft(parsed.issueData),
      missingFields: Array.isArray(parsed.missingFields)
        ? parsed.missingFields.filter((item): item is string => typeof item === "string")
        : [],
      readyToSubmit: Boolean(parsed.readyToSubmit),
    };
  } catch (err) {
    console.warn("Network error or fetch failed. Falling back to local NLP:", err);
    return localChatbotFallback(params.userMessage, normalizedDraft, params.currentUserName);
  }
}

export async function polishDescription(text: string): Promise<string> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey || !text.trim()) {
    return text.trim();
  }

  const systemPrompt = `Você é um assistente de redação e polimento para o Zela.
Sua tarefa é analisar o relato de um cidadão sobre um problema urbano em Belém do Pará, corrigir de forma sutil quaisquer erros ortográficos, gramaticais e de digitação, e resumi-lo levemente se for excessivamente longo ou confuso.
O objetivo é tornar o texto claro, conciso e bem escrito, mantendo o tom natural e em primeira ou terceira pessoa conforme relatado (mas sem gírias excessivas ou insultos), ideal para ser lido por órgãos públicos ou outros cidadãos.
Não adicione informações extras que não estavam no relato. Não mude o sentido do relato.
IMPORTANTE: Retorne APENAS o texto corrigido e polido. Não inclua introduções, explicações, aspas ou saudações.`.trim();

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
    });

    if (!response.ok) {
      return text.trim();
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      return content.trim();
    }
    return text.trim();
  } catch (err) {
    console.warn("Error in polishDescription:", err);
    return text.trim();
  }
}