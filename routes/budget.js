/**
 * Rota de Itens do Orçamento
 *
 * @description Este arquivo gerencia todas as operações (CRUD) relacionadas aos
 * itens do orçamento de um casamento. As rotas são protegidas e a maioria
 * exige permissão de edição para serem usadas.
 */

const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
// A linha duplicada que causava o erro foi removida daqui.
const router = express.Router();

// Aplica o middleware de autenticação a todas as rotas deste arquivo.
router.use(authMiddleware);

/**
 * Middleware de Permissão
 *
 * @description Conjunto de middlewares que verificam o nível de permissão
 * do usuário antes de permitir o acesso às rotas.
 */

/**
 * Verifica se o usuário tem acesso a um casamento específico.
 *
 * @param {object} req - O objeto da requisição.
 * @param {object} res - O objeto da resposta.
 * @param {function} next - A função para passar para o próximo middleware.
 * @returns {void}
 */
const canAccessWedding = async (req, res, next) => {
	try {
		// Pega o ID do casamento do corpo da requisição ou dos parâmetros da URL.
		const weddingId = req.params.weddingId || req.body.wedding_id;
		const userId = req.user.userId;

		// Se o ID do casamento não estiver presente, retorna um erro.
		if (!weddingId) {
			return res.status(400).json({ error: "O ID do casamento é obrigatório." });
		}

		// Verifica no banco de dados se o usuário está associado a este casamento.
		const permission = await db.query(
			"SELECT 1 FROM wedding_users WHERE user_id = $1 AND wedding_id = $2",
			[userId, weddingId]
		);

		// Se não houver associação, o acesso é negado.
		if (permission.rows.length === 0) {
			return res.status(403).json({ error: "Não tem permissão para aceder aos dados deste casamento." });
		}

		// Se tiver permissão, passa para a próxima função.
		next();
	} catch (error) {
		res.status(500).send('Erro no servidor');
	}
};

/**
 * Verifica se o usuário tem permissão de 'edição' para um casamento específico.
 *
 * @param {object} req - O objeto da requisição.
 * @param {object} res - O objeto da resposta.
 * @param {function} next - A função para passar para o próximo middleware.
 * @returns {void}
 */
const canEditByWeddingId = async (req, res, next) => {
	try {
		const weddingId = req.params.weddingId || req.body.wedding_id;
		const userId = req.user.userId;

		// Verifica se o usuário tem permissão de 'edit' para o casamento.
		const permission = await db.query(
			"SELECT 1 FROM wedding_users WHERE user_id = $1 AND wedding_id = $2 AND permission_level = 'edit'",
			[userId, weddingId]
		);

		// Se não tiver permissão, nega a operação.
		if (permission.rows.length === 0) {
			return res.status(403).json({ error: "Não tem permissão para modificar dados neste casamento." });
		}

		next();
	} catch (error) {
		res.status(500).send('Erro no servidor');
	}
};

/**
 * Verifica se o usuário tem permissão de 'edição' para um item específico.
 *
 * @param {object} req - O objeto da requisição.
 * @param {object} res - O objeto da resposta.
 * @param {function} next - A função para passar para o próximo middleware.
 * @returns {void}
 */
const canEditByItemId = async (req, res, next) => {
	try {
		const { itemId } = req.params;
		const userId = req.user.userId;

		// Busca o item, junta com a tabela de permissões e verifica se o usuário
		// tem permissão de 'edit' para o casamento ao qual o item pertence.
		const permission = await db.query(
			`SELECT 1 FROM budget_items bi 
			JOIN wedding_users wu ON bi.wedding_id = wu.wedding_id 
			WHERE bi.item_id = $1 AND wu.user_id = $2 AND wu.permission_level = 'edit'`,
			[itemId, userId]
		);

		if (permission.rows.length === 0) {
			return res.status(403).json({ error: 'Não tem permissão para modificar este item.' });
		}

		next();
	} catch (error) {
		res.status(500).send('Erro no servidor');
	}
};

/**
 * Função auxiliar
 *
 * @description Uma função que calcula o status de pagamento de cada item.
 */

/**
 * Adiciona o status de pagamento calculado aos itens do orçamento.
 *
 * @param {Array<object>} items - Uma lista de itens do orçamento.
 * @returns {Array<object>} A lista de itens com o novo campo 'payment_status'.
 */
const addComputedPaymentStatus = (items) => {
	// Mapeia cada item para adicionar a nova propriedade.
	return items.map(item => {
		let payment_status = 'Pendente';
		const finalValue = parseFloat(item.final_value || 0);
		const paidValue = parseFloat(item.paid_value || 0);

		// A lógica para definir o status de pagamento.
		if (item.decision_status === 'Contratado') {
			if (paidValue >= finalValue && finalValue > 0) {
				payment_status = 'Pago';
			} else if (paidValue > 0) {
				payment_status = 'Pago Parcialmente';
			}
		} else {
			payment_status = 'N/A';
		}
		
		// Retorna o item com o novo status.
		return { ...item, payment_status };
	});
};

// ---

/**
 * Rotas CRUD para Itens do Orçamento
 *
 * @description Endpoints para criar, ler, atualizar e deletar itens.
 */

/**
 * Rota para listar todos os itens de um casamento.
 *
 * @route GET /api/budget/wedding/:weddingId
 * @access Privado (requer acesso ao casamento)
 */
router.get('/wedding/:weddingId', canAccessWedding, async (req, res) => {
	try {
		const { weddingId } = req.params;
		const result = await db.query('SELECT * FROM budget_items WHERE wedding_id = $1 ORDER BY created_at DESC', [weddingId]);
		res.json(addComputedPaymentStatus(result.rows));
	} catch (error) {
		console.error("Erro ao listar itens:", error);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para listar itens de um fornecedor específico.
 *
 * @route GET /api/budget/vendor/:vendorId
 * @access Privado (requer acesso ao fornecedor)
 */
router.get('/vendor/:vendorId', async (req, res) => {
	try {
		const { vendorId } = req.params;
		const userId = req.user.userId;

		// Verifica se o usuário tem permissão para ver os itens deste fornecedor.
		const permission = await db.query(
			`SELECT 1 FROM vendors v 
			JOIN wedding_users wu ON v.wedding_id = wu.wedding_id 
			WHERE v.vendor_id = $1 AND wu.user_id = $2`,
			[vendorId, userId]
		);
		if (permission.rows.length === 0) {
			return res.status(403).json({ error: "Não tem permissão para ver os itens deste fornecedor." });
		}

		// Busca os itens do fornecedor.
		const result = await db.query('SELECT * FROM budget_items WHERE vendor_id = $1 ORDER BY created_at DESC', [vendorId]);
		res.json(addComputedPaymentStatus(result.rows));
	} catch (error) {
		console.error("Erro ao listar itens do fornecedor:", error);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para adicionar um novo item.
 *
 * @route POST /api/budget/wedding/:weddingId
 * @access Privado (requer permissão de edição)
 */
router.post('/wedding/:weddingId', canEditByWeddingId, async (req, res) => {
	try {
		const { weddingId } = req.params;
		const { category, description, final_value, decision_status, vendor_id, paid_value } = req.body;

		// Verifica se os campos obrigatórios estão preenchidos.
		if (!category || !final_value) {
			return res.status(400).json({ error: 'Categoria e Valor Final são obrigatórios.' });
		}
		
		// Insere o novo item no banco de dados.
		const newItem = await db.query(
			`INSERT INTO budget_items (wedding_id, category, description, final_value, paid_value, decision_status, vendor_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
			[weddingId, category, description, final_value, paid_value || 0, decision_status || 'Analisando', vendor_id || null]
		);
		
		// Retorna o item recém-criado com o status de pagamento calculado.
		res.status(201).json(addComputedPaymentStatus(newItem.rows)[0]);
	} catch (error) {
		console.error("Erro ao adicionar item:", error);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para alterar apenas o status de decisão de um item.
 *
 * @route PATCH /api/budget/:itemId/status
 * @access Privado (requer permissão de edição)
 */
router.patch('/:itemId/status', canEditByItemId, async (req, res) => {
	try {
		const { itemId } = req.params;
		const { decision_status } = req.body;

		// Verifica se o status enviado é válido.
		if (!['Contratado', 'Recusado', 'Analisando'].includes(decision_status)) {
			return res.status(400).json({ error: 'Status inválido.' });
		}

		// Atualiza o status do item no banco de dados.
		const updatedItem = await db.query(
			"UPDATE budget_items SET decision_status = $1, updated_at = now() WHERE item_id = $2 RETURNING *",
			[decision_status, itemId]
		);

		// Se o item não for encontrado, retorna um erro 404.
		if (updatedItem.rows.length === 0) {
			return res.status(404).json({ error: "Item não encontrado." });
		}

		// Retorna o item atualizado com o status de pagamento calculado.
		res.json(addComputedPaymentStatus(updatedItem.rows)[0]);
	} catch (error) {
		console.error("Erro ao atualizar status:", error);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para atualizar os detalhes de um item.
 *
 * @route PUT /api/budget/:itemId
 * @access Privado (requer permissão de edição)
 */
router.put('/:itemId', canEditByItemId, async (req, res) => {
	try {
		const { itemId } = req.params;
		const { category, description, final_value, paid_value, decision_status, vendor_id } = req.body;

		// Atualiza o item no banco de dados com os novos dados.
		const updatedItem = await db.query(
			`UPDATE budget_items SET category = $1, description = $2, final_value = $3, paid_value = $4, decision_status = $5, vendor_id = $6, updated_at = now()
			WHERE item_id = $7 RETURNING *`,
			[category, description, final_value, paid_value, decision_status, vendor_id, itemId]
		);

		// Se o item não for encontrado, retorna um erro.
		if (updatedItem.rows.length === 0) {
			return res.status(404).json({ error: "Item do orçamento não encontrado." });
		}

		// Retorna o item atualizado com o status de pagamento calculado.
		res.json(addComputedPaymentStatus(updatedItem.rows)[0]);
	} catch (error) {
		console.error("Erro ao atualizar item:", error);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para apagar um item.
 *
 * @route DELETE /api/budget/:itemId
 * @access Privado (requer permissão de edição)
 */
router.delete('/:itemId', canEditByItemId, async (req, res) => {
	try {
		const { itemId } = req.params;

		// Deleta o item do banco de dados.
		await db.query('DELETE FROM budget_items WHERE item_id = $1', [itemId]);

		// Retorna uma resposta de sucesso sem conteúdo.
		res.status(204).send();
	} catch (error) {
		console.error("Erro ao apagar item:", error);
		res.status(500).send('Erro no servidor');
	}
});

module.exports = router;