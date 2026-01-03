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




// EXEMPLO DE OBJETO
// {
//   "nome": "João",
//   "contato": "55 93 9 4002-8922",
//   "tipo": "reclamacao"
//   "descricao": "Atendimento ruim, demorou 2 horas e o local não tinha café"
// }

app.use(cors({
    origin: 'http://localhost:5173'
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
                        content: {
                            "Você é Ana, assistente virtual da clínica Pet Feliz, especializada em coletar feedback de clientes de forma profissional, cordial e eficiente. Fique ciente que o cliente já entrou na conversa com intuíto de dar um feedback, Seu objetivo é conduzir a conversa de maneira estruturada e gentil, garantindo que todas as informações relevantes sobre o atendimento sejam registradas. Você deve sempre:\n1. Perguntar o nome do cliente e usar o nome durante a conversa.\n2. Avaliar a experiência com os atendentes: simpatia, atenção e cordialidade.\n3. Avaliar como o cliente percebeu o cuidado e bem-estar do seu pet durante o atendimento.\n4. Agradecer por compartilhar a experiência, reforçando que ele ajuda a melhorar o serviço, e se despedir de forma cordial e calorosa.\nRegras importantes:\n- Seja sempre gentil, cordial e profissional e evite ser verborrágico demais.\n- Não ofereça informações ou respostas fora do contexto de coleta de feedback.\n- Faça uma pergunta por vez, aguardando a resposta do cliente antes de seguir para a próxima.\n- Use um tom acolhedor, amigável e positivo, transmitindo confiança e atenção.\n- Ao final, finalize a conversa com um agradecimento personalizado usando o nome do cliente.\n\nExemplo de fluxo inicial que deve seguir:\n1. 'Entendi! Antes de começarmos, posso saber seu nome, por favor?''\n2. 'Ótimo! E como você acha que seu pet foi tratado durante o atendimento?'\n3. 'Muito obrigada por compartilhar sua experiência! Ela nos ajuda a cuidar cada vez melhor dos nossos amigos de quatro patas 🐾. Tenha um ótimo dia!'\nSempre mantenha consistência, clareza e profissionalismo, guiando o cliente até o final do feedback."
                        }

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
    const { nome, contato, tipo, descricao } = req.body
    //o interrogação são placeholders de segurança
    const comando = 'INSERT INTO ' + tbnome + ' (nome, contato, tipo, descricao) VALUES (?,?,?,?)'

    if (!descricao || descricao.trim() === "") {
        return res.status(400).json({ "msg": "Descrição obrigatória" })
    }
    if (!tipo || tipo.trim() === "") {
        return res.status(400).json({ "msg": "Tipo obrigatório" })
    }

    db.query(comando, [nome, contato, tipo, descricao], (erro, resultado) => {

        if (erro) {

            return res.status(500).send(erro)
        }


        res.send({ id: resultado.insertId, nome, contato, tipo, descricao })
    })
})


//busca por todos campos dos itens
app.get('/busca', (req, res) => {
    db.query('SELECT * FROM ' + tbnome, (err, result) => {
        if (err) return res.status(500).json({ "erro": err })
        res.status(200).json({ "msg": result })
    })
})

//busca por todos os nomes
app.get('/tipo', (req, res) => {
    db.query('SELECT tipo FROM ' + tbnome, (err, result) => {
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

//atualizar
app.put('/atualizar/:id', (req, res) => {
    const { id } = req.params
    const { nome, contato, tipo, descricao } = req.body
    const comando = 'UPDATE ' + tbnome + ' SET nome= ?, contato = ?, tipo=?, descricao=? WHERE id = ?'
    db.query(comando, [nome, contato, tipo, descricao, id], (err, result) => {
        if (err) return res.status(500).send(err)
        if (result.affectedRows === 0) return res.status(404).json({ "msg": "não encontrado" })
        res.status(200).json({ "msg": `atualizado id ${id}` })
    })
})