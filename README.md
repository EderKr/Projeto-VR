<h1 align="center">Fisio Trainer VR</h1>

<p align="center">
Projeto WebXR com jogo, espelho corporal por visao computacional, salas PC/celular, historico de desempenho e assistente baseado em regras.
</p>

<hr>

## 🎮 Conceito

**Fisio Trainer VR** e um projeto WebXR com jogo, espelho corporal e visao computacional para observar movimento em tempo real.

O prototipo atual usa **A-Frame/WebXR** para a arena VR e **MediaPipe Pose** para registrar pontos do corpo pela camera. Tambem ha suporte a teclado para testes no desktop:

- `↑` atacar;
- `←` esquivar para a esquerda;
- `→` esquivar para a direita;
- `↓` agachar;
- `Esc` abrir/fechar menu de pausa no desktop.

<hr>

## 🧰 Tecnologias utilizadas

- **Node.js** para o servidor/back-end;
- **A-Frame/WebXR** para o front-end VR;
- **JavaScript puro** no front-end;
- **MediaPipe Pose** para o controle corporal experimental;
- **WebSocket (`ws`)** para salas PC/celular;
- **PostgreSQL** via Docker Compose para histórico de desempenho;
- **JSON local (`db.json`)** como fallback.

> Nesta versao, o projeto esta separado em `backend/` e `frontend/`. O servidor Node fica no backend e serve os arquivos estaticos do `frontend`.

Estrutura principal:

```text
backend/
  server.js
  database.js
  package.json
  Dockerfile
  docker/postgres/init.sql
frontend/
  public/
    index.html
    game.html
    scripts/
    models/
```

<hr>

## 🐳 Rodar com Docker Compose

Requisitos:

- Docker;
- Docker Compose.

Suba a aplicação completa com banco PostgreSQL:

```bash
docker compose up --build
```

Acesse:

```text
http://localhost:3000
```

Nesta versao modificada:

```text
/       -> landing page com login, sala, Espelho IA, estatisticas e chat
/game   -> jogo WebXR e espelho 3D simulado
```

Na criacao de conta, o campo de genero escolhe o personagem do espelho:

```text
Masculino -> frontend/models/adventurer-male.glb
Feminino  -> frontend/models/adventurer-female.glb
```

O chat da landing usa a rota local:

```text
POST /api/assistant/chat
```

Ele responde com base no historico do usuario autenticado.

Tambem existe um controle corporal experimental em `/game`:

- `Ativar` liga a camera e o modelo MediaPipe Pose.
- `Ativar` tambem entra no modo Espelho IA: inimigo, HUD e menus somem.
- O jogador ve o personagem 3D no jogo, nao o video cru da camera.
- O modelo tenta mapear ossos nomeados do GLB para cabeca, tronco, bracos, pulsos, pernas e pes.
- O retargeting tambem aceita aliases comuns de esqueletos Mixamo/Ready Player Me, como `mixamorigLeftArm`, `LeftArm`, `LeftForeArm`, `LeftUpLeg` e equivalentes.
- O registro corporal usa suavizacao e pontuacao de corpo inteiro antes de considerar o tracking estavel.
- `Calibrar` salva a posicao neutra do corpo.
- Inclinar para esquerda/direita aciona esquiva.
- Abaixar o tronco aciona `duck`.
- Aproximar/avancar o corpo aciona ataque.

As leituras sao de controle e observacao de movimento, nao diagnostico medico.

### Modelos 3D externos

Para um rig mais previsivel, use um avatar full-body com esqueleto humanoide padronizado. O caminho recomendado e Ready Player Me full-body, porque os GLBs sao rigados, skinned e usam estrutura Mixamo-compatible.

Abra o jogo com um avatar Ready Player Me assim:

```text
/game?room=SALA&mirror=1&rpm=ID_DO_AVATAR
```

Ou passe uma URL GLB direta:

```text
/game?room=SALA&mirror=1&modelUrl=https%3A%2F%2Fexemplo.com%2Favatar.glb
```

Para voltar aos modelos Adventurer locais, rode no console do navegador:

```js
__corpusVRRigDebug.clearModel()
```

Na landing, o botao `Ativar espelho IA` tambem usa a camera e MediaPipe Pose, mas mostra apenas skeleton, qualidade de registro e metricas corporais. O espelho 3D simulado continua apenas no jogo.

### Salas PC/celular

A landing gera um codigo de sala e links:

```text
/api/room?room=SALA
/game?room=SALA
/game?room=SALA&mirror=1
/ws?room=SALA&role=game
```

Fluxo recomendado:

1. Abra a landing no PC e confira o codigo da sala.
2. No PC, abra `Espelho IA no PC` para usar a camera.
3. No celular, abra `Jogo no celular` usando o link da mesma sala.
4. As acoes detectadas pela camera no PC sao retransmitidas para o celular via WebSocket.

O celular e o PC precisam estar na mesma rede local para usar o link com IP da maquina.

A rota de saúde mostra se o banco está conectado:

```text
http://localhost:3000/api/health
```

Serviços criados:

```text
app       -> front + back Node.js, porta 3000
postgres  -> banco PostgreSQL local
```

Volumes persistentes:

```text
postgres-data -> dados do PostgreSQL
app-data      -> fallback local /data, caso necessário
```

Para parar:

```bash
docker compose down
```

Para apagar também os dados locais do banco:

```bash
docker compose down -v
```

<hr>

## 🚀 Rodar sem Docker

Requisitos:

- Node.js 18 ou superior;
- navegador moderno;
- headset compatível com WebXR para jogar em VR, ou teclado para teste em desktop.

Instale e rode:

```bash
npm install
npm start
```

Acesse:

```text
http://localhost:3000
```

Para validar sintaxe dos arquivos principais:

```bash
npm run check
```

Sem Docker/PostgreSQL, o projeto usa `db.json` como fallback.

<hr>

## 🗄️ Banco de dados

A aplicação suporta dois modos, nesta prioridade:

1. **PostgreSQL local**, quando `USE_POSTGRES=true` ou `DATABASE_URL` estiver configurado;
2. **JSON local**, como fallback.

No Docker Compose, o modo padrão é PostgreSQL local:

```text
USE_POSTGRES=true
DATABASE_URL=postgres://vruser:vrpassword@postgres:5432/vrgame
```

O schema inicial fica em:

```text
docker/postgres/init.sql
```

<hr>

## 📁 Estrutura principal

```text
server.js                 -> back-end HTTP/API + servidor estático do front
database.js               -> camada de persistência JSON/PostgreSQL
docker-compose.yml        -> app + PostgreSQL
Dockerfile                -> container da aplicação
docker/postgres/init.sql  -> schema do PostgreSQL local
public/                   -> front-end VR, modelos, sons e texturas
```

<hr>

## 🔮 Próximas melhorias planejadas

- melhorar a IA dos inimigos;
- melhorar a UI geral;
- evoluir o assistente IA baseado em desempenho;
- criar login e salvar usuários separados;
- criar ranking global;
- adicionar estatísticas por sessão;
- melhorar calibração VR inicial.
