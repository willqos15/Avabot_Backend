require('dotenv').config()
const express = require('express')
const cors = require('cors')
const Redis = require('ioredis')
const app = express()
app.use(express.json())
const db = require('./db')
const PORT = process.env.PORT || 3000
const axios = require('axios')
const tbnome = 'registros'

const redis = new Redis(process.env.RURL) //localhost:6379
const inatividade = 60000
const intervalo = 30000

setInterval(async () => {

    console.log('1- setInterval executado')

    try {
        const chats = await redis.keys('chat:*')
            .then(keys => keys.filter(x => !x.endsWith(':salvo')))

        for (const chave of chats) {
            const data = await redis.lrange(chave, 0, -1)
            if (!data || data.length === 0) continue

            const message = data.map(x => JSON.parse(x))
            const ultimahora = message[message.length - 1]?.hora
            if (!ultimahora) continue

            const ultimamsguser = [...message].reverse().find(m => m.role === 'user')
            const xpdb = ultimamsguser?.xp

            console.log('2- data.lenght ok: ', data.length, 'e ultima hora ok: ', ultimahora, 'xpdb: ', xpdb)



            const jaSalvo = await redis.get(`${chave}:salvo`)
            console.log('3- buscando ja salvo:', jaSalvo)

            if (Date.now() - ultimahora > inatividade && !jaSalvo) {

                console.log('4- conversa nao salva:', jaSalvo)



                const conversaJSON = JSON.stringify(message)


                db.query(
                    `INSERT INTO ${tbnome} (chatid,conversa,xp) VALUES (?,?,?)`, [chave, conversaJSON, xpdb],
                    (err, result) => {
                        if (err) {
                            console.log("Erro save bd", err)
                            return
                        }
                        console.log('Bd saved', result)
                    }
                )

                await redis.set(`${chave}:salvo`, 'ok')
                console.log('5 OK- salvo mensagem bd -------')

                await redis.del(chave)
                await redis.del(chave, `${chave}:salvo`)


            }


        }
    } catch (err) {
        console.error("erro no timer de inatividade", err)

    }
}
    , intervalo)






app.use(cors({
    origin: ['http://localhost:5173',
        'https://petfeliz-rho.vercel.app']
}))




app.post('/chat', async (req, res) => {
    const { mensagem, id, xp } = req.body
    if (typeof mensagem !== "string" || !mensagem.trim())
        return res.status(400).json({ "msg": "Nenhuma mensagem enviada" })
    if (typeof id !== "string" || !id.trim()) return res.status(400).json({ "msg": "Nenhum ID enviado" })


    try {
        //lrange(chave, inicio, fim) o -1 significa ultimo item da lista
        const leitura = await redis.lrange(`chat:${id}`, -10, -1)
        const mapleitura = leitura.map(x => JSON.parse(x))

        const history = mapleitura.filter(x => x.role && x.content).map(x => ({
            role: x.role, content: x.content
        }))



        const resposta = await axios.post('https://api.groq.com/openai/v1/chat/completions',
            {
                model: "llama-3.1-8b-instant",
                stream: false,
                max_completion_tokens: 1024,
                temperature: 1,
                messages: [

                    {
                        role: "system",
                        content: 
                            "Você é Ana, assistente virtual que tem a função de receber feedback dos clientes da clínica Pet Feliz, O cliente virá a você com uma sugestão ou reclamação, a qual você deve atender de maneira gentil, com linguagem acessível e cordial. Uso no máximo 12 palavras por mensagem. Ao final agradeça, a cada 3 mensagens suas você pode usar um emoji. Ao finalizar a conversa agradeça e diga que vai comunicar o gerente em caso de problema. Regra 1- OBRIGATÓRIAMENTE use no máximo 12 palavras por mensagem. Regra 2 - A sua primeira mensagem deve ser OBRIGATÓRIAMENTE perguntando o nome do cliente, antes de todos procedimentos e perguntas. Regra 3- Caso o cliente se negue a informar o nome, não insista, prossiga com atendimento. Regra 4 - Não responda a perguntas de outros temas que não sejam relacionadas ao feedback da clinica. Regra 5- No máximo uma pergunta por mensagem. Regra 6- Seja sempre gentil. Regra 7 - Sua função é somente feedback, você não faz agendamentos nem nada mais."
                        

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
                    "Authorization": `Bearer ${process.env.GKEY}`,
                    "Content-Type": "application/json"
                }
            }




        )
        console.log("TEXTE XP Mensagem a salvar no Redis:", { mensagem, xp });

        //salva no historico
        await redis.rpush(`chat:${id}`, JSON.stringify({
            role: "user", content: mensagem,
            hora: Date.now(), xp: xp
        }))

        await redis.expire(`chat:${id}`, 60 * 30)
        await redis.expire(`chat:${id}`, 60 * 30)
        await redis.del(`chat:${id}:salvo`)
        await redis.ltrim(`chat:${id}`, -50, -1)

        const botmensagem = resposta.data.choices[0].message.content
        await redis.rpush(`chat:${id}`, JSON.stringify({ role: "assistant", content: botmensagem, hora: Date.now() }))

        await redis.expire(`chat:${id}`, 60 * 30)
        await redis.expire(`chat:${id}:salvo`, 60 * 30)
        await redis.ltrim(`chat:${id}`, -50, -1)


        return res.json({ resposta: botmensagem })

    }

    catch (err) {
        console.error(err.response?.data || err.message)
        res.status(500).json({ erro: "Falha externa API" })
    }
})





//cria tabela caso não exista
app.get('/criatabela', (req, res) => {
    const comando = "CREATE TABLE IF NOT EXISTS " + tbnome + " (id INT AUTO_INCREMENT PRIMARY KEY, chatid VARCHAR(50) NOT NULL, xp VARCHAR(5) NOT NULL, conversa JSON NOT NULL, criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"

    //query é usado para comandos SQL
    db.query(comando, (erro, resultado) => {
        if (erro) return res.status(500).send(erro)
        res.send('Tabela criada com sucesso')
    })
})


//cadastra itens
app.post('/cadastrar', (req, res) => {
    const { chatid, conversa, xp} = req.body
    //o interrogação são placeholders de segurança
    const comando = 'INSERT INTO ' + tbnome + ' (chatid, conversa, xp) VALUES (?,?,?)'

    if (!conversa || Object.keys(conversa).length === 0) {
        return res.status(400).json({ "msg": "conversa obrigatória" })
    }
    if (!xp || xp.trim() === "") {
        return res.status(400).json({ "msg": "xp obrigatório" })
    }
     if (!chatid || chatid.trim() === "") {
        return res.status(400).json({ "msg": "chatid obrigatório" })
    }


    db.query(comando, [chatid, conversa, xp], (erro, resultado) => {

        if (erro) {

            return res.status(500).send(erro)
        }


        res.send({ id: resultado.insertId, chatid, xp, conversa})
    })
})


//busca por todos campos dos itens
app.get('/busca', (req, res) => {
    db.query('SELECT * FROM ' + tbnome, (err, result) => {
        if (err) return res.status(500).json({ "erro": err })
        res.status(200).json({ "msg": result })
    })
})




//deletar
app.delete('/deletar/:id', (req, res) => {
    const { id } = req.params
    const comando = 'DELETE FROM ' + tbnome + ' WHERE id = ?'
    db.query(comando, [id], (err, result) => {
        if (err) return res.status(500).send(err)
        if (result.affectedRows === 0) return res.status(404).json({ "msg": "não encontrado" })
        res.status(200).json({ "msg": `deletado id ${id}` })
    })
})

app.listen(PORT, () => { console.log("Servidor rodando", PORT) })

