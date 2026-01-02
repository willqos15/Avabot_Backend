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

// setInterval( async ()=>{

//     try{
//     const chats = await redis.keys('chat:*')

//     for (const chave of chats) {
//         const data = await redis.lrange(chave, 0,-1)
//         if (!data || data.length === 0) continue

//         const message = data.map(x=> JSON.parse(x))
//         const ultimahora = message[message.length -1]?.hora || Date.now()

//         if (Date.now() - ultimahora > inatividade){

//         const conversaJSON = JSON.stringify(message)

//         await db.query(
//             `INSERT INTO ${tbnome} (chatid,conversa) VALUES (?,?)`, [chave, conversaJSON]
//         )}

        
//     }
//     } catch(err){
//         console.error("erro no timer de inatividade", err)

//     }
// }
//     , intervalo)

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
    const { mensagem, id } = req.body
    if (typeof mensagem !== "string" || !mensagem.trim())
         return res.status(400).json({ "msg": "Nenhuma mensagem enviada" })
    if(typeof id !=="string" || !id.trim()) return res.status(400).json({ "msg": "Nenhum ID enviado" })


    try {
        //lrange(chave, inicio, fim) o -1 significa ultimo item da lista
        const leitura = await redis.lrange(`chat:${id}`, -10, -1)
        const mapleitura = leitura.map(x=> JSON.parse(x))
        
        const history = mapleitura.filter(x=> x.role && x.content).map(x=> ({
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
                        content: "Você é uma atendende de clinica Mais Saúde, seu nome é Ana, você é gentil e age de maneira natural usando apenas 1 emoji por mensagem, podendo. você atende com felicidade e respeito e amor, ternura, você é feito exclusivamente para assuntos da clinica, caso o assunto mude diga educamanete que não pode ajudar. aja sem parece IA, mande mensagens diretas e curtas de preferencia. com linguagem acessivel, informal mal respeitosa. e você vai fazer a avaliação de como foi a experiência na clinica, pergunte o nome da pessoa, se ela tem uma sugestão ou critica, para ela avaliar, e ao final na mensagem faça um resumo em json nesse modelo {tipo: sugestao, mensagem: 'melhor ambiente'} para ser exibido no final de toda mensagem"
                    },
                    ...history,
                    {
                        role: "user",
                        content: mensagem
                    }

                ]},
                {   
                headers: {
                    "Authorization": `Bearer ${process.env.GKEY}`,
                    "Content-Type": "application/json"
                }
                }
            



        )
        //salva no historico
        await redis.rpush(`chat:${id}`, JSON.stringify({role: "user" ,content: mensagem,
        hora: Date.now()
         }))
        await redis.ltrim(`chat:${id}`, -50,-1)

        const botmensagem = resposta.data.choices[0].message.content
        await redis.rpush(`chat:${id}`, JSON.stringify({role: "assistant" ,content: botmensagem, hora: Date.now() }))
         await redis.ltrim(`chat:${id}`, -50,-1)
        

        return res.json({resposta: botmensagem})
        
    }

    catch (err) {
        console.error(err.response?.data || err.message)
        res.status(500).json({ erro: "Falha externa API" })
    }
})





//cria tabela caso não exista
app.get('/criatabela', (req, res) => {
    const comando = "CREATE TABLE IF NOT EXISTS " + tbnome + " (id INT AUTO_INCREMENT PRIMARY KEY, chatid VARCHAR(50) NOT NULL, conversa JSON NOT NULL, criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"

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
            console.log(erro)
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