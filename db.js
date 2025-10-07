/**
 * Conexão Centralizada com o Banco de Dados
 *
 * @description Este arquivo estabelece e gerencia a conexão com o banco de
 * dados PostgreSQL, utilizando um pool de conexões. Isso garante que a
 * aplicação não precise criar uma nova conexão para cada requisição,
 * melhorando a performance e a eficiência.
 */

// Importa a classe Pool do módulo 'pg'.
const { Pool } = require('pg');
// Carrega as variáveis de ambiente do arquivo .env.
require('dotenv').config();

/**
 * Cria uma nova instância de Pool de conexões.
 *
 * @description Configura a conexão do pool com as variáveis de ambiente.
 * Isso permite que as credenciais do banco de dados fiquem seguras e
 * fora do código-fonte.
 */
const pool = new Pool({
	user: process.env.DB_USER,
	host: process.env.DB_HOST,
	database: process.env.DB_DATABASE,
	password: process.env.DB_PASSWORD,
	port: process.env.DB_PORT,
    // Exige que a conexão com o banco de dados seja feita usando SSL/TLS.
    // `rejectUnauthorized: false` é necessário para ambientes de nuvem como a Render.
    ssl: { rejectUnauthorized: false },
});

/**
 * Middleware para capturar erros de conexão.
 *
 * @description Este evento é disparado se um cliente inativo for removido do pool
 * devido a um erro de conexão. Isso ajuda a monitorar problemas de conexão.
 */
pool.on('error', (err) => {
	console.error('Erro inesperado no cliente ocioso do pool de banco de dados:', err);
	// Opcionalmente, pode-se decidir encerrar o processo aqui se o erro for fatal.
	// process.exit(-1);
});

/**
 * Exporta a funcionalidade de consulta.
 *
 * @description Fornece uma interface simples para executar consultas SQL.
 * A função `pool.query()` gerencia automaticamente a obtenção e o retorno
 * de uma conexão do pool.
 * @example
 * // Exemplo de uso:
 * const result = await db.query('SELECT * FROM users WHERE user_id = $1', [userId]);
 */
module.exports = {
	query: (text, params) => {
		// Loga a consulta apenas em ambiente de desenvolvimento para evitar vazar dados em produção.
		if (process.env.NODE_ENV !== 'production') {
			console.log('Consulta SQL executada:', { text, params });
		}
		return pool.query(text, params);
	},
};