/**
 * Rota de Fornecedores
 *
 * @description Este arquivo gerencia todas as operações (CRUD) relacionadas aos
 * fornecedores de um casamento. As rotas são protegidas e exigem níveis de
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
 * @description Funções para validar o nível de acesso do usuário.
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
 * Verifica se o usuário tem permissão de 'edição' para um casamento,
 * com base no ID de um fornecedor.
 *
 * @param {object} req - O objeto da requisição.
 * @param {object} res - O objeto da resposta.
 * @param {function} next - A função para continuar para a próxima etapa.
 * @returns {void}
 */
const canEditWeddingByVendor = async (req, res, next) => {
	try {
		const vendorId = req.params.vendorId;
		const userId = req.user.userId;

		// Verifica se o usuário tem permissão de 'edit' para o casamento do fornecedor.
		const permission = await db.query(
			`SELECT 1 FROM vendors v 
			JOIN wedding_users wu ON v.wedding_id = wu.wedding_id 
			WHERE v.vendor_id = $1 AND wu.user_id = $2 AND wu.permission_level = 'edit'`,
			[vendorId, userId]
		);

		if (permission.rows.length === 0) {
			return res.status(403).json({ error: "Não tem permissão para editar dados neste casamento." });
		}

		next();
	} catch (error) {
		res.status(500).send('Erro no servidor');
	}
};

/**
 * Verifica se o usuário tem permissão de 'edição' para um casamento,
 * com base no ID do casamento.
 *
 * @param {object} req - O objeto da requisição.
 * @param {object} res - O objeto da resposta.
 * @param {function} next - A função para continuar para a próxima etapa.
 * @returns {void}
 */
const canEditByWeddingId = async (req, res, next) => {
	try {
		const weddingId = req.params.weddingId || req.body.wedding_id;
		const userId = req.user.userId;

		// Busca a permissão do usuário, verificando se o nível é 'edit'.
		const permission = await db.query(
			"SELECT 1 FROM wedding_users WHERE user_id = $1 AND wedding_id = $2 AND permission_level = 'edit'",
			[userId, weddingId]
		);

		if (permission.rows.length === 0) {
			return res.status(403).json({ error: "Não tem permissão para modificar dados neste casamento." });
		}

		next();
	} catch (error) {
		res.status(500).send('Erro no servidor');
	}
};

// ---

/**
 * Rotas CRUD para Fornecedores
 *
 * @description Endpoints para gerenciar a lista de fornecedores.
 */

/**
 * Rota para listar todos os fornecedores de um casamento, incluindo totais de orçamento.
 *
 * @route GET /api/vendors/wedding/:weddingId
 * @access Privado (requer acesso ao casamento)
 */
router.get('/wedding/:weddingId', canAccessWedding, async (req, res) => {
	try {
		const { weddingId } = req.params;

		// Busca todos os fornecedores de um casamento.
		const vendorsResult = await db.query(
			'SELECT * FROM vendors WHERE wedding_id = $1 ORDER BY category, vendor_name',
			[weddingId]
		);
		
		// Calcula os totais de orçamento para cada fornecedor.
		const budgetTotals = await db.query(
			`SELECT 
				vendor_id,
				COALESCE(SUM(final_value) FILTER (WHERE decision_status = 'Contratado'), 0) as total_contracted,
				COALESCE(SUM(paid_value) FILTER (WHERE decision_status = 'Contratado'), 0) as total_paid,
				COALESCE(SUM(final_value) FILTER (WHERE decision_status = 'Analisando'), 0) as total_quoted
			FROM budget_items 
			WHERE wedding_id = $1 AND vendor_id IS NOT NULL 
			GROUP BY vendor_id`,
			[weddingId]
		);
		
		// Cria um mapa para facilitar a busca dos totais pelo ID do fornecedor.
		const budgetMap = budgetTotals.rows.reduce((map, item) => {
			map[item.vendor_id] = {
				total_contracted: item.total_contracted,
				total_paid: item.total_paid,
				total_quoted: item.total_quoted
			};
			return map;
		}, {});
		
		// Combina os dados dos fornecedores com os totais de orçamento.
		const vendorsWithBudget = vendorsResult.rows.map(vendor => ({
			...vendor,
			total_contracted: budgetMap[vendor.vendor_id]?.total_contracted || '0.00',
			total_paid: budgetMap[vendor.vendor_id]?.total_paid || '0.00',
			total_quoted: budgetMap[vendor.vendor_id]?.total_quoted || '0.00'
		}));
		
		res.json(vendorsWithBudget);
	} catch (error) {
		console.error("Erro ao listar fornecedores:", error);
		res.status(500).send('Erro no servidor ao processar os dados.');
	}
});

/**
 * Rota para adicionar um novo fornecedor.
 *
 * @route POST /api/vendors/wedding/:weddingId
 * @access Privado (requer permissão de edição)
 */
router.post('/wedding/:weddingId', canEditByWeddingId, async (req, res) => {
	try {
		const { weddingId } = req.params;
		const { vendor_name, category, status, contact_name, phone, email, website, notes } = req.body;
		
		// Insere o novo fornecedor no banco de dados.
		const newVendor = await db.query(
			`INSERT INTO vendors (wedding_id, vendor_name, category, status, contact_name, phone, email, website, notes) 
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
			[weddingId, vendor_name, category, status, contact_name, phone, email, website, notes]
		);

		// Retorna o novo fornecedor com os totais de orçamento inicializados em zero.
		res.status(201).json({ ...newVendor.rows[0], total_contracted: '0.00', total_paid: '0.00', total_quoted: '0.00' });
	} catch (error) {
		console.error("Erro ao adicionar fornecedor:", error);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para atualizar um fornecedor.
 *
 * @route PUT /api/vendors/:vendorId
 * @access Privado (requer permissão de edição)
 */
router.put('/:vendorId', canEditWeddingByVendor, async (req, res) => {
	try {
		const { vendorId } = req.params;
		const { vendor_name, category, status, contact_name, phone, email, website, notes } = req.body;
		
		// Atualiza o fornecedor no banco de dados.
		const updatedVendor = await db.query(
			`UPDATE vendors SET vendor_name = $1, category = $2, status = $3, contact_name = $4, phone = $5, email = $6, website = $7, notes = $8, updated_at = now() 
			WHERE vendor_id = $9 RETURNING *`,
			[vendor_name, category, status, contact_name, phone, email, website, notes, vendorId]
		);
		
		res.json(updatedVendor.rows[0]);
	} catch (error) {
		console.error("Erro ao atualizar fornecedor:", error);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para apagar um fornecedor.
 *
 * @route DELETE /api/vendors/:vendorId
 * @access Privado (requer permissão de edição)
 */
router.delete('/:vendorId', canEditWeddingByVendor, async (req, res) => {
	try {
		const { vendorId } = req.params;

		// Deleta o fornecedor do banco de dados.
		await db.query('DELETE FROM vendors WHERE vendor_id = $1', [vendorId]);
		
		// Responde com um status 204 (sem conteúdo).
		res.status(204).send();
	} catch (error) {
		console.error("Erro ao apagar fornecedor:", error);
		res.status(500).send('Erro no servidor');
	}
});

module.exports = router;