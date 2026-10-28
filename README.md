# Corrida da Tabuada 🎲

Jogo mobile horizontal para 2 a 5 jogadores no mesmo dispositivo, com 10 avatares individuais (5 masculinos e 5 femininos).

- **Avatares**: arquivos SVG transparentes em `assets/avatars/`, pequenos no tabuleiro (1,8% da largura do mapa).
- **Trilha**: posições percentuais das 40 casas no arquivo `assets/path.json`.
- **Mapa**: arquivo `assets/mapa-oficial.webp` (arte aprovada integrada ao repositório, convertida para WebP para carregar melhor no celular).
- **Interface**: HTML/CSS/JS responsivo, sem elementos de controle incorporados ao mapa.

Para executar use servidor HTTP local, por exemplo `python -m http.server 8000`.

## Casas especiais

As oito casas especiais são configuradas em `assets/special-spaces.json` usando índice zero (0 é o ponto de partida). Cada uma usa um SVG separado em `assets/events/`, desenhado sobre o mapa sem alterar a imagem.

- 🪤 Armadilha: volta até 3 casas.
- 🕳️ Areia movediça: perde a próxima rodada.
- 🌀 Portal: avança ou retrocede 5 casas aleatoriamente.
- 🎁 Baú: 65% de chance de ganhar 3 casas; caso contrário, recua 2.

Somente parar exatamente na casa após acertar a multiplicação ativa seu efeito. O movimento provocado pelo efeito não aciona armadilhas em cadeia. A entrada na casa final encerra a partida; durante o efeito e a troca de turnos o dado fica desabilitado.
