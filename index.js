/**
 * Servidor Principal
 *
 * @description Este é o arquivo de entrada da aplicação. Ele configura o
 * servidor Express, define middlewares essenciais como CORS e
 * centraliza a gestão de todas as rotas da API.
 */

// Importa os módulos necessários
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

// Importa os arquivos de rotas
const authRoutes = require('./routes/auth');
const weddingRoutes = require('./routes/weddings');
const guestRoutes = require('./routes/guests');
const publicRoutes = require('./routes/public');
const vendorRoutes = require('./routes/vendors');
const budgetRoutes = require('./routes/budget');
const teamRoutes = require('./routes/team');
const userRoutes = require('./routes/users'); // Importa a nova rota de usuários

/**
 * Configuração e Middlewares do Servidor
 *
 * @description Configurações globais para a aplicação Express.
 */

const app = express();

// Configuração específica do CORS para permitir requisições do frontend
const corsOptions = {
	origin: process.env.FRONTEND_URL || 'http://localhost:5173', // Permite apenas pedidos vindos do seu frontend
	credentials: true, // Permite o envio de cookies e outros cabeçalhos de credenciais
};

// Aplica os middlewares na ordem correta
app.use(cors(corsOptions));
app.use(express.json()); // Habilita o parsing de JSON no corpo das requisições
app.use(cookieParser()); // Habilita o parsing de cookies

/**
 * Gestão de Rotas
 *
 * @description Associa cada arquivo de rota a um prefixo de URL.
 */

app.use('/api/auth', authRoutes);
app.use('/api/weddings', weddingRoutes);
app.use('/api/guests', guestRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/users', userRoutes); // Registra a nova rota de usuários

// Rota de teste para verificar se a API está online
app.get('/', (req, res) => {
	res.send('API do Mariage funcionando!');
});

/**
 * Inicialização do Servidor
 *
 * @description Inicia o servidor e o faz ouvir na porta especificada.
 */

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
	console.log(`Servidor rodando na porta ${PORT}`);
});