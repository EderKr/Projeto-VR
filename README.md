<h1 align="center">Fisio Trainer VR</h1>

<p align="center">
Jogo VR/WebXR de reflexos em que o jogador enfrenta inimigos usando movimentos de cabeça, com histórico de desempenho e assistente inteligente baseado em regras.
</p>

<hr>

## 🎮 Conceito

**Fisio Trainer VR** é um jogo em realidade virtual no qual o jogador luta contra inimigos usando cabeçadas, esquivas laterais e agachamentos, com A-Frame/WebXR rastreando a câmera/cabeça do jogador.

Controles de teclado para testes no desktop:

| Tecla | Ação |
|-------|------|
| `↑` | Atacar |
| `←` | Esquivar esquerda |
| `→` | Esquivar direita |
| `↓` | Agachar |
| `Esc` | Abrir/fechar menu de pausa |

<hr>

## 🚀 Deploy no Coolify

### Pré-requisitos

- Instância Coolify funcionando
- Repositório Git com este código (GitHub, GitLab, Gitea etc.)

### Passo a passo

**1. Criar novo projeto no Coolify**

- Vá em **Projects → New Project**
- Dê um nome (ex: `headbutt-berserker`)

**2. Adicionar novo recurso**

- Clique em **Add New Resource → Docker Compose**
- Selecione o repositório e a branch

**3. Configurar variáveis de ambiente**

No painel **Environment Variables**, adicione:

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `AUTH_SECRET` | **Obrigatório em produção.** Chave secreta para tokens JWT | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `POSTGRES_PASSWORD` | Senha do banco | string aleatória forte |
| `CORS_ORIGIN` | Origens permitidas | `https://meu-jogo.com` |
| `HISTORY_LIMIT` | Máximo de partidas no histórico | `100` |
| `POSTGRES_DB` | Nome do banco | `vrgame` |
| `POSTGRES_USER` | Usuário do banco | `vruser` |

> ⚠️ **`AUTH_SECRET` é obrigatório.** O container não sobe sem ele.

**4. Configurar domínio**

- Em **Domains**, aponte seu domínio para a porta `3000` do serviço `app`
- Ative HTTPS (Coolify gerencia o certificado via Let's Encrypt)
- Atualize `CORS_ORIGIN` com o domínio final: `https://meu-jogo.com`

**5. Deploy**

- Clique em **Deploy**
- Acompanhe os logs — o container `postgres` sobe primeiro; o `app` aguarda o healthcheck do banco

**6. Verificar saúde**

```
https://meu-jogo.com/api/health
```

Resposta esperada:
```json
{ "ok": true, "service": "headbutt-berserker", "database": { "connected": true } }
```

<hr>

## 🐳 Rodar localmente com Docker Compose

```bash
# 1. Copie e edite as variáveis
cp .env.example .env
# Edite .env com AUTH_SECRET e POSTGRES_PASSWORD

# 2. Suba tudo
docker compose up --build

# 3. Acesse
open http://localhost:3000
```

Para parar e limpar:
```bash
docker compose down          # para os containers
docker compose down -v       # remove também os volumes de dados
```

<hr>

## 🔧 Rodar sem Docker

Requisitos: Node.js 18+, navegador moderno, headset WebXR (opcional).

```bash
cd backend
npm install
npm start
```

Acesse `http://localhost:3000`. Sem PostgreSQL, usa `db.json` como fallback automático.

<hr>

## 🧰 Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | A-Frame / WebXR, JavaScript puro |
| Backend | Node.js (HTTP nativo, sem framework) |
| Banco | PostgreSQL 16 (fallback: JSON local) |
| Container | Docker + Docker Compose |

<hr>

## 📁 Estrutura

```
backend/
  server.js          → servidor HTTP + API REST
  database.js        → camada de persistência (PostgreSQL / JSON)
  package.json       → dependências do backend
  Dockerfile         → imagem da aplicação
frontend/
  index.html         → SPA do jogo (A-Frame)
  scripts/           → lógica do jogo
  models/            → modelos 3D (.glb)
  sounds/            → efeitos sonoros
  textures/          → texturas
docker/
  postgres/
    init.sql         → schema inicial do PostgreSQL
docker-compose.yml   → app + banco para produção/dev
.env.example         → template de variáveis de ambiente
```

<hr>

## 🔮 Próximas melhorias planejadas

- Melhorar a IA dos inimigos (sistema adaptativo por desempenho)
- Telemetria em tempo real dentro do VR (painel 3D)
- Avatar fantasma como guia de movimento correto
- Login e ranking global
- Estatísticas avançadas por sessão (velocidade angular, assimetria lateral, latência motora)
- Calibração VR aprimorada
