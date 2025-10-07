/**
 *  Middleware de Autenticação JWT
 * @description Este middleware protege as rotas da API, garantindo que apenas pedidos
 * com um Access Token JWT válido possam prosseguir. Ele extrai o token do
 * cabeçalho 'Authorization', verifica a sua assinatura e validade, e anexa os
 * dados do utilizador decodificados ao objeto da requisição (req.user).
 */

const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
	const authHeader = req.headers['authorization'];
	const token = authHeader && authHeader.split(' ')[1];

	if (!token) {
		return res.status(401).json({ error: 'Acesso negado. Nenhum token fornecido.' });
	}

	try {
		const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
		req.user = decoded; 
		next();
	} catch (error) {
		// Retorna 401 para que o interceptor do frontend possa tentar usar o refresh token.
		res.status(401).json({ error: 'Token inválido ou expirado.' });
	}
};

module.exports = authMiddleware;