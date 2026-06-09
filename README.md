# Corpus VR

Corpus VR e um projeto WebXR com landing page, login, salas PC/celular, jogo VR, espelho corporal por visao computacional, historico de desempenho e assistente baseado nas estatisticas do usuario.

## Estrutura

```text
backend/
  server.js
  database.js
  package.json
  db.json
frontend/
  index.html
  game.html
  style.css
  scripts/
  models/
  sounds/
  textures/
docker/
  postgres/init.sql
Dockerfile
docker-compose.yml
```

## Modelos Ready Player Me

Os modelos usados no espelho corporal ficam em:

```text
Masculino -> frontend/models/ready-player-me-male.glb
Feminino  -> frontend/models/ready-player-me-female.glb
```

Os dois GLBs tem esqueleto humanoide com `Hips`, `Spine`, `Head`, `LeftArm`, `LeftForeArm`, `LeftHand`, `RightArm`, pernas e pes. O controlador de pose mapeia landmarks do MediaPipe para esses ossos.

No jogo, abra o console do navegador para testar o rig:

```js
__corpusVRRigDebug.bones()
__corpusVRRigDebug.segments()
__corpusVRRigDebug.raised()
__corpusVRRigDebug.neutral()
```

Use tambem:

```text
/game?gender=male&mirror=1
/game?gender=female&mirror=1
/game?gender=male&rigtest=1
/game?gender=female&rigtest=1
```

## Rodar local sem Docker

```bash
cd backend
npm install
npm start
```

Acesse:

```text
http://localhost:3000
```

## Rodar com Docker Compose / Coolify

```bash
docker compose up --build
```

Servicos:

```text
app       -> Corpus VR em Node.js, porta interna 3000
postgres  -> PostgreSQL 16
```

Variaveis importantes:

```text
PORT=3000
HOST=0.0.0.0
AUTH_SECRET=troque-por-uma-frase-grande-e-secreta
USE_POSTGRES=true
POSTGRES_DB=vrgame
POSTGRES_USER=vruser
POSTGRES_PASSWORD=vrpassword
FRONTEND_DIR=/app/frontend
DB_PATH=/data/db.json
```

No Coolify, use Docker Compose, aponte o dominio para o servico `app` na porta interna `3000` e configure `AUTH_SECRET` e `POSTGRES_PASSWORD` no painel.

## Rotas principais

```text
/                    landing page
/game                jogo WebXR
/game?mirror=1       espelho corporal no jogo
/api/health          status da aplicacao e banco
/api/assistant/chat  chat sobre estatisticas do usuario
/ws                  salas PC/celular via WebSocket
```

As leituras de pose sao experimentais e nao sao diagnostico medico. Elas servem para observar movimento, assimetria e controle corporal durante a simulacao.
