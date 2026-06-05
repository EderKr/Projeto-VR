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
- **JSON local (`db.json`)** como fallback.

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

Sem Docker/PostgreSQL, o projeto usa `db.json` como fallback.

<hr>

## 🗄️ Banco de dados

A aplicação usa PostgreSQL próprio, local ou remoto, quando `USE_POSTGRES=true` ou `DATABASE_URL` estiver configurado.

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
backend/                  -> back-end Node.js, API e persistência
backend/server.js         -> servidor HTTP + API
backend/database.js       -> camada de persistência JSON/PostgreSQL
backend/package.json      -> dependências e scripts do back-end
backend/Dockerfile        -> container da aplicação back-end
frontend/                 -> front-end VR, modelos, sons e texturas
docker-compose.yml        -> app + PostgreSQL
docker/postgres/init.sql  -> schema do PostgreSQL local
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


velocidade_angular_cefálica: O quão rápido o usuário moveu a cabeça para desviar (m/s ou rad/s).

amplitude_movimento_vertical: Distância percorrida no agachamento para avaliar a profundidade do movimento corporal.

latência_resposta_motora: O tempo exato entre o estímulo visual da IA e o início do movimento físico (milissegundos).

assimetria_lateral: Se o usuário tem preferência ou maior facilidade de desviar para a esquerda ou para a direita (útil para detectar desequilíbrios musculares).

Na Interface WebXR (A-Frame)
Painel de Telemetria em Tempo Real: Criar uma interface dentro do VR (usando texto ou gráficos em planos 3D) que mostre ao usuário vetores de movimento ou gráficos de linhas com o desempenho físico dele durante a sessão.

Avatares de Referência / Fantasmas (Visualização Corporal): Permitir que o usuário veja um modelo 3D estilizado que replica o movimento correto que ele deveria ter feito, servindo como um guia visual cinestésico.

Na Inteligência Artificial (O Assistente Baseado em Regras)
O seu assistente inteligente deixa de ser um "gerador de inimigos" e passa a ser um Sistema Especialista de Carga Adaptativa:

Se o banco de dados detectar que a velocidade angular do usuário caiu 20% nas últimas sessões (sinal de fadiga), a IA adapta o simulador, diminuindo a frequência dos estímulos ou sugerindo uma pausa.

Se o usuário desvia com menos amplitude para a esquerda do que para a direita, a IA foca em gerar estímulos para o lado deficitário para promover o reequilíbrio corporal.