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
  coordinates?: { lat: number; lng: number };
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

export function normalizeIssueDraft(input?: IssueDraft): IssueDraft {
  return {
    title: input?.title?.trim() || undefined,
    category: input?.category?.trim() || undefined,
    otherCategory: input?.otherCategory?.trim() || undefined,
    neighborhood: input?.neighborhood?.trim() || undefined,
    address: input?.address?.trim() || undefined,
    description: input?.description?.trim() || undefined,
    severity: sanitizeSeverity(input?.severity),
    anonymous: typeof input?.anonymous === "boolean" ? input.anonymous : undefined,
    coordinates: input?.coordinates,
  };
}

export function mergeDrafts(prev: IssueDraft, incoming?: IssueDraft): IssueDraft {
  if (!incoming) return prev;
  return {
    ...prev,
    title: incoming.title || prev.title,
    category: incoming.category || prev.category,
    otherCategory: incoming.otherCategory || prev.otherCategory,
    neighborhood: incoming.neighborhood || prev.neighborhood,
    address: incoming.address || prev.address,
    description: incoming.description || prev.description,
    severity: incoming.severity || prev.severity,
    anonymous: incoming.anonymous !== undefined ? incoming.anonymous : prev.anonymous,
    coordinates: incoming.coordinates || prev.coordinates,
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
    .replace(/[\u0300-\u036f]/g, "");

  const draft: IssueDraft = { ...currentDraft };

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
    const streetRegex = /(?:na rua|na av|na avenida|na travessa|na tv|no endereco|na trav|no beco|passagem|travessa|avenida|rua)\s+([a-zA-Z0-9ºª\s-]+?)(?:,|$| no bairro| em | perto| proximo| de | da | do )/i;
    const match = userMessage.match(streetRegex);
    if (match && match[1] && match[1].trim().length > 3) {
      draft.address = match[1].trim();
    } else {
      const directRegex = /\b(rua|avenida|av\.|travessa|tv\.|passagem|beco)\s+([a-zA-Z0-9ºª\s-]+?)(?:,|$| no bairro| em | perto| proximo| de | da | do )/i;
      const matchDirect = userMessage.match(directRegex);
      if (matchDirect && matchDirect[0]) {
        draft.address = matchDirect[0].trim();
      }
    }
  }

  // 4. Set Description and Title
  if (!draft.description && (draft.category || normalizedMsg.length > 15)) {
    draft.description = userMessage;
  } else if (draft.description && normalizedMsg.length > 10 && !draft.address && !draft.neighborhood) {
    draft.description = `${draft.description} - ${userMessage}`;
  }

  if (!draft.title && draft.category) {
    draft.title = draft.neighborhood
      ? `${draft.category} em ${draft.neighborhood}`
      : `${draft.category} relatado`;
  }

  // 5. Detect Severity
  if (!draft.severity) {
    if (/\b(urgente|perigo|perigoso|critico|acidente|risco|grave)\b/.test(normalizedMsg)) {
      draft.severity = "critical";
    } else if (/\b(ruim|preocupante|alta|complicado)\b/.test(normalizedMsg)) {
      draft.severity = "high";
    } else if (/\b(medio|regular|normal)\b/.test(normalizedMsg)) {
      draft.severity = "medium";
    } else if (/\b(leve|baixa|pouco|tranquilo)\b/.test(normalizedMsg)) {
      draft.severity = "low";
    } else {
      draft.severity = "medium";
    }
  }

  // 6. Detect Anonymous
  if (draft.anonymous === undefined) {
    if (/\b(anonimo|sem nome|oculto|privado)\b/.test(normalizedMsg)) {
      draft.anonymous = true;
    }
  }

  const hasAnyIssueData = Boolean(draft.category || draft.neighborhood || draft.address || draft.description);

  // Missing fields check
  const missingFields: string[] = [];
  if (!draft.description || draft.description.length < 5) missingFields.push("a descrição do problema");
  if (!draft.category) missingFields.push("a categoria do problema");
  if (!draft.neighborhood && !draft.address) missingFields.push("o endereço ou bairro");

  const wantsToPublish = /\b(publicar|publica|postar|posta|registrar|registra|sim|quero|pode|concluir|finalizar|envia|enviar|ok|bora)\b/i.test(normalizedMsg);

  let reply = "";
  let readyToSubmit = false;

  if (wantsToPublish && hasAnyIssueData) {
    if (missingFields.length > 0) {
      reply = `Para podermos publicar sua ocorrência, ainda falta informar ${missingFields.join(" e ")}. Pode me dizer onde e como ocorreu?`;
      readyToSubmit = false;
    } else {
      reply = `Perfeito, ${currentUserName || "cidadão"}! Reuni todas as informações necessárias. O resumo da ocorrência está pronto para publicação logo abaixo.`;
      readyToSubmit = true;
    }
  } else if (hasAnyIssueData) {
    if (missingFields.length === 0) {
      reply = `Entendi a situação e já anotei todos os detalhes. Você gostaria de publicar essa ocorrência no Zela agora?`;
    } else if (!draft.address && !draft.neighborhood) {
      reply = `Entendi o problema relatado. Onde exatamente isso está acontecendo em Belém? Você gostaria de registrar e publicar essa ocorrência?`;
    } else {
      reply = `Informação anotada. Gostaria de publicar essa ocorrência no sistema ou quer adicionar mais algum detalhe?`;
    }
  } else {
    reply = `Olá! Sou o Zé, assistente do Zela. Posso te ajudar a registrar ocorrências de problemas urbanos em Belém ou tirar dúvidas sobre a plataforma. O que você gostaria de ver?`;
  }

  return {
    mode: hasAnyIssueData ? "report" : "help",
    reply,
    detectedIssue: hasAnyIssueData,
    issueData: draft,
    missingFields,
    readyToSubmit,
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
    return localChatbotFallback(params.userMessage, normalizedDraft, params.currentUserName);
  }

  const systemPrompt = `Você é o Zé, assistente inteligente do Zela — sistema colaborativo de zeladoria urbana de Belém do Pará.
Você conversa de forma acolhedora, prestativa e natural com os cidadãos de Belém.

COMPORTAMENTO PRINCIPAL:
1. Converse com naturalidade. O usuário pode fazer perguntas sobre a cidade, sobre o Zela ou simplesmente relatar o que aconteceu no dia a dia.
2. A partir do momento em que perceber que o usuário está relatando um problema urbano (buraco, vazamento, lixo acumulado, poste apagado, calçada quebrada, bueiro entupido, etc.):
   - Guarde e acumule todas as informações extraídas no objeto "issueData", preservando os dados já coletados nas mensagens anteriores e acrescentando novos detalhes trazidos na mensagem atual.
   - Campos de issueData: category, description, address, neighborhood, severity (critical, high, medium, low), anonymous.
   - No decorrer da conversa, pergunte de forma gentil se o usuário gostaria de publicar essa ocorrência no sistema.
3. Se o usuário quiser publicar (ex: "sim", "quero publicar", "pode postar", "publica", "registra", "vamos publicar"):
   - Verifique os campos essenciais:
     * description (descrição clara)
     * category (categoria do problema)
     * address OU neighborhood (onde aconteceu em Belém)
   - SE FALTAR alguma informação essencial: avise de forma direta o que ainda está faltando para que possa ser publicado (ex: "Para publicarmos, ainda falta me dizer o endereço ou bairro onde isso aconteceu. Onde fica?").
   - SE TUDO ESTIVER COMPLETO: marque "readyToSubmit": true e avise ao usuário que o resumo foi montado para ele confirmar e publicar.
4. Se o usuário estiver apenas conversando ou tirando dúvidas e não relatando problemas, responda normalmente com detectedIssue = false.

REGRAS DE ESTILO E SEGURANÇA:
- NUNCA USE EMOJIS nas suas respostas. Zero emojis.
- Seja objetivo e breve (máximo de 1 a 3 frases por resposta).
- Responda estritamente em português do Brasil.
- A saída deve ser EXCLUSIVAMENTE um JSON válido com o schema especificado, sem formatação markdown em volta.

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

Formato de saída:
{
  "mode": "help" | "report",
  "reply": "texto da resposta ao usuário (sem emojis, 1 a 3 frases)",
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
}`.trim();

  const messages = [
    {
      role: "system" as const,
      content: systemPrompt,
    },
    {
      role: "system" as const,
      content: `Nome do usuário atual: ${params.currentUserName || "Usuário"}`,
    },
    {
      role: "system" as const,
      content: `Rascunho acumulado até o momento: ${JSON.stringify(normalizedDraft)}`,
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
      return localChatbotFallback(params.userMessage, normalizedDraft, params.currentUserName);
    }

    const parsed = safeJsonParse(content);
    if (!parsed) {
      return localChatbotFallback(params.userMessage, normalizedDraft, params.currentUserName);
    }

    const merged = mergeDrafts(normalizedDraft, parsed.issueData);

    return {
      mode: parsed.mode === "report" ? "report" : "help",
      reply:
        typeof parsed.reply === "string" && parsed.reply.trim()
          ? parsed.reply.trim().replace(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}]/gu, "")
          : "Entendi o relato. Gostaria de publicar essa ocorrência no Zela?",
      detectedIssue: Boolean(parsed.detectedIssue),
      issueData: merged,
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
O objetivo é tornar o texto claro, conciso e bem escrito, mantendo o tom natural e em primeira ou terceira pessoa conforme relatado (sem gírias excessivas ou insultos e SEM EMOJIS), ideal para ser lido por órgãos públicos ou outros cidadãos.
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

    if (!response.ok) return text.trim();
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content.trim() : text.trim();
  } catch {
    return text.trim();
  }
}
