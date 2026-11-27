# Corpus

Corpus é um jogo 3D de combate que utiliza visão computacional para transformar os movimentos do jogador em comandos. Através da webcam, é possível atacar, esquivar, agachar e pular para enfrentar diferentes inimigos.

## Requisitos

- Node.js 18 ou superior.
- Navegador moderno com suporte à webcam.
- Webcam e espaço suficiente para se movimentar.
- Conexão com a internet para carregar as bibliotecas do jogo.

Não é necessário instalar dependências, configurar um banco de dados ou utilizar Docker.

## Como executar

1. Abra um terminal na pasta raiz do projeto.
2. Execute o comando:

   ```bash
   node backend/server.js
   ```

3. Acesse [http://localhost:3000](http://localhost:3000) no navegador.
4. Clique em **Ativar câmera e calibrar**, permita o acesso à webcam e aguarde a calibração mantendo-se parado, com a cabeça, os ombros, os braços e a cintura visíveis.
5. Clique em **Iniciar jogo** ou coloque as mãos na cintura com os cotovelos abertos.

## Como jogar

O objetivo é evitar os ataques dos inimigos e atacá-los quando estiverem vulneráveis. Observe os avisos do jogo para executar a ação correta.

| Ação | Movimento pela câmera | Teclado |
| --- | --- | --- |
| Atacar | Estique um dos braços para frente e recolha-o para repetir. | ↑ |
| Esquivar à esquerda | Incline o corpo para a esquerda. | ← |
| Esquivar à direita | Incline o corpo para a direita. | → |
| Agachar | Dobre os joelhos e abaixe o corpo. | ↓ |
| Pular | Dê um pequeno salto. | Espaço |
| Iniciar jogo / iniciar fase / encerrar partida | Coloque as mãos na cintura, com os cotovelos abertos. Retire as mãos antes de repetir. | Botão correspondente |
| Pausar / retomar | Cruze os antebraços em X à frente do peito por um instante. Descruze e repita para retomar. | Esc ou botão de pausa |

Para melhorar o reconhecimento dos movimentos, jogue em um ambiente bem iluminado e mantenha a parte superior do corpo visível na câmera. Enquadre também a cintura para o gesto de início e encerramento. Após vencer um inimigo, use **Iniciar fase** para continuar. Durante a luta, o mesmo botão se torna **Encerrar partida**. Se necessário, utilize a opção **Recalibrar**.

## Tecnologias utilizadas

- HTML, CSS e JavaScript: interface e lógica do jogo.
- A-Frame: ambiente e modelos 3D.
- MediaPipe Pose Landmarker: rastreamento dos movimentos corporais.
- Node.js: servidor HTTP local.

## Armazenamento

O histórico de desempenho é salvo automaticamente no navegador por meio do `localStorage`. Não é necessário criar uma conta. Os dados permanecem no navegador utilizado e podem ser apagados ao limpar os dados do site.

## Estrutura do projeto

```text
backend/           Servidor local e testes automatizados
frontend/          Interface, scripts e recursos do jogo
README.md          Documentação do projeto
```
