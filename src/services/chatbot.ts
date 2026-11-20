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

// Bairros reconhecidos de Belém
const BELEM_NEIGHBORHOODS = [
  "Batista Campos", "Nazaré", "Umarizal", "Marco", "Pedreira", "Reduto",
  "Cidade Velha", "Campina", "Jurunas", "Guamá", "Cremação", "Condor",
  "Telégrafo", "Sacramenta", "Barreiro", "Marambaia", "Val-de-Cans",
  "Souza", "Bengui", "Tapanã", "Coqueiro", "Una", "Tenoné", "Icoaraci",
  "Outeiro", "Cotijuba", "Mosqueiro", "São Brás", "Canudos", "Castanheira"
];

function detectCategoryFromText(text: string): string | undefined {
  if (/\b(agua|vazamento|cano|falta d'agua|abastecimento|hidrometro|cosanpa)\b/.test(text)) {
    return "Abastecimento de Água";
  }
  if (/\b(arvore|galho|folha|praca|meio ambiente|poda|plantar|verde|jardim|arvores)\b/.test(text)) {
    return "Arborização e Meio Ambiente";
  }
  if (/\b(calcada|pedestre|acessibilidade|cadeirante|rampa|obstaculo|passarela|meio-fio|calcadas)\b/.test(text)) {
    return "Calçadas e Acessibilidade";
  }
  if (/\b(patrimonio|monumento|historico|museu|estatua|igreja|teatro|casarao|ruina)\b/.test(text)) {
    return "Conservação do Patrimônio";
  }
  if (/\b(alagamento|enchente|bueiro|boca de lobo|inundacao|alagado|chuva|canal|enxurrada|canais)\b/.test(text)) {
    return "Drenagem e Alagamentos";
  }
  if (/\b(esgoto|saneamento|fossa|catinga|cheiro ruim|dejeto|esgoto a ceu aberto)\b/.test(text)) {
    return "Esgoto e Saneamento";
  }
  if (/\b(iluminacao|poste|apagado|lampada|escura|escuro|breu|sem luz|postes)\b/.test(text)) {
    return "Iluminação Pública";
  }
  if (/\b(lixo|entulho|saco|lixeira|sujeira|descarte|coleta|despejo|sacos de lixo|carroca)\b/.test(text)) {
    return "Resíduos Sólidos";
  }
  if (/\b(seguranca|assalto|roubo|policia|guardas|vandalismo|pichacao|pichado|droga|assaltos)\b/.test(text)) {
    return "Segurança Urbana / Espaço Público";
  }
  if (/\b(sinalizacao|semaforo|sinal|placa|faixa de pedestre|faixa|radar|transito|semob)\b/.test(text)) {
    return "Sinalização de Trânsito";
  }
  if (/\b(buraco|asfalto|cratera|pista|rua|pavimento|remendo|buracos|via|piso|recapeamento)\b/.test(text)) {
    return "Vias e Pavimentação";
  }
  return undefined;
}

function detectNeighborhood(normalizedText: string): string | undefined {
  for (const nh of BELEM_NEIGHBORHOODS) {
    const normNh = nh.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const regex = new RegExp(`\\b${normNh}\\b`, "i");
    if (regex.test(normalizedText)) {
      return nh;
    }
  }
  return undefined;
}

function detectAddress(rawText: string): string | undefined {
  const streetRegex = /(?:na rua|na av|na avenida|na travessa|na tv|no endereco|na trav|no beco|passagem|travessa|avenida|rua)\s+([a-zA-Z0-9ºª\s-]+?)(?:,|$| no bairro| em | perto| proximo| de | da | do )/i;
  const match = rawText.match(streetRegex);
  if (match && match[1] && match[1].trim().length > 3) {
    return match[1].trim();
  }
  const directRegex = /\b(rua|avenida|av\.|travessa|tv\.|passagem|beco)\s+([a-zA-Z0-9ºª\s-]+?)(?:,|$| no bairro| em | perto| proximo| de | da | do )/i;
  const matchDirect = rawText.match(directRegex);
  if (matchDirect && matchDirect[0]) {
    return matchDirect[0].trim();
  }
  return undefined;
}

export function localChatbotFallback(
  userMessage: string,
  currentDraft: IssueDraft,
  currentUserName?: string
): ChatbotStructuredResponse {
  const norm = userMessage
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const draft: IssueDraft = { ...currentDraft };

  // Detect and accumulate information
  const foundCat = detectCategoryFromText(norm);
  if (foundCat) draft.category = foundCat;

  const foundNh = detectNeighborhood(norm);
  if (foundNh) draft.neighborhood = foundNh;

  const foundAddr = detectAddress(userMessage);
  if (foundAddr) draft.address = foundAddr;

  // Severity detection
  if (!draft.severity) {
    if (/\b(urgente|perigo|perigoso|critico|acidente|risco|grave)\b/.test(norm)) {
      draft.severity = "critical";
    } else if (/\b(ruim|preocupante|alta|complicado)\b/.test(norm)) {
      draft.severity = "high";
    } else if (/\b(medio|regular|normal)\b/.test(norm)) {
      draft.severity = "medium";
    } else if (/\b(leve|baixa|pouco|tranquilo)\b/.test(norm)) {
      draft.severity = "low";
    }
  }

  // Anonymous detection
  if (draft.anonymous === undefined) {
    if (/\b(anonimo|sem nome|oculto|privado)\b/.test(norm)) {
      draft.anonymous = true;
    }
  }

  // Description accumulation
  const isProblemDescription = Boolean(
    foundCat ||
    /\b(buraco|vazamento|poste|lixo|esgoto|calcada|alagamento|semaforo|cratera|mato|entulho|quebrado|afundou|caiu)\b/.test(norm)
  );

  if (isProblemDescription) {
    if (!draft.description) {
      draft.description = userMessage;
    } else if (!draft.description.includes(userMessage) && userMessage.length > 8) {
      draft.description = `${draft.description}. ${userMessage}`;
    }
  }

  if (!draft.title && draft.category) {
    draft.title = draft.neighborhood
      ? `${draft.category} em ${draft.neighborhood}`
      : `${draft.category} relatado`;
  }

  const hasReportData = Boolean(draft.category || draft.description || draft.address || draft.neighborhood);

  // Missing fields for publication
  const missingFields: string[] = [];
  if (!draft.description || draft.description.length < 5) missingFields.push("a descrição do problema");
  if (!draft.category) missingFields.push("a categoria do problema");
  if (!draft.address && !draft.neighborhood) missingFields.push("a localização (rua ou bairro)");

  const wantsToPublish = /\b(publicar|publica|postar|posta|registrar|registra|sim|quero publicar|pode publicar|confirmo|concluir|finalizar|envia|enviar|ok|bora)\b/i.test(norm);

  let reply = "";
  let readyToSubmit = false;

  // 1. User wants to publish
  if (wantsToPublish && hasReportData) {
    if (missingFields.length > 0) {
      reply = `Para podermos publicar sua ocorrência, ainda falta informar ${missingFields.join(" e ")}. Pode me dizer onde ou como aconteceu?`;
      readyToSubmit = false;
    } else {
      reply = `Perfeito, ${currentUserName || "cidadão"}! Reuni todas as informações necessárias. O resumo da ocorrência foi montado logo abaixo para você revisar e confirmar a publicação.`;
      readyToSubmit = true;
    }
  }
  // 2. User just described an issue (or gave location for it)
  else if (isProblemDescription || (hasReportData && (foundAddr || foundNh))) {
    if (missingFields.length === 0) {
      reply = `Entendi a situação! Anotei ${draft.category} em ${[draft.address, draft.neighborhood].filter(Boolean).join(", ")}. Você gostaria de publicar essa ocorrência no Zela agora?`;
    } else if (!draft.address && !draft.neighborhood) {
      reply = `Entendi o problema de ${draft.category || "zeladoria"}. Onde exatamente isso está acontecendo em Belém? Me informe a rua ou bairro para podermos registrar.`;
    } else {
      reply = `Anotei os detalhes. Gostaria de publicar essa ocorrência no sistema ou quer adicionar mais alguma informação?`;
    }
  }
  // 3. User greetings (oi, olá, boa tarde, etc.)
  else if (/^(oi|ola|opa|e ai|ei|fala ze|bom dia|boa tarde|boa noite|hello|hi)[!.]?$/.test(norm) || /\b(oi ze|ola ze)\b/.test(norm)) {
    const greeting = norm.includes("noite") ? "Boa noite" : norm.includes("tarde") ? "Boa tarde" : "Olá";
    reply = `${greeting}! Tudo bem com você? Em que posso te ajudar hoje em Belém? Se viu algum problema na sua rua ou bairro, pode me contar que eu anoto.`;
  }
  // 4. "Tudo bem?", "como vai?"
  else if (/\b(tudo bem|como vai|como voce esta|beleza|tranquilo)\b/.test(norm)) {
    reply = `Tudo ótimo por aqui! E com você? Encontrou alguma situação na cidade que precise de atenção, como buracos, lixo ou falta de iluminação?`;
  }
  // 5. Questions about identity or what Zela is
  else if (/\b(quem e voce|o que voce faz|quem e o ze|qual seu papel|qual a sua funcao)\b/.test(norm)) {
    reply = `Eu sou o Zé, assistente virtual do Zela Belém. Meu papel é conversar com os moradores, coletar relatos de problemas urbanos da nossa cidade e organizar tudo para encaminhar e publicar no sistema.`;
  }
  // 6. How it works
  else if (/\b(como funciona|como usar|o que e o zela|como posso ajudar|para que serve)\b/.test(norm)) {
    reply = `O Zela é uma plataforma colaborativa para Belém. Você pode me contar sobre qualquer problema que presenciou (como vias esburacadas, alagamentos, postes apagados ou lixo) e eu crio o registro para que outros cidadãos e órgãos públicos possam acompanhar e resolver.`;
  }
  // 7. What can be reported
  else if (/\b(quais problemas|o que posso relatar|quais categorias|tipos de problema)\b/.test(norm)) {
    reply = `Você pode relatar buracos no asfalto, iluminação pública apagada, lixo ou entulho acumulado, vazamentos de água, esgoto a céu aberto, calçadas danificadas, semáforos quebrados e alagamentos. Se souber de algum, é só me dizer!`;
  }
  // 8. Gratitude & Closing
  else if (/\b(obrigado|obrigada|valeu|agradeco|perfeito|show|otimo)\b/.test(norm)) {
    reply = `Por nada! Se precisar de algo ou presenciar qualquer problema pelas ruas de Belém, é só me chamar por aqui.`;
  } else if (/\b(tchau|ate mais|ate logo|falou|adeus)\b/.test(norm)) {
    reply = `Até mais! Um abraço e vamos juntos cuidar de Belém.`;
  }
  // 9. Ongoing issue context
  else if (hasReportData) {
    if (missingFields.length > 0) {
      reply = `Anotei essa informação no seu rascunho. Para podermos publicar, ainda falta ${missingFields.join(" e ")}. Pode me informar?`;
    } else {
      reply = `Informação adicionada ao rascunho! Tudo o que precisamos está pronto. Deseja publicar a ocorrência agora?`;
    }
  }
  // 10. Generic fallback that varies naturally
  else {
    reply = `Entendi. Você pode tirar dúvidas sobre o Zela comigo ou me contar sobre qualquer ocorrência urbana em Belém que queira registrar. O que você gostaria de fazer?`;
  }

  return {
    mode: hasReportData ? "report" : "help",
    reply,
    detectedIssue: hasReportData,
    issueData: draft,
    missingFields,
    readyToSubmit,
  };
}

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

export async function sendMessageToChatbot(params: {
  userMessage: string;
  history: ChatHistoryMessage[];
  currentDraft?: IssueDraft;
  currentUserName?: string;
}): Promise<ChatbotStructuredResponse> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  const normalizedDraft = normalizeIssueDraft(params.currentDraft);

  // If no API key is provided, our local engine handles the full conversation smoothly
  if (!apiKey) {
    return localChatbotFallback(params.userMessage, normalizedDraft, params.currentUserName);
  }

  const systemPrompt = `Você é o Zé, assistente inteligente do Zela — sistema colaborativo de zeladoria urbana de Belém do Pará.
Você conversa de forma acolhedora, prestativa e natural com os cidadãos de Belém.

COMPORTAMENTO PRINCIPAL:
1. Converse com naturalidade. O usuário pode fazer saudações (ex: "oi", "boa noite"), perguntas gerais, bater papo ou relatar problemas da cidade.
2. NUNCA responda sempre a mesma coisa. Adapte-se ao contexto da mensagem do usuário.
3. A partir do momento em que perceber que o usuário está relatando um problema urbano (buraco, vazamento, lixo acumulado, poste apagado, calçada quebrada, bueiro entupido, etc.):
   - Guarde e acumule todas as informações extraídas no objeto "issueData", preservando os dados já coletados nas mensagens anteriores e acrescentando novos detalhes trazidos na mensagem atual.
   - Campos de issueData: category, description, address, neighborhood, severity (critical, high, medium, low), anonymous.
   - No decorrer da conversa, pergunte de forma gentil se o usuário gostaria de publicar essa ocorrência no sistema.
4. Se o usuário quiser publicar (ex: "sim", "quero publicar", "pode postar", "publica", "registra", "vamos publicar"):
   - Verifique os campos essenciais:
     * description (descrição clara)
     * category (categoria do problema)
     * address OU neighborhood (onde aconteceu em Belém)
   - SE FALTAR alguma informação essencial: avise de forma direta o que ainda está faltando para que possa ser publicado (ex: "Para publicarmos, ainda falta me dizer o endereço ou bairro onde isso aconteceu. Onde fica?").
   - SE TUDO ESTIVER COMPLETO: marque "readyToSubmit": true e avise ao usuário que o resumo foi montado para ele confirmar e publicar.
5. Se o usuário estiver apenas conversando, cumprimentando ou tirando dúvidas, responda de forma prestativa, simpática e humana.

REGRAS DE ESTILO E SEGURANÇA:
- NUNCA USE EMOJIS nas suas respostas. Zero emojis.
- Seja objetivo e breve (máximo de 1 a 3 frases por resposta).
- Responda estritamente em português do Brasil.
- A saída deve ser EXCLUSIVAMENTE um JSON válido com o schema especificado.

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
