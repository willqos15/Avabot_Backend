const mysql = require('mysql2')
require('dotenv').config()

const conexao = mysql.createConnection(
    {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
    }
)

//.connect se a conexão der certo retorna null, se não exibe erro
conexao.connect(err => {
    if (err) {
        console.error("Erro ao conectar no Mysql", err)
        return
    }
    console.log("Conectado!")
})

module.exports = conexao
