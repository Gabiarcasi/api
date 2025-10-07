/**
 * Rota de Casamentos
 *
 * @description Este arquivo gerencia todas as operações (CRUD) relacionadas aos
 * casamentos. Ele lida com a criação de novos casamentos, listagem, atualização
 * de informações e a gestão do site público dos noivos.
 */

// Importa os módulos necessários
const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const { default: slugify } = require('slugify');
const router = express.Router();

// Aplica o middleware de autenticação a todas as rotas deste arquivo.
router.use(authMiddleware);

// ---

/**
 * Funções Auxiliares
 *
 * @description Funções úteis para o processamento das requisições.
 */

/**
 * Gera um slug único para o site do casamento.
 *
 * @param {string} groomName - O nome do noivo.
 * @param {string} brideName - O nome da noiva.
 * @returns {Promise<string>} O slug único gerado.
 */
const generateUniqueSlug = async (groomName, brideName) => {
	// Cria um slug base a partir dos nomes dos noivos.
	const baseSlug = slugify(`${brideName}-e-${groomName}`, { lower: true, strict: true });
	let slug = baseSlug;
	let suffix = 1;
	let existing;

	// Loop para verificar se o slug já existe e, se sim, adicionar um sufixo numérico.
	do {
		existing = await db.query('SELECT 1 FROM weddings WHERE website_slug = $1', [slug]);
		if (existing.rows.length > 0) {
			slug = `${baseSlug}-${suffix}`;
			suffix++;
		}
	} while (existing.rows.length > 0);

	return slug;
};

// ---

/**
 * Rotas de Casamentos
 *
 * @description Endpoints para gerenciar casamentos e seus dados.
 */

/**
 * Rota para criar um novo casamento.
 *
 * @route POST /api/weddings/
 * @access Privado (requer login)
 */
router.post('/', async (req, res) => {
	const ownerId = req.user.userId;
	try {
		const {
			groom_name, bride_name, wedding_date, wedding_style,
			color_palette, ceremony_location, ceremony_location_maps,
			reception_location, reception_location_maps, has_civil_ceremony,
			civil_ceremony_date, civil_ceremony_location, alternative_dates,
			estimated_guests, estimated_budget
		} = req.body;

		// Valida se os nomes dos noivos foram fornecidos.
		if (!groom_name || !bride_name) {
			return res.status(400).json({ error: "Os nomes dos noivos são obrigatórios." });
		}
		
		// Gera o slug único para o site.
		const website_slug = await generateUniqueSlug(groom_name, bride_name);

		// Inicia uma transação no banco de dados para garantir que ambas as operações sejam bem-sucedidas.
		await db.query('BEGIN');

		// 1. Insere o novo casamento na tabela 'weddings'.
		const newWeddingQuery = `
			INSERT INTO weddings (
				groom_name, bride_name, wedding_date, owner_id, website_slug, 
				color_palette, wedding_style, ceremony_location, ceremony_location_maps,
				reception_location, reception_location_maps, has_civil_ceremony,
				civil_ceremony_date, civil_ceremony_location, alternative_dates,
				estimated_guests, estimated_budget
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
			) RETURNING *
		`;
		const newWedding = await db.query(newWeddingQuery, [
			groom_name, bride_name, wedding_date || null, ownerId, website_slug,
			JSON.stringify(color_palette || []), wedding_style, ceremony_location, ceremony_location_maps,
			reception_location, reception_location_maps, has_civil_ceremony || false,
			civil_ceremony_date || null, civil_ceremony_location, JSON.stringify(alternative_dates || []),
			estimated_guests || null, estimated_budget || null
		]);

		const weddingId = newWedding.rows[0].wedding_id;

		// 2. Associa o criador do casamento à equipe de planejamento.
		await db.query(
			"INSERT INTO wedding_users (user_id, wedding_id, relationship, permission_level) VALUES ($1, $2, 'Noivo/Noiva', 'edit')",
			[ownerId, weddingId]
		);

		// Se ambas as operações forem bem-sucedidas, finaliza a transação.
		await db.query('COMMIT');

		// Retorna os dados do novo casamento.
		res.status(201).json(newWedding.rows[0]);

	} catch (error) {
		// Em caso de erro, desfaz a transação.
		await db.query('ROLLBACK');
		console.error("Erro ao criar casamento:", error.message);
		res.status(500).send('Erro no servidor ao criar casamento.');
	}
});

/**
 * Rota para buscar todos os casamentos de um usuário logado.
 *
 * @route GET /api/weddings/
 * @access Privado (requer login)
 */
router.get('/', async (req, res) => {
	try {
		const userId = req.user.userId;

		// --- ALTERAÇÃO AQUI ---
        // Adicionamos `wu.permission_level` para que o frontend saiba a permissão do usuário.
		const result = await db.query(
			`SELECT w.*, wu.permission_level FROM weddings w
			JOIN wedding_users wu ON w.wedding_id = wu.wedding_id
			WHERE wu.user_id = $1 ORDER BY w.created_at DESC`,
			[userId]
		);
		res.json(result.rows);
	} catch (error) {
		console.error(error.message);
		res.status(500).send('Erro no servidor');
	}
});

// ---

/**
 * Middleware de Permissão
 *
 * @description Função para validar o nível de acesso de edição.
 */

/**
 * Verifica se o usuário tem permissão para editar um casamento específico.
 *
 * @param {object} req - O objeto da requisição.
 * @param {object} res - O objeto da resposta.
 * @param {function} next - A função para continuar para a próxima etapa.
 * @returns {void}
 */
const canEditWedding = async (req, res, next) => {
	try {
		const { weddingId } = req.params;
		const userId = req.user.userId;

		// Verifica se o usuário tem o nível de permissão 'edit'.
		const permission = await db.query(
			"SELECT 1 FROM wedding_users WHERE user_id = $1 AND wedding_id = $2 AND permission_level = 'edit'",
			[userId, weddingId]
		);

		if (permission.rows.length === 0) {
			return res.status(403).json({ error: "Não tem permissão para editar este casamento." });
		}

		next();
	} catch (error) {
		res.status(500).send('Erro no servidor');
	}
};

// ---

/**
 * Rotas de Atualização e Site
 *
 * @description Endpoints para atualizar dados do casamento e do site público.
 */

/**
 * Rota para atualizar os detalhes de um casamento.
 *
 * @route PUT /api/weddings/:weddingId
 * @access Privado (requer permissão de edição)
 */
router.put('/:weddingId', canEditWedding, async (req, res) => {
	try {
		const { weddingId } = req.params;
		const {
			groom_name, bride_name, wedding_date, wedding_style, website_slug,
			color_palette, ceremony_location, ceremony_location_maps,
			reception_location, reception_location_maps, has_civil_ceremony,
			civil_ceremony_date, civil_ceremony_location, alternative_dates,
			estimated_guests, estimated_budget
		} = req.body;

		const updateQuery = `
			UPDATE weddings SET 
				groom_name = $1, bride_name = $2, wedding_date = $3, wedding_style = $4,
				website_slug = $5, color_palette = $6, ceremony_location = $7,
				ceremony_location_maps = $8, reception_location = $9,
				reception_location_maps = $10, has_civil_ceremony = $11,
				civil_ceremony_date = $12, civil_ceremony_location = $13,
				alternative_dates = $14, estimated_guests = $15, estimated_budget = $16,
				updated_at = now()
			WHERE wedding_id = $17 RETURNING *
		`;

		const updatedWedding = await db.query(updateQuery, [
			groom_name, bride_name, wedding_date || null, wedding_style, website_slug,
			JSON.stringify(color_palette || []), ceremony_location, ceremony_location_maps,
			reception_location, reception_location_maps, has_civil_ceremony || false,
			civil_ceremony_date || null, civil_ceremony_location, JSON.stringify(alternative_dates || []),
			estimated_guests || null, estimated_budget || null, weddingId
		]);

		res.json(updatedWedding.rows[0]);
	} catch (error) {
		// Captura o erro de slug duplicado.
		if (error.code === '23505' && error.constraint === 'weddings_website_slug_key') {
			return res.status(400).json({ error: 'Este URL para o site já está em uso. Por favor, escolha outro.' });
		}
		console.error("Erro ao atualizar casamento:", error.message);
		res.status(500).send('Erro no servidor ao atualizar casamento.');
	}
});

/**
 * Rota para salvar ou atualizar os detalhes do site público.
 *
 * @route PUT /api/weddings/:weddingId/site
 * @access Privado (requer permissão de edição)
 */
router.put('/:weddingId/site', canEditWedding, async (req, res) => {
	try {
		const { weddingId } = req.params;
		const { our_story } = req.body;

		// Usa 'ON CONFLICT' para inserir se não existir ou atualizar se já existir.
		const siteDetails = await db.query(
			`INSERT INTO wedding_site_details (wedding_id, our_story)
			VALUES ($1, $2)
			ON CONFLICT (wedding_id) DO UPDATE SET our_story = $2, updated_at = now()
			RETURNING *`,
			[weddingId, our_story]
		);

		res.json(siteDetails.rows[0]);
	} catch (error) {
		console.error("Erro ao salvar detalhes do site:", error);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para buscar os detalhes do site público.
 *
 * @route GET /api/weddings/:weddingId/site
 * @access Privado (requer acesso ao casamento)
 */
router.get('/:weddingId/site', async (req, res) => {
	try {
		const { weddingId } = req.params;
		const userId = req.user.userId;

		// Verifica se o usuário tem permissão de acesso ao casamento.
		const permission = await db.query(
			"SELECT 1 FROM wedding_users WHERE user_id = $1 AND wedding_id = $2",
			[userId, weddingId]
		);
		if (permission.rows.length === 0) {
			return res.status(403).json({ error: "Você não tem permissão para ver este site." });
		}
		
		// Busca os detalhes do site.
		const siteDetails = await db.query(
			"SELECT * FROM wedding_site_details WHERE wedding_id = $1",
			[weddingId]
		);
		
		// Retorna os dados encontrados ou um objeto vazio se não houver.
		res.json(siteDetails.rows[0] || {});
	} catch (error) {
		console.error("Erro ao buscar detalhes do site:", error);
		res.status(500).send('Erro no servidor');
	}
});

module.exports = router;