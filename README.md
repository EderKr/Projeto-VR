<h1 align="center">Headbutt Berserker</h1>

<p align="center">
Jogo VR/WebXR de reflexos em que o jogador enfrenta inimigos usando movimentos de cabeça, histórico de desempenho e um assistente inteligente baseado em regras.
</p>

<hr>

## 🎮 Conceito

**Headbutt Berserker** é um jogo em realidade virtual no qual o jogador luta contra inimigos usando cabeçadas, esquivas laterais e agachamentos.

O protótipo atual usa **A-Frame/WebXR** para rastrear a câmera/cabeça do jogador. Também há suporte a teclado para testes no desktop:

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
- **PostgreSQL** via Docker Compose para histórico de desempenho;
- **JSON local (`db.json`)** como fallback;
- **Supabase/PostgreSQL** opcional para deploy externo.

> Nesta versão, o front-end é servido pelo próprio servidor Node. Por isso o Docker principal contém front + back no mesmo container, e o banco roda em outro container.

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

Sem Docker/PostgreSQL/Supabase, o projeto usa `db.json` como fallback.

<hr>

## 🗄️ Banco de dados

A aplicação suporta três modos, nesta prioridade:

1. **Supabase**, quando `USE_SUPABASE=true`;
2. **PostgreSQL local**, quando `USE_POSTGRES=true` ou `DATABASE_URL` estiver configurado;
3. **JSON local**, como fallback.

No Docker Compose, o modo padrão é PostgreSQL local:

```text
USE_POSTGRES=true
DATABASE_URL=postgres://vruser:vrpassword@postgres:5432/vrgame
```

O schema inicial fica em:

```text
docker/postgres/init.sql
```

Também existe o schema compatível com Supabase:

```text
supabase-schema.sql
```

<hr>

## ☁️ Deploy com Render

O projeto ainda pode ser publicado no Render usando `render.yaml`.

Para deploy simples sem banco externo:

```text
Build Command: npm ci
Start Command: npm start
USE_SUPABASE=false
USE_POSTGRES=false
```

Para produção real, prefira Supabase/PostgreSQL e configure:

```text
USE_SUPABASE=true
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
HISTORY_LIMIT=100
```

> A `SUPABASE_SERVICE_ROLE_KEY` deve ficar apenas no servidor. Nunca coloque essa chave no front-end.

<hr>

## 📁 Estrutura principal

```text
server.js                 -> back-end HTTP/API + servidor estático do front
database.js               -> camada de persistência JSON/Supabase/PostgreSQL
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
