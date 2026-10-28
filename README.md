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
