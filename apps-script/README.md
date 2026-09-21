# Backend Apps Script

Esta pasta contém a versão privada do ToDo.

## Arquivos

- `Code.gs`: autenticação, planilha, Agenda e OpenAI;
- `Index.html`: estrutura da interface;
- `Styles.html`: CSS incorporado;
- `App.html`: JavaScript incorporado;
- `appsscript.json`: fuso horário e permissões.

Os três arquivos HTML são gerados a partir do front-end da raiz por `node scripts/build-apps-script.mjs`.

## Propriedades do projeto

Configure em **Configurações do projeto → Propriedades do script**:

| Propriedade | Obrigatória | Conteúdo |
| --- | --- | --- |
| `APP_PASSWORD` | Sim | Senha escolhida para entrar no painel |
| `OPENAI_API_KEY` | Para IA | Chave da API; nunca coloque no GitHub |
| `OPENAI_MODEL` | Para IA | Modelo disponível na conta com Structured Outputs |
| `CALENDAR_ID` | Não | `primary` ou o ID de outro calendário |
| `DEFAULT_EVENT_MINUTES` | Não | Duração, em minutos; padrão `60` |

## Publicação

Publique como aplicativo da web com:

- executar como: proprietário;
- acesso: qualquer pessoa.

A URL pública do Apps Script exibe a tela de senha. Todas as operações sobre dados exigem uma sessão válida no servidor.
