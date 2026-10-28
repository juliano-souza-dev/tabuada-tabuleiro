# Corrida da Tabuada 🎲

Jogo PWA local para **2 a 5 jogadores**, orientação paisagem, mapa oficial em `assets/mapa-oficial.webp`, dez avatares individuais e quatro tipos de casas especiais.

## Fluxo da partida

1. Selecionar jogadores, nomes e avatares.
2. Ao iniciar, solicitar **tela cheia** no gesto do usuário e, quando suportado, bloquear orientação paisagem.
3. Abrir popup do jogador atual: lançar dado, responder multiplicação.
4. Fechar popup, mostrar movimento animado sobre o mapa em tela inteira.
5. Resolver armadilha, areia movediça, portal ou baú **somente na casa onde parou**.
6. Aguardar e abrir automaticamente popup do próximo jogador habilitado.
7. Ao chegar na 40ª casa, encerrar a partida e mostrar popup com avatar e nome do vencedor.

### Clima WebGL

O arquivo `weather.js` renderiza **sol, chuva e neve** em canvas WebGL transparente sobre o mapa. O clima muda automaticamente a cada 3 turnos concluídos, com transição suave de 1,65 segundo. Uma camada CSS substitui o efeito quando WebGL não está disponível. Pausa as animações quando a página está oculta e respeita `prefers-reduced-motion`.

### Mobile

A área do mapa ocupa toda a largura e a altura útil. Como as posições das casas são percentuais, a arte utiliza `object-fit: fill` para manter os avatares alinhados, inclusive em telas muito largas; isso pode provocar pequena distorção da arte em proporções extremas.

**Limitações da plataforma:** navegadores podem negar Fullscreen API ou `screen.orientation.lock`; a PWA instalada solicita `display: fullscreen` e `orientation: landscape`. Em browsers sem essas APIs, a interface orienta a rotação manual.

### Estrutura

- `assets/avatars/`: SVGs individuais (5 masculinos, 5 femininos).
- `assets/path.json`: posições das 40 casas.
- `assets/special-spaces.json`: configuração das 8 casas especiais.
- `assets/events/`: ícones individuais dos eventos.
- `weather.js`: renderização WebGL com shaders e fallback.
- `app.js`: estado de turnos e transições entre popups.

Para testar localmente, use `python -m http.server 8000` e abra `http://localhost:8000`.


## Multiplayer online com Firebase

O modo **No mesmo celular** continua funcionando sem internet. O modo **Jogar online** permite salas privadas de **2 a 5 jogadores**, cada um no próprio aparelho, com código e link de convite. Dados automáticos no início de cada turno, multiplicações, tempo de 30 segundos, movimento, casas especiais, superpoderes e vitória são sincronizados pelo **Firebase Realtime Database**. O login é anônimo, sem cadastro.

### Ativação necessária

1. No [Firebase Console](https://console.firebase.google.com/), crie ou selecione um projeto.
2. Em **Authentication → Sign-in method**, habilite **Anônimo**.
3. Em **Realtime Database**, crie o banco e escolha a região. Não deixe as regras de teste abertas.
4. Registre um **app Web** nas configurações do projeto e copie as propriedades oficiais para `firebase-config.js`. Inclua a propriedade `databaseURL`, que vem da tela do Realtime Database. Os valores dessa configuração identificam o aplicativo Web, **não são credenciais de administrador**; a segurança depende das regras de acesso.
5. Publique **exatamente** as regras fornecidas em `database.rules.json` na aba Regras do Realtime Database. Alternativamente, use o Firebase CLI: `firebase login`, `firebase use --add` e `firebase deploy --only database` (o `firebase.json` já aponta para as regras). Se houver outra regra no mesmo banco, reconcilie antes de substituir.
6. Recarregue o GitHub Pages ou a PWA instalada para usar a versão nova.

Sem os dados reais do projeto, o jogo informa que as salas online ainda não estão configuradas. **Nenhuma configuração de Firebase foi inventada ou conectada automaticamente.**

### Arquitetura e limites

- `online.js`: integração com Authentication anônimo, salas por código de 7 caracteres, Realtime Database, presença e comandos dos jogadores.
- `online-logic.js`: regras de turno, respostas, tempo limite, casas especiais, barra de poder, alvos e penalidades.
- `online-ui.js`: criação/entrada de salas, convite, lobby, janela do jogador atual e feedback dos espectadores.
- `database.rules.json`: limita entradas aos cinco assentos, proíbe a escrita direta de posições pelos convidados e aceita somente comandos autenticados.
- A **máquina do anfitrião** valida dados, respostas, movimentações e penalidades usando transações do Realtime Database. O anfitrião **precisa permanecer conectado**; se sair, a partida aguarda sua reconexão.
- O relógio usa a estimativa de horário do servidor via `.info/serverTimeOffset`. O anfitrião aplica a expiração; em caso de desconexão dele, o prazo é aplicado quando se reconectar.
- Os comandos são serializados e identificados para evitar duplo processamento. Os convidados **não escrevem diretamente** o estado da partida.
- Como o anfitrião é uma autoridade no cliente, essa versão é adequada para partidas privadas entre familiares e amigos. Para competição pública e proteção robusta contra trapaças, use **Cloud Functions** ou outro processo de autoridade no servidor; regras do banco sozinhas não garantem que o anfitrião seja honesto.
- Os participantes voltam à mesma sala com o link e a sessão anônima persistente, desde que continuem no mesmo navegador/aparelho.
- Como o multiplayer exige conexão, somente o modo local permanece jogável offline.

### Regras atuais da partida

- **30 segundos por pergunta** nos modos local e online.
- No multiplayer, o **dado é lançado automaticamente** na abertura de cada turno; a pergunta aparece logo em seguida.
- Se a barra estiver cheia (3 acertos), o jogador pode escolher **responder ou lançar o superpoder**. Lançar o poder substitui a resposta: o relógio é cancelado, o ataque é aplicado e a vez passa ao próximo jogador.
- Ao escolher **Sair da partida**, o participante é retirado da sala e do tabuleiro. Se ele estava respondendo, a pergunta termina e o próximo jogador recebe imediatamente outra.
- A saída do anfitrião transfere a gestão para outro participante ainda presente, inclusive com partidas em andamento.
- Quedas involuntárias têm **20 segundos de tolerância** antes que o novo anfitrião ou o anfitrião ainda conectado retire a pessoa da partida. Uma reconexão antes desse prazo preserva a participação.
- **Se restar somente um jogador**, a partida termina de modo amigável com uma mensagem de encerramento e opção de voltar ao início. Ninguém fica preso em uma sala com um único participante.
- Todos os jogadores ainda presentes recebem um aviso de saída; o resultado da última partida permanece visível até que o jogador o feche.

**Importante para a publicação:** após esta atualização, as regras revisadas em `database.rules.json` também precisam ser publicadas no Realtime Database. Elas incluem a nova fase de lançamento de poder, a saída voluntária de um participante e a transferência segura de anfitrião. O workflow atual do GitHub Pages **não** publica regras do Firebase automaticamente. Use a aba de regras no console ou `firebase deploy --only database` no projeto correspondente. Sem essa atualização do banco, algumas saídas de convidados podem ser resolvidas pelo anfitrião, mas a transferência de anfitrião pode ser recusada pelo servidor.

