export const MOTIVATIONAL_QUOTES = [
  'Grandes resultados começam com pequenas atitudes feitas todos os dias.',
  'O resultado de amanhã é construído pelas escolhas que fazemos hoje.',
  'Faça bem feito, mesmo quando ninguém estiver olhando.',
  'Consistência transforma esforço em resultado.',
  'Quem tem propósito não precisa de motivação todos os dias.',
  'Cada cliente atendido é uma oportunidade de fazer a diferença.',
  'Não buscamos apenas resultados. Buscamos resultados dos quais podemos nos orgulhar.',
  'Uma equipe forte transforma desafios em oportunidades.',
  'Excelência não é um ato. É um hábito.',
  'Problemas fazem parte do caminho. Desistir não precisa fazer.',
  'Hoje é mais uma oportunidade de sermos melhores do que ontem.',
  'O padrão que aceitamos hoje define o resultado que teremos amanhã.',
  'Fazer o certo todos os dias é o que transforma profissionais comuns em profissionais de excelência.',
  'Quem cuida dos detalhes entrega mais do que um serviço: entrega confiança.',
  'Não é sobre fazer mais. É sobre fazer melhor.',
  'O comprometimento aparece principalmente quando ninguém está cobrando.',
  'Grandes conquistas exigem pequenas decisões tomadas com disciplina.',
  'O cliente pode esquecer o que você disse, mas dificilmente esquecerá como foi tratado.',
  'Profissionalismo é entregar qualidade mesmo nos dias difíceis.',
  'A melhor equipe é aquela em que cada pessoa entende o valor do seu papel.',
  'Não espere reconhecimento para fazer um trabalho de excelência.',
  'Cada tarefa, por menor que pareça, contribui para o resultado final.',
  'Quem busca evolução não se acomoda com o que já sabe.',
  'O sucesso coletivo começa quando deixamos de pensar apenas no individual.',
  'Atitude profissional é fazer o que precisa ser feito, mesmo quando não é fácil.',
  'A confiança é construída todos os dias, em cada atendimento e em cada entrega.',
  'O resultado é importante, mas a maneira como chegamos até ele também importa.',
  'Pessoas comprometidas não procuram desculpas. Procuram soluções.',
  'Ser bom no que faz é importante. Buscar ser melhor é o que faz a diferença.',
  'O nosso trabalho fala por nós antes mesmo que precisemos explicar quem somos.',
  'Quem valoriza o próprio trabalho naturalmente busca entregar o seu melhor.',
  'Não existem grandes resultados sem responsabilidade nos pequenos detalhes.',
  'Uma boa atitude pode transformar um dia difícil em uma oportunidade de evolução.',
  'A diferença está naquilo que fazemos quando poderíamos simplesmente fazer o mínimo.',
  'Resolver problemas faz parte do trabalho. Aprender com eles faz parte do crescimento.',
  'A excelência começa quando o “está bom” deixa de ser suficiente.',
  'O compromisso de cada pessoa fortalece o resultado de toda a equipe.',
  'Quem quer crescer precisa estar disposto a aprender, mudar e melhorar.',
  'O trabalho em equipe começa quando entendemos que o sucesso de um depende do sucesso de todos.',
  'Faça com que o seu trabalho seja algo de que você tenha orgulho ao final do dia.',
  'Resultados sustentáveis são construídos com responsabilidade, não com pressa.',
  'A diferença entre uma equipe comum e uma grande equipe está no comprometimento de cada integrante.',
  'Não procure atalhos quando a consistência pode construir algo maior.',
  'O profissional que evolui hoje estará preparado para oportunidades maiores amanhã.',
  'Toda entrega é uma oportunidade de mostrar o padrão que queremos representar.',
  'A responsabilidade pelo resultado começa pela responsabilidade com aquilo que está nas nossas mãos.',
  'Quem aprende com cada desafio está sempre um passo à frente.',
  'Não precisamos ser perfeitos. Precisamos estar dispostos a melhorar continuamente.',
  'O ambiente muda quando as pessoas decidem mudar suas atitudes.',
  'Faça o seu trabalho de forma que a sua ausência seja sentida pela qualidade que você entrega.',
  'Uma equipe alinhada consegue transformar objetivos em resultados.',
];

const hashString = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const dayOrdinalInSaoPaulo = (date) => {
  const dayKey = date.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const [year, month, day] = dayKey.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
};

const quoteOrderForUser = (userKey) => {
  const order = MOTIVATIONAL_QUOTES.map((_, index) => index);
  let state = hashString(String(userKey)) || 1;
  for (let index = order.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }
  return order;
};

export const getDailyMotivationalQuote = (user = {}, date = new Date()) => {
  const userKey = user.id || user.email || user.name || 'cr-recursos';
  const order = quoteOrderForUser(userKey);
  const index = order[dayOrdinalInSaoPaulo(date) % order.length];
  return MOTIVATIONAL_QUOTES[index];
};
