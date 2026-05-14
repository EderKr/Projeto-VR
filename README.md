<h1 align="center">Headbutt Berserker</h1>

<p align="center">
Jogo VR/WebXR de reflexos em que o jogador enfrenta inimigos usando movimentos de cabeça, histórico de desempenho e um assistente inteligente baseado em regras.
</p>

<hr>

## 🎮 Conceito

**Headbutt Berserker** é um jogo em realidade virtual no qual o jogador controla um viking sem braços que luta contra inimigos usando cabeçadas, esquivas laterais e agachamentos.

O protótipo atual usa **A-Frame/WebXR** para rastrear a câmera/cabeça do jogador. Também há suporte a teclado para testes no desktop:

- `↑` atacar;
- `←` esquivar para a esquerda;
- `→` esquivar para a direita;
- `↓` agachar;
- `Esc` abrir/fechar menu de pausa no desktop.

> Observação: a visão computacional aparece como evolução futura do projeto. A versão atual usa rastreamento de cabeça pelo WebXR/A-Frame.

<hr>

## ⚡ Treinamento de reflexos

Durante as partidas, o jogo registra métricas como:

- tempo médio de reação;
- acertos e erros;
- precisão por ação;
- timeouts;
- desempenho por fase;
- histórico das últimas partidas.

Essas informações podem ser salvas no `db.json` local ou em um banco **Supabase/PostgreSQL** quando `USE_SUPABASE=true`. O menu de histórico continua usando as mesmas rotas da API.

<hr>

## 🧠 Assistente IA

A aba **Assistente IA** já possui uma primeira versão funcional baseada em regras. Ela analisa o histórico recente e gera recomendações como:

- aumentar dificuldade quando a precisão e o tempo de reação estão bons;
- reduzir dificuldade quando há muitos erros;
- treinar ações específicas com menor precisão;
- ajustar o modo customizado quando há muitos timeouts.

Essa abordagem não usa machine learning ainda, mas já funciona como um assistente inteligente baseado em métricas de desempenho.

<hr>

## 🧰 Tecnologias utilizadas

- **Node.js** para o servidor HTTP;
- **A-Frame 1.5.0** para a cena VR/WebXR;
- **aframe-environment-component** para ambiente 3D;
- **JavaScript puro** no front-end;
- **JSON local (`db.json`)** como fallback de desenvolvimento;
- **Supabase/PostgreSQL** para histórico em produção.

<hr>

## 🚀 Como rodar localmente

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

<hr>

## 🌐 Servidor público / deploy

O projeto já está preparado para hospedagem pública com:

- `HOST=0.0.0.0`;
- `PORT` por variável de ambiente;
- rota de saúde em `/api/health`;
- `Dockerfile`;
- `render.yaml`;
- `.env.example`.

### Opção rápida: Render

1. Suba este projeto para o GitHub.
2. Crie um novo **Web Service** no Render.
3. Selecione o repositório.
4. Use:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Configure as variáveis:
   - `HOST=0.0.0.0`
   - `NODE_ENV=production`
   - `CORS_ORIGIN=*`
6. Abra a URL gerada pelo Render.

### Opção com Docker

```bash
docker build -t headbutt-berserker .
docker run -p 3000:3000 -e HOST=0.0.0.0 headbutt-berserker
```

Depois acesse:

```text
http://localhost:3000
```

### Banco de dados com Supabase/PostgreSQL

O projeto já vem preparado para usar Supabase. O navegador continua acessando as rotas do servidor, por exemplo `/api/history`; somente o `server.js` conversa com o banco.

1. Crie um projeto no Supabase.
2. Abra **SQL Editor**.
3. Execute o conteúdo do arquivo `supabase-schema.sql`.
4. No Render, configure as variáveis:

```text
USE_SUPABASE=true
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
HISTORY_LIMIT=100
```

> Atenção: a `SUPABASE_SERVICE_ROLE_KEY` deve ficar apenas no servidor/Render. Nunca coloque essa chave em arquivos públicos do front-end.

A rota `/api/health` mostra se o servidor está usando `supabase` ou `json`.

### Persistência em produção

Com Supabase ativado, o histórico fica no PostgreSQL e não depende mais do arquivo local. Sem Supabase, o projeto usa `db.json` como fallback. Em hospedagens gratuitas, arquivos locais podem ser apagados quando o serviço reiniciar.

Para produção real, recomenda-se usar Supabase/PostgreSQL. Como alternativa temporária, use disco persistente e variável `DB_PATH`, por exemplo `/data/db.json`.

<hr>

## 📁 Estrutura principal

```text
server.js
database.js
supabase-schema.sql
package.json
db.json
public/
  index.html
  style.css
  scripts/
    state.js
    ui.js
    gameplay.js
    components.js
```

<hr>

## 🔮 Melhorias futuras

- integrar visão computacional real com câmera;
- substituir o assistente por modelo de IA/ML;
- criar login e salvar usuários separados;
- criar ranking global usando Supabase;
- adicionar ranking e estatísticas por sessão;
- melhorar calibração VR inicial.

<hr>

## Referência

- A-Frame Environment Component: https://github.com/supermedium/aframe-environment-component
