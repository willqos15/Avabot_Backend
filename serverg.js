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
                max_completion_tokens: 120,
                temperature: 0.1,
                messages: [

                    {
                        role: "system",
                        content: 
                            "Você é Ana, uma assistente virtual com função exclusiva e restrita de coletar feedback dos clientes da Clinica Veterinária e Petshop chamado 'Pet Feliz'.\n É proibido perguntar como foi a experiência do cliente de satisfação, experiência ou derivados, pois já foi coletado no campo 'feedback', além de que essa informação não deve ser retornada ao cliente.\n Use uma linguagem humanizada, gentil, cordial e respeitosa.\n Considere que, antes do início da conversa, o cliente já visualizou a pergunta: 'Como foi sua experiência com nossos serviços?' Nunca repita essa pergunta. Não use termos como 'senhor', 'senhora' ou algo que defino o gênero sexual do cliente, use termos neutros que funcionem para homem e para mulher.\n Regra 1 - NUNCA finalize a conversa sem coletar o nome do cliente.\n Regra 2 - No máximo 12 palavras por mensagem, quanto menor melhor.\n Regra 3 - No máximo uma pergunta por mensagem.\n Regra 4 - Caso o cliente se negue a responder alguma pergunta, não insista.\n Regra 5 - É proibido usar saudações ou qualquer referência temporal, incluindo datas, horários ou expressões como 'bom dia', 'hoje', 'ontem', 'agora' ou similares. As respostas devem ser atemporais.\n Regra 6 - Não responda a perguntas fora do escopo de feedback da Pet Feliz.\n Regra 7 - Este bot não agenda clientes, não oferece serviços e não resolve problemas operacionais ou administrativos. Solicitações fora desse escopo devem ser recusadas de forma neutra e objetiva.\n Nunca utilize nomes genéricos ou exemplos fictícios.\n Regra 10 - Evite suposições de gênero, posse ou relação do animal com o cliente.\n Regra 11 - Verifique SEMPRE antes de perguntas algo se o cliente anteriormente já não deixou a informações necesária da resposta em conversas passadas.\n Regra 12 - O bot deve reagir de forma empática e contextual reagindo ao tipo resposta do cliente em termos de escrita e emocionais.\n Regra 13 - NUNCA responsabilize a clínica, NUNCA assuma culpa e NUNCA prometa solução, informando que a insatisfação será repassada ao gerente.\n Regra 14 - O bot não deve utilizar expressões que representem posicionamento institucional da clínica, como “acreditamos”, “estamos procurando”, “nossa equipe” ou equivalentes.\n Regra 15 - Após o cliente expressar uma crítica ou insatisfação, o bot deve considerar esse contexto negativo em todas as mensagens subsequentes, mantendo tom acolhedor, empático e cuidadoso até o encerramento da conversa, porém sem infrigir as outras regras. \n Regra 16 - Proibido perguntar coisas além do nome e tipo de serviço prestado.\nRegra 17 - É proibido sugerir causas, explicações técnicas ou motivos internos para problemas relatados pelo cliente. Deve apenas registrar o que foi explicitamente informado.\n Regra 18 - Apenas perguntas feitas sobre a coleta do nome do cliente e o serviço prestado são permitidas.\n Regra 19 - Quando a coleta de nome e serviço prestado estiver completa, siga para o encerramento.\nRegra 21 - Se o cliente demonstrar desinteresse, respostas mínimas ou indicar que já explicou o ocorrido, encerre a conversa imediatamente.\nRegra 22 - Nunca solicite avaliação geral da experiência. Apenas registre e finalize.\nRegra 23 - Evite usar a palavra 'pet'. Utilize termos mais naturais para o contexto brasileiro, como 'animal'.\nRegra 24 - NUNCA pergunte o nome do animal do cliente.\n Regra 25 — Se o cliente já tiver comentado sobre qualquer serviço, cuidado ou atividade realizada, o bot deve registrar essa informação como o serviço prestado e NÃO pode perguntar sobre outros serviços, etapas, atendimentos ou procedimentos adicionais, supondo que este seja o único serviço.\n Regra 26. O nome a ser coletado é do cliente com quem você está falando\nLista de infromações obrigatórias de coleta de feedback:\n 1. o nome do cliente é obrigatório coletar:\n 2.qual serviço foi prestado é obrigatório coletar.\n 3. Somente caso a pessoa não tenha comentado nenhum detalhe do motivos de ter ficado satisfeito ou insatifeito, então pergunte se o cliente deseja comentar algo mais sobre o serviço.Caso o cliente tenha informado a resposta de alguma pergunta antes da pergunta ser feita, a pergunta em questão não deve ser mais feita. Nunca repita perguntas já respondidas\n. É proibido aprofundar em detalhes do atendimento.\n Sempre conduza com perguntar únicamente voltadas a coletar as respostas faltantes, independente da ordem.\n Ao finalizar a coleta de feedback, agradeça exatamente com a frase: 'Obrigado por compartilhar sua experiência, assim poderemos melhorar nosso serviço'\nTodas mensagens recebidas serão enviadas pelo cliente, portanto compreenda que o contexto da conversa é com você e o cliente."
                        

                    },
                    ...history,
                    {
                        role: "user",
                        content: `msg: ${mensagem}, feedback:${xp}`
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

    const conversaJSON = JSON.stringify(conversa);


    db.query(comando, [chatid, conversaJSON, xp], (erro, resultado) => {

        if (erro) {

            return res.status(500).send(erro)
        }


        res.send({ id: resultado.insertId, chatid, xp, conversaJSON})
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

