require('dotenv').config()
const express = require('express')
const cors = require('cors')
const app = express()
app.use(express.json())
const db = require('./db')
const PORT = process.env.PORT || 3000
const axios = require('axios')
const tbnome = 'registros'



// ===============================
// "Banco" em memória (TESTE)
// ===============================
const chats = {}
// estrutura:
// chats[id] = [
//   { role, content, hora }
// ]

app.use(cors({
    origin: 'http://localhost:5173'
}))




const inatividade = 30000   // 1 minuto
const intervalo = 10000    // roda a cada 30s

setInterval(async () => {
    try {
        const ids = Object.keys(chats)

        for (const id of ids) {
            const chat = chats[id]

            if (!chat || !chat.mensagens || chat.mensagens.length === 0)
                continue

            const ultimaMensagem = chat.mensagens[chat.mensagens.length - 1]
            const ultimahora = ultimaMensagem?.hora

            if (!ultimahora) continue

            // já foi salvo? pula
            if (chat.salvo) continue

            // passou do tempo de inatividade?
            if (Date.now() - ultimahora > inatividade) {

                const conversaJSON = JSON.stringify(chat.mensagens)

                // se quiser salvar no banco, é aqui
                /*
                await db.query(
                  `INSERT INTO ${tbnome} (chatid, conversa) VALUES (?, ?)`,
                  [id, conversaJSON]
                )
                */
               console.log('salvo bd')

                chat.salvo = true
            }
        }
    } catch (err) {
        console.error("erro no timer de inatividade", err)
    }
}, intervalo)





app.post('/chat', async (req, res) => {
    const { mensagem, id } = req.body

    if (typeof mensagem !== "string" || !mensagem.trim())
        return res.status(400).json({ msg: "Nenhuma mensagem enviada" })

    if (typeof id !== "string" || !id.trim())
        return res.status(400).json({ msg: "Nenhum ID enviado" })

    try {
        // cria histórico se não existir
        if (!chats[id]) {
            chats[id] = {
                mensagens: [],
                salvo: false
            }
        }

        // pega últimas 10 mensagens
        const leitura = chats[id].mensagens.slice(-10)

        const history = leitura
            .filter(x => x.role && x.content)
            .map(x => ({
                role: x.role,
                content: x.content
            }))

        const resposta = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: "llama-3.1-8b-instant",
                stream: false,
                max_completion_tokens: 1024,
                temperature: 1,
                messages: [
                    {
                        role: "system",
                        content:
                            "Você é uma atendende de clinica Mais Saúde, seu nome é Ana..."
                    },
                    ...history,
                    {
                        role: "user",
                        content: mensagem
                    }
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.GKEY}`,
                    "Content-Type": "application/json"
                }
            }
        )

        // salva mensagem do usuário
        chats[id].mensagens.push({
            role: "user",
            content: mensagem,
            hora: Date.now()
        })
        chats[id].salvo = false

        const botmensagem = resposta.data.choices[0].message.content

        // salva mensagem do bot
        chats[id].mensagens.push({
            role: "assistant",
            content: botmensagem,
            hora: Date.now()
        })
        chats[id].salvo = false

        // limita histórico a 50 mensagens
        chats[id].mensagens = chats[id].mensagens.slice(-50)

        return res.json({ resposta: botmensagem })
    } catch (err) {
        console.error(err.response?.data || err.message)
        return res.status(500).json({ erro: "Falha externa API" })
    }
})

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`)
})
