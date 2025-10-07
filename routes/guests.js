/**
 * Rota de Convidados
 *
 * @description Este arquivo gerencia todas as operações (CRUD) relacionadas aos
 * convidados de um casamento. As rotas são protegidas e requerem níveis de
 * permissão de acesso ou edição.
 */

// Importa os módulos necessários
const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();

// Aplica o middleware de autenticação a todas as rotas deste arquivo.
router.use(authMiddleware);

// ---

/**
 * Middlewares de Permissão
 *
 * @description Funções que validam o nível de acesso do usuário.
 */

/**
 * Verifica se o usuário tem permissão para acessar (visualizar) os dados de um casamento.
 *
 * @param {object} req - O objeto da requisição.
 * @param {object} res - O objeto da resposta.
 * @param {function} next - A função para continuar para a próxima etapa.
 * @returns {void}
 */
const canAccessWedding = async (req, res, next) => {
	try {
		const weddingId = req.params.weddingId;
		const userId = req.user.userId;

		// Busca a permissão do usuário para o casamento especificado.
		const permission = await db.query(
			"SELECT 1 FROM wedding_users WHERE user_id = $1 AND wedding_id = $2",
			[userId, weddingId]
		);

		// Se o usuário não estiver na lista de permissões, nega o acesso.
		if (permission.rows.length === 0) {
			return res.status(403).json({ error: "Não tem permissão para aceder aos dados deste casamento." });
		}

		next();
	} catch (error) {
		res.status(500).send('Erro no servidor');
	}
};

/**
 * Verifica se o usuário tem permissão de 'edição' para um casamento.
 *
 * @param {object} req - O objeto da requisição.
 * @param {object} res - O objeto da resposta.
 * @param {function} next - A função para continuar para a próxima etapa.
 * @returns {void}
 */
const canEditWedding = async (req, res, next) => {
	try {
		// Pega o ID do casamento dos parâmetros da URL ou do corpo da requisição.
		const weddingId = req.params.weddingId || req.body.wedding_id;
		const userId = req.user.userId;

		// Busca a permissão do usuário, verificando se o nível é 'edit'.
		const permission = await db.query(
			"SELECT 1 FROM wedding_users WHERE user_id = $1 AND wedding_id = $2 AND permission_level = 'edit'",
			[userId, weddingId]
		);

		if (permission.rows.length === 0) {
			return res.status(403).json({ error: "Não tem permissão para editar dados neste casamento." });
		}

		next();
	} catch (error) {
		res.status(500).send('Erro no servidor');
	}
};

// ---

/**
 * Rotas CRUD para Convidados
 *
 * @description Endpoints para gerenciar a lista de convidados.
 */

/**
 * Rota para listar todos os convidados de um casamento.
 *
 * @route GET /api/guests/wedding/:weddingId
 * @access Privado (requer acesso ao casamento)
 */
router.get('/wedding/:weddingId', canAccessWedding, async (req, res) => {
	try {
		const { weddingId } = req.params;
		// Busca todos os convidados associados ao ID do casamento.
		const guests = await db.query("SELECT * FROM guests WHERE wedding_id = $1 ORDER BY full_name", [weddingId]);
		res.json(guests.rows);
	} catch (error) {
		console.error("Erro ao listar convidados:", error);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para adicionar um novo convidado.
 *
 * @route POST /api/guests/wedding/:weddingId
 * @access Privado (requer permissão de edição)
 */
router.post('/wedding/:weddingId', canEditWedding, async (req, res) => {
	try {
		const { weddingId } = req.params;
		const { full_name, contact_info, guest_group } = req.body;
		const created_by = req.user.userId;

		// Insere o novo convidado no banco de dados.
		const newGuest = await db.query(
			"INSERT INTO guests (wedding_id, full_name, contact_info, guest_group, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
			[weddingId, full_name, contact_info, guest_group, created_by]
		);
		res.status(201).json(newGuest.rows[0]);
	} catch (error) {
		console.error("Erro ao adicionar convidado:", error);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para atualizar um convidado.
 *
 * @route PUT /api/guests/:guestId
 * @access Privado (requer permissão de edição)
 */
router.put('/:guestId', async (req, res) => {
	try {
		const { guestId } = req.params;
		const userId = req.user.userId;
		const { full_name, contact_info, guest_group, rsvp_status } = req.body;

		// Verifica se o usuário tem permissão de edição para o casamento do convidado.
		const permission = await db.query(
			`SELECT 1 FROM guests g JOIN wedding_users wu ON g.wedding_id = wu.wedding_id WHERE g.guest_id = $1 AND wu.user_id = $2 AND wu.permission_level = 'edit'`,
			[guestId, userId]
		);
		if (permission.rows.length === 0) {
			return res.status(403).json({ error: "Não tem permissão para editar este convidado." });
		}

		// Atualiza os dados do convidado.
		const updatedGuest = await db.query(
			"UPDATE guests SET full_name = $1, contact_info = $2, guest_group = $3, rsvp_status = $4 WHERE guest_id = $5 RETURNING *",
			[full_name, contact_info, guest_group, rsvp_status, guestId]
		);
		res.json(updatedGuest.rows[0]);
	} catch (error) {
		console.error("Erro ao atualizar convidado:", error);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para remover um convidado.
 *
 * @route DELETE /api/guests/:guestId
 * @access Privado (requer permissão de edição)
 */
router.delete('/:guestId', async (req, res) => {
	try {
		const { guestId } = req.params;
		const userId = req.user.userId;

		// Verifica se o usuário tem permissão para apagar este convidado.
		const permission = await db.query(
			`SELECT 1 FROM guests g JOIN wedding_users wu ON g.wedding_id = wu.wedding_id WHERE g.guest_id = $1 AND wu.user_id = $2 AND wu.permission_level = 'edit'`,
			[guestId, userId]
		);
		if (permission.rows.length === 0) {
			return res.status(403).json({ error: "Não tem permissão para apagar este convidado." });
		}
		
		// Deleta o convidado do banco de dados.
		await db.query("DELETE FROM guests WHERE guest_id = $1", [guestId]);
		res.status(204).send();
	} catch (error) {
		console.error("Erro ao apagar convidado:", error);
		res.status(500).send('Erro no servidor');
	}
});

// ---

/**
 * Rota para Estatísticas de RSVP
 *
 * @description Endpoint que retorna a contagem de convidados por status de RSVP.
 */

/**
 * Rota para buscar estatísticas de RSVP de um casamento.
 *
 * @route GET /api/guests/stats/wedding/:weddingId
 * @access Privado (requer acesso ao casamento)
 */
router.get('/stats/wedding/:weddingId', canAccessWedding, async (req, res) => {
	try {
		const { weddingId } = req.params;
		
		// A consulta SQL para calcular as estatísticas de RSVP.
		const statsQuery = `
			SELECT
				COUNT(*) AS total_guests,
				COUNT(CASE WHEN rsvp_status = 'confirmed' THEN 1 END) AS confirmed,
				COUNT(CASE WHEN rsvp_status = 'declined' THEN 1 END) AS declined,
				COUNT(CASE WHEN rsvp_status = 'pending' OR rsvp_status IS NULL THEN 1 END) AS pending
			FROM guests
			WHERE wedding_id = $1;
		`;

		const statsResult = await db.query(statsQuery, [weddingId]);
		res.json(statsResult.rows[0]);
	} catch (error) {
		console.error("Erro ao buscar estatísticas de RSVP:", error.message);
		res.status(500).send('Erro no servidor');
	}
});

module.exports = router;