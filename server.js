require('dotenv').config()
const express = require('express')
const cors = require ('cors')
const app = express()
app.use(express.json())
const db = require('./db')
const PORT = process.env.PORT || 3000

const tbnome = 'registros'

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

//cria tabela caso não exista
app.get('/criatabela', (req, res) => {
    const comando = "CREATE TABLE IF NOT EXISTS "+tbnome+" (id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(100), contato VARCHAR(15), tipo ENUM('reclamacao','sugestao')NOT NULL, descricao TEXT NOT NULL, criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"

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
    const comando = 'INSERT INTO '+tbnome+' (nome, contato, tipo, descricao) VALUES (?,?,?,?)'

    db.query(comando, [nome, contato, tipo, descricao], (erro, resultado) => {

        if (erro) {
            console.log(erro)
            return res.status(500).send(erro)
        }

        if(!descricao || descricao.trim()===""){
            return res.status(400).json({"msg":"Descrição obrigatória"})
        }
        if(!tipo || tipo.trim()===""){
            return res.status(400).json({"msg":"Tipo obrigatório"})
        }
        res.send({ id: resultado.insertId, nome, contato, tipo, descricao })
    })
})


//busca por todos campos dos itens
app.get('/busca', (req, res) => {
    db.query('SELECT * FROM '+tbnome, (err, result) => {
        if (err) return res.status(500).json({ "erro": err })
        res.status(200).json({ "msg": result })
    })
})

//busca por todos os nomes
app.get('/tipo', (req, res) => {
    db.query('SELECT tipo FROM '+tbnome, (err, result) => {
        if (err) return res.status(500).json({ "erro": err })
        res.status(200).json({ "msg": result })
    })
})


//deletar
app.delete('/deletar/:id', (req, res) => {
    const { id } = req.params
    const comando = 'DELETE FROM '+tbnome+' WHERE id = ?'
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
    const comando = 'UPDATE '+tbnome+' SET nome= ?, contato = ?, tipo=?, descricao=? WHERE id = ?'
    db.query(comando, [nome, contato, tipo, descricao, id], (err, result) => {
        if (err) return res.status(500).send(err)
        if (result.affectedRows === 0) return res.status(404).json({ "msg": "não encontrado" })
        res.status(200).json({ "msg": `atualizado id ${id}` })
    })
})