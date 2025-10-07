/**
 * Rota de Autenticação
 *
 * @description Este arquivo gerencia todas as rotas relacionadas à autenticação
 * de usuários. Isso inclui registro, login, logout, atualização de tokens e
 * recuperação de senha, com validação de entradas, rate limiting e
 * conformidade com a LGPD.
 */

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const SALT_ROUNDS = 10;

// Cria um "limitador" para proteger contra ataques de força bruta em rotas sensíveis.
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // Janela de 15 minutos
	max: 10, // Permite 10 requisições por IP nesta janela
	message: 'Muitas tentativas a partir deste IP. Por favor, tente novamente após 15 minutos.',
	standardHeaders: true,
	legacyHeaders: false,
});


/**
 * Rota para registro de usuário.
 *
 * @route POST /api/auth/register
 * @description Cria um novo usuário, mas não o ativa imediatamente.
 * Em vez disso, gera um código de verificação e envia um e-mail para o usuário.
 * @access Público
 */
router.post('/register',
    // Regras de validação e sanitização para os dados de entrada.
    body('name', 'O nome é obrigatório e deve ser um texto válido.').notEmpty().trim().escape(),
    // --- ALTERAÇÃO AQUI ---
    // Adicionamos a opção para impedir que a normalização remova os pontos de e-mails do Gmail.
    body('email', 'Por favor, insira um e-mail válido.').isEmail().normalizeEmail({ gmail_remove_dots: false }),
    body('password', 'A senha deve ter no mínimo 8 caracteres, incluindo uma letra maiúscula, uma minúscula, um número e um caractere especial.')
        .isStrongPassword({
            minLength: 8,
            minLowercase: 1,
            minUppercase: 1,
            minNumbers: 1,
            minSymbols: 1
        }),
    body('consent', 'Você deve aceitar os termos de serviço para criar uma conta.').equals('true'),
    async (req, res) => {
        // Verifica o resultado da validação.
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

	try {
		const { name, email, password } = req.body;

		// Procura se já existe um usuário com o mesmo e-mail no banco de dados.
		const userExists = await db.query('SELECT * FROM users WHERE email = $1', [email]);
		if (userExists.rows.length > 0) {
			// Se o usuário existir mas a conta não foi verificada, apaga a conta antiga para que uma nova possa ser criada.
			if (!userExists.rows[0].is_verified) {
				await db.query('DELETE FROM users WHERE email = $1', [email]);
			} else {
				// Se a conta já existe e está verificada, informa que o e-mail já está em uso.
				return res.status(409).json({ error: 'Este e-mail já está em uso.' });
			}
		}

		// Cria o hash da senha do usuário para que ela não seja armazenada em texto puro.
		const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

		// Gera um token de verificação de 6 dígitos aleatórios.
		const verification_token = crypto.randomInt(100000, 999999).toString();

		// Define a data de expiração do token de verificação para 15 minutos no futuro.
		const verification_token_expires_at = new Date(Date.now() + 15 * 60 * 1000);

		// Insere o novo usuário no banco de dados.
		const newUser = await db.query(
			`INSERT INTO users (name, email, password_hash, verification_token, verification_token_expires_at) 
			VALUES ($1, $2, $3, $4, $5) RETURNING user_id, email, name`,
			[name, email, password_hash, verification_token, verification_token_expires_at]
		);

		// Envia o e-mail de verificação para o usuário.
		await sendVerificationEmail(email, verification_token);

		// Envia a resposta de sucesso.
		res.status(201).json({ email: newUser.rows[0].email });
	} catch (error) {
		// Loga o erro no console para depuração.
		console.error(error.message);
		// Envia uma resposta de erro genérica ao cliente.
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para login de usuário.
 *
 * @route POST /api/auth/login
 * @description Autentica um usuário e retorna dois tokens: um de acesso de
 * curta duração e um de atualização de longa duração.
 * @access Público
 */
router.post('/login', authLimiter, async (req, res) => {
	try {
		const { email, password } = req.body;

		// Busca o usuário no banco de dados pelo e-mail.
		const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
		if (result.rows.length === 0) {
			return res.status(401).json({ error: 'Credenciais inválidas.' });
		}
		const user = result.rows[0];

		// Verifica se o usuário já verificou sua conta.
		if (!user.is_verified) {
			return res.status(403).json({ error: 'A sua conta ainda não foi verificada.' });
		}

		// Compara a senha digitada com o hash da senha no banco de dados.
		const isPasswordValid = await bcrypt.compare(password, user.password_hash);
		if (!isPasswordValid) {
			return res.status(401).json({ error: 'Credenciais inválidas.' });
		}

		// Gera o Access Token, que será usado para acessar rotas protegidas.
		const accessToken = jwt.sign({ userId: user.user_id, name: user.name }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: process.env.ACCESS_TOKEN_LIFE });
		
		// Gera o Refresh Token, que será usado para obter novos Access Tokens.
		const refreshToken = jwt.sign({ userId: user.user_id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: process.env.REFRESH_TOKEN_LIFE });
		
		// Define a data de expiração do Refresh Token (7 dias).
		const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // Antes de inserir um novo token, remove todos os refresh tokens antigos associados a este usuário.
        await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.user_id]);

		// Salva o NOVO Refresh Token no banco de dados para validá-lo depois.
		await db.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [user.user_id, refreshToken, expiresAt]);

		// Envia o Refresh Token em um cookie HttpOnly, mais seguro contra ataques XSS.
		res.cookie('refreshToken', refreshToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'strict',
			maxAge: 7 * 24 * 60 * 60 * 1000
		});

        // Apenas busca os convites pendentes, mas não os aceita.
        // Adicionamos informações sobre o casamento (groom_name, bride_name) para exibir no frontend.
		const pendingInvitationsResult = await db.query(
			`SELECT wi.*, w.groom_name, w.bride_name 
             FROM wedding_invitations wi
             JOIN weddings w ON wi.wedding_id = w.wedding_id
             WHERE wi.email = $1 AND wi.status = 'pending'`,
			[user.email]
		);

		// Retorna os dados do usuário e a lista de convites pendentes.
		res.json({ 
            accessToken, 
            userName: user.name,
            pendingInvitations: pendingInvitationsResult.rows 
        });

	} catch (error) {
		console.error("Erro no login:", error.message);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para atualizar o token de acesso.
 *
 * @route POST /api/auth/refresh-token
 * @description Cria um novo Access Token usando um Refresh Token válido.
 * @access Privado (requer um cookie com o Refresh Token)
 */
router.post('/refresh-token', async (req, res) => {
	const refreshToken = req.cookies.refreshToken;
	if (!refreshToken) {
		return res.status(401).json({ error: 'Refresh token não encontrado.' });
	}

	try {
		// Verifica se o Refresh Token existe no banco de dados.
		const tokenInDb = await db.query('SELECT * FROM refresh_tokens WHERE token = $1', [refreshToken]);
		if (tokenInDb.rows.length === 0) {
			return res.status(403).json({ error: 'Refresh token inválido.' });
		}

		// Verifica a validade do Refresh Token usando a chave secreta.
		const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

		// Busca os dados do usuário com base no ID decodificado do token.
		const userResult = await db.query('SELECT user_id, name FROM users WHERE user_id = $1', [decoded.userId]);
		if (userResult.rows.length === 0) {
			return res.status(403).json({ error: 'Utilizador não encontrado.' });
		}
		const user = userResult.rows[0];

		// Gera um novo Access Token.
		const accessToken = jwt.sign(
			{ userId: user.user_id, name: user.name },
			process.env.ACCESS_TOKEN_SECRET,
			{ expiresIn: process.env.ACCESS_TOKEN_LIFE }
		);

		// Retorna o novo Access Token.
		res.json({ accessToken });
	} catch (error) {
		console.error("Erro ao refrescar token:", error);
		return res.status(403).json({ error: 'Refresh token inválido ou expirado.' });
	}
});

/**
 * Rota para logout.
 *
 * @route POST /api/auth/logout
 * @description Remove o Refresh Token do banco de dados e do cookie, encerrando a sessão.
 * @access Privado
 */
router.post('/logout', async (req, res) => {
	const refreshToken = req.cookies.refreshToken;
	if (refreshToken) {
		// Remove o token do banco de dados.
		await db.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
	}
	// Limpa o cookie do navegador.
	res.clearCookie('refreshToken');
	res.status(200).json({ message: 'Logout bem-sucedido.' });
});

/**
 * Rota para verificação de e-mail.
 *
 * @route POST /api/auth/verify-email
 * @description Confirma o código de verificação enviado por e-mail, ativando a conta.
 * @access Público
 */
router.post('/verify-email', authLimiter, async (req, res) => {
	try {
		const { email, code } = req.body;

		// Verifica se o e-mail e o código foram fornecidos.
		if (!email || !code) {
			return res.status(400).json({ error: 'E-mail e código são obrigatórios.' });
		}

		// Busca o usuário pelo e-mail.
		const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Utilizador não encontrado.' });
		}
		const user = result.rows[0];

		// Verifica se a conta já está verificada.
		if (user.is_verified) {
			return res.status(400).json({ error: 'Este e-mail já foi verificado.' });
		}

		// Compara o código e verifica se ele ainda não expirou.
		if (user.verification_token !== code || new Date() > new Date(user.verification_token_expires_at)) {
			return res.status(400).json({ error: 'Código inválido ou expirado.' });
		}

		// Atualiza o usuário no banco de dados, marcando-o como verificado.
		await db.query("UPDATE users SET is_verified = true, verification_token = NULL, verification_token_expires_at = NULL WHERE user_id = $1", [user.user_id]);

		// Gera um novo Access Token para logar o usuário automaticamente após a verificação.
		const accessToken = jwt.sign({ userId: user.user_id, name: user.name }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: process.env.ACCESS_TOKEN_LIFE });

		// Gera e salva um novo Refresh Token.
		const refreshToken = jwt.sign({ userId: user.user_id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: process.env.REFRESH_TOKEN_LIFE });
		const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		await db.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [user.user_id, refreshToken, expiresAt]);
		
		// Define o cookie do Refresh Token.
		res.cookie('refreshToken', refreshToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'strict',
			maxAge: 7 * 24 * 60 * 60 * 1000
		});

        // Apenas busca os convites pendentes, mas não os aceita.
        const pendingInvitationsResult = await db.query(
			`SELECT wi.*, w.groom_name, w.bride_name 
             FROM wedding_invitations wi
             JOIN weddings w ON wi.wedding_id = w.wedding_id
             WHERE wi.email = $1 AND wi.status = 'pending'`,
			[user.email]
		);

		// Retorna os dados do usuário e a lista de convites pendentes.
		res.json({ 
            accessToken, 
            userName: user.name,
            pendingInvitations: pendingInvitationsResult.rows 
        });

	} catch (error) {
		console.error(error.message);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para solicitação de recuperação de senha.
 *
 * @route POST /api/auth/request-password-reset
 * @description Envia um código de recuperação para o e-mail do usuário.
 * @access Público
 */
router.post('/request-password-reset', authLimiter, async (req, res) => {
	try {
		const { email } = req.body;

		// Busca o usuário no banco de dados.
		const result = await db.query('SELECT * FROM users WHERE email = $1 AND is_verified = true', [email]);
		if (result.rows.length === 0) {
			// Responde de forma genérica para evitar que atacantes saibam quais e-mails estão cadastrados.
			return res.json({ message: 'Se um utilizador com este e-mail existir, um código de recuperação foi enviado.' });
		}
		const user = result.rows[0];

		// Gera um código de recuperação aleatório.
		const token = crypto.randomInt(100000, 999999).toString();
		// Define a data de expiração para 15 minutos.
		const expires_at = new Date(Date.now() + 15 * 60 * 1000);

		// Salva o token de recuperação no banco de dados.
		await db.query(
			'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
			[user.user_id, token, expires_at]
		);

		// Envia o e-mail com o código.
		await sendPasswordResetEmail(email, token);

		// Resposta genérica para o cliente.
		res.json({ message: 'Se um utilizador com este e-mail existir, um código de recuperação foi enviado.' });
	} catch (error) {
		console.error("Erro ao solicitar recuperação de senha:", error);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para redefinir a senha.
 *
 * @route POST /api/auth/reset-password
 * @description Valida o código de recuperação e atualiza a senha do usuário.
 * @access Público
 */
router.post('/reset-password', authLimiter, async (req, res) => {
	try {
		const { email, code, password } = req.body;

		// Verifica se todos os campos estão presentes.
		if (!email || !code || !password) {
			return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
		}

		// Busca o token de recuperação e o usuário associado.
		const tokenResult = await db.query(
			`SELECT prt.*, u.user_id FROM password_reset_tokens prt
			JOIN users u ON prt.user_id = u.user_id
			WHERE u.email = $1 AND prt.token = $2`,
			[email, code]
		);
		if (tokenResult.rows.length === 0) {
			return res.status(400).json({ error: 'Código inválido.' });
		}
		const tokenData = tokenResult.rows[0];

		// Verifica se o token expirou.
		if (new Date() > new Date(tokenData.expires_at)) {
			return res.status(400).json({ error: 'Código expirado.' });
		}

		// Cria o hash da nova senha.
		const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

		// Atualiza a senha do usuário no banco de dados.
		await db.query(
			'UPDATE users SET password_hash = $1 WHERE user_id = $2',
			[password_hash, tokenData.user_id]
		);

		// Remove o token de recuperação, pois ele já foi usado.
		await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [tokenData.user_id]);

		// Resposta de sucesso.
		res.json({ success: true, message: 'Senha redefinida com sucesso!' });
	} catch (error) {
		console.error("Erro ao redefinir a senha:", error);
		res.status(500).send('Erro no servidor');
	}
});

module.exports = router;