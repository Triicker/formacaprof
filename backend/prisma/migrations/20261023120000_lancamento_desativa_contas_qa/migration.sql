-- Lançamento: desativa as contas e escolas do período de testes (nada é apagado).
-- Mesmo efeito de `QA_SEED=sim npm run seed:qa -- --desativar`, aplicado uma única vez no deploy.
UPDATE "sessions" SET "revoked_at" = NOW()
WHERE "revoked_at" IS NULL
  AND "user_id" IN (SELECT "id" FROM "users" WHERE "email" LIKE '%@qa.formacaprof.test');

UPDATE "users" SET "status" = 'disabled' WHERE "email" LIKE '%@qa.formacaprof.test';

UPDATE "institutions" SET "status" = 'inactive' WHERE "slug" IN ('qa-escola-alfa', 'qa-escola-beta');
