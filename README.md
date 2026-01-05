# Backend - PetFeliz Feedback API

PetFeliz Feedback API é uma aplicação Node.js que gerencia feedbacks de clientes de uma clínica fictícia chamada Pet Feliz, incluindo registro de mensagens de chat com assistente virtual, armazenamento temporário em Redis e persistência em banco de dados MySQL. A API também oferece endpoints para cadastro, consulta e exclusão de registros, automatizando o salvamento de conversas e mantendo histórico de interações.

---

### Frontend
Este repositório contém apenas o backend da aplicação.

O código do frontend em React está disponível em um repositório separado no GitHub:

Frontend – PetFeliz Feedback API
(https://github.com/willqos15/Avabot_Frontend)

---

## Funcionalidades

- Registro de conversas de chat com assistente virtual.
- Salvamento automático de conversas inativas no banco de dados.
- Limitação de histórico em Redis para até 50 mensagens.
- Assistente virtual que solicita nome do cliente e responde de forma cordial, seguindo regras de interação definidas.
- Endpoints para cadastro, consulta e exclusão de feedbacks.
- Integração com Redis e MySQL.
- Controle de sessões e flags para evitar salvamento duplicado.

---

## Tecnologias

- Node.js
- Express
- Axios
- Redis (`ioredis`)
- MySQL
- Dotenv para variáveis de ambiente
- CORS para permitir requisições de frontends específicos

---

## Variáveis de Ambiente

O arquivo `.env` deve conter:

```
PORT=PORTA_DESEJADA
RURL=LINK_DO_REDIS
GKEY=SUA_CHAVE_API_ASSISTENTE
```

---

## Endpoints

### Chat

- `POST /chat`  
  Recebe do Frontend a mensagem do usuário, id, xp e retorna resposta da assistente virtual.  
  Corpo da requisição:  
  ```json
 {
  "id": "12345",
  "xp": "boa",
  "mensagem": "Amei a Clínica"
  }
  ```


- `GET /criatabela`
Cria a tabela registros no MySQL caso não exista.


- `POST /cadastrar`
Insere novo feedback no banco. Campos obrigatórios: chatid, xp e conversa.
Exemplo de corpo da requisição:

```{
  "chatid": "1",
  "xp": "boa",
  "conversa": "Atendimento ruim, demorou 2 horas"
}
```


- `DELETE /deletar/:id`
Remove registro do banco de dados por ID.

---

### Como Funciona o Salvamento Automático

A cada 30 segundos, o servidor verifica todas as conversas armazenadas em Redis. Se houver mensagens inativas por mais de 1 minuto e ainda não salvas no banco, o sistema:

- Converte o histórico em JSON.

- Insere no MySQL com o ID do chat, conversa e XP do último usuário.

- Marca a conversa como salva (chave:salvo).

- Limpa o histórico do Redis.

### Execução

1- Instale dependências:
``` npm install
npm install express cors ioredis dotenv axios mysql2
```

2- Configure .env com suas variáveis.

3- Verifique se Redis e MySQL estão funcionando

4- Inicie o servidor:
```node serverg.js
```

---

### Observações

Redis é usado como armazenamento temporário e controle de sessões.

O histórico de chat é limitado a 50 mensagens para evitar sobrecarga.

A assistente virtual é chamada via API externa e segue regras de cordialidade e limitação de interações.

Todas as operações críticas possuem tratamento de erros e logs detalhados.

---

## Estrutura de Arquivos do Projeto

```
├─ node_modules/
├─ .env
├─ .gitignore
├─ db.js
├─ package-lock.json
├─ package.json
├─ README.md
└─ serverg.js
```


## Descrição dos Arquivos

- **`node_modules/`**  
  Pasta com todas as dependências do projeto instaladas via npm. Não deve ser commitada no GitHub.

- **`.env`**  
  Arquivo de variáveis de ambiente, usado para armazenar informações sensíveis como senhas, chaves e URLs.

- **`.gitignore`**  
  Lista arquivos e pastas que o Git deve ignorar, como `node_modules/` e `.env`.

- **`db.js`**  
  Configuração e conexão com o banco de dados, exportando instâncias que podem ser usadas no resto do projeto.

- **`package-lock.json`**  
  Trava as versões exatas das dependências do projeto, garantindo consistência entre diferentes ambientes.

- **`package.json`**  
  Arquivo principal de configuração do projeto Node.js. Contém informações do projeto, scripts e dependências.

- **`README.md`**  
  Documentação do projeto, explicando o que é, como instalar, rodar e contribuir.

- **`serverg.js`**  
  Arquivo principal do servidor, inicializa o Express, configura rotas, middlewares e conecta ao banco.

---

### 👨‍💻 Sobre o autor
Desenvolvido por William Queiroz 🔗 Portfólio: (https://queirozdeveloper.vercel.app/)
