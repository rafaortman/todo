# ToDo

Beta de um gerenciador pessoal de tarefas, desenvolvido com HTML, CSS e JavaScript puro.

## Demonstração pública

https://rafaortman.github.io/todo/?demo=1

O parâmetro `demo=1` ativa dados fictícios isolados no navegador, restauração do estado inicial e uma simulação local do fluxo de criação por IA. Esse modo nunca acessa Sheets, Agenda ou a API da OpenAI.

## Estado atual

- tarefas em cards com cores configuráveis;
- busca, filtros e ordenação;
- ordem manual por arrastar e soltar;
- criação e edição de tarefas;
- interlocutores e links relacionados;
- conclusão e reabertura;
- tema claro/escuro;
- persistência local no navegador na demonstração;
- backend privado em Google Apps Script;
- autenticação por senha com sessão temporária;
- Google Sheets como banco de dados;
- sincronização de tarefas agendadas com o Google Agenda;
- criação assistida de tarefas pela OpenAI Responses API.

## Arquitetura privada

O código do Apps Script fica em `apps-script/`. A versão privada é servida pelo próprio Apps Script, o que mantém senha, chave da OpenAI e permissões do Google fora do front-end público.

Propriedades obrigatórias do projeto:

- `APP_PASSWORD`: senha do painel;
- `OPENAI_API_KEY`: chave da API da OpenAI;
- `OPENAI_MODEL`: modelo habilitado na conta e compatível com Structured Outputs.

Propriedades opcionais:

- `CALENDAR_ID`: ID do calendário; omita ou use `primary` para o calendário principal;
- `DEFAULT_EVENT_MINUTES`: duração padrão dos eventos, em minutos; o padrão é 60.

Depois de alterar `index.html`, `styles.css` ou `app.js`, execute:

```bash
node scripts/build-apps-script.mjs
```

Isso atualiza `Index.html`, `Styles.html` e `App.html` dentro de `apps-script/`.

O Apps Script deve ser publicado como aplicativo da web, executado pelo proprietário e acessível a qualquer pessoa. O acesso aos dados continua bloqueado pela senha e pelo token de sessão verificados no servidor.

## Desenvolvimento local

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000`.
